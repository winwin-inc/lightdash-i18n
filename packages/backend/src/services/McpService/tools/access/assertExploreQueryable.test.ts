import type { SessionUser } from '@lightdash/common';
import {
    exploreQueryDenialReason,
    formatExploreQueryDeniedMessage,
    resetClassifiedExploresCacheForTests,
    assertExploreQueryable,
    type ExploreQueryDenialReason,
} from './assertExploreQueryable';
import type { ClassifiedExplores } from './classifyExplores';
import type { McpToolContext } from '../types';
import type { McpToolDeps } from '../deps';

/**
 * v1（packages/lightdash-mcp assertExploreQueryable.test.ts）对齐移植：
 * 判定分类、两套口径文案、缓存与阻断路径绕缓存重查。
 * 差异：数据源从 HTTP mock 改为进程内 service mock。
 */

const allowed = {
    name: 'pinleibaohsm_cls_top',
    label: '类目分析&TOP商品',
    groupLabel: '品类宝HSM',
};
const denied = {
    name: 'restricted_explore',
    label: '受限表',
    groupLabel: '其他',
};

const unknownScope = { scopeApplied: null, clientUseStatus: null };
const restrictedScope = { scopeApplied: true, clientUseStatus: 'rpc_ok' };

const queryableClassified: ClassifiedExplores = {
    queryable: [allowed],
    metadataOnly: [],
    attributeDenied: [denied],
    scope: unknownScope,
};

const metadataOnlyClassified: ClassifiedExplores = {
    queryable: [],
    metadataOnly: [allowed],
    attributeDenied: [],
    scope: unknownScope,
};

// 后端真实形态：白名单故障时 /explores 与 dataCatalog 一起被清空，
// attributeDenied 也是空的（见 ProjectService.filterExploresByViewerAllowList）
const scopeUnavailableClassified: ClassifiedExplores = {
    queryable: [],
    metadataOnly: [],
    attributeDenied: [],
    scope: { scopeApplied: true, clientUseStatus: 'rpc_error' },
};

describe('exploreQueryDenialReason', () => {
    it('allows queryable tables', () => {
        expect(
            exploreQueryDenialReason(queryableClassified, allowed.name),
        ).toBeNull();
    });

    it('rejects tables that exist but are not visible', () => {
        expect(
            exploreQueryDenialReason(queryableClassified, denied.name),
        ).toBe<ExploreQueryDenialReason>('not_visible');
    });

    it('reports unavailable authorization when the allow-list RPC failed', () => {
        // 必须先于 not_visible / unknown 判定：故障时 attributeDenied 恒为空
        expect(
            exploreQueryDenialReason(
                scopeUnavailableClassified,
                'any_table',
            ),
        ).toBe<ExploreQueryDenialReason>('authorization_unavailable');
    });

    it('rejects metadataOnly tables in metric mode', () => {
        expect(
            exploreQueryDenialReason(metadataOnlyClassified, allowed.name),
        ).toBe<ExploreQueryDenialReason>('no_run_metric_query');
    });

    it('allows metadataOnly tables in fieldValues mode', () => {
        expect(
            exploreQueryDenialReason(
                metadataOnlyClassified,
                allowed.name,
                'fieldValues',
            ),
        ).toBeNull();
    });

    it('rejects not-visible tables in fieldValues mode', () => {
        expect(
            exploreQueryDenialReason(
                queryableClassified,
                denied.name,
                'fieldValues',
            ),
        ).toBe<ExploreQueryDenialReason>('not_visible');
    });

    it('rejects unknown tables', () => {
        expect(
            exploreQueryDenialReason(queryableClassified, 'missing_table'),
        ).toBe<ExploreQueryDenialReason>('unknown_explore');
    });
});

describe('formatExploreQueryDeniedMessage', () => {
    it('speaks "no permission" to restricted (customer) roles', () => {
        const message = formatExploreQueryDeniedMessage(denied.name, 'not_visible', {
            restrictedScope: true,
        });
        expect(message).toContain('你的账号没有这张数据表的权限');
        expect(message).toContain('请联系客服开通权限');
        // 受控角色绝不能看到「表不存在」的说法
        expect(message).not.toContain('没有这张表，或目录尚未索引');
    });

    it('keeps admin-facing terms for non-restricted roles', () => {
        const message = formatExploreQueryDeniedMessage(denied.name, 'not_visible', {
            restrictedScope: false,
        });
        expect(message).toContain('用户属性不满足');
        expect(message).toContain('get_my_access 可复核能力位与可查表');
    });

    it('mentions dashboards for non-restricted roles only in strict mode', () => {
        const strictMessage = formatExploreQueryDeniedMessage(
            'missing_table',
            'unknown_explore',
            { restrictedScope: false, dashboardStrict: true },
        );
        expect(strictMessage).toContain('尚未绑定看板的数据集也会出现在这里');

        const plainMessage = formatExploreQueryDeniedMessage(
            'missing_table',
            'unknown_explore',
            { restrictedScope: false },
        );
        expect(plainMessage).not.toContain('看板');
    });

    it('stays neutral when the role scope is unknown (old diagnostics)', () => {
        const message = formatExploreQueryDeniedMessage(denied.name, 'not_visible', {
            restrictedScope: null,
        });
        expect(message).toContain('当前账号看不到这张表');
        // 未知时不得断言「不是权限问题」
        expect(message).not.toContain('该项目没有这张表');
    });

    it('never tells restricted roles the table does not exist', () => {
        const message = formatExploreQueryDeniedMessage('missing_table', 'unknown_explore', {
            restrictedScope: true,
        });
        expect(message).toContain('你的账号没有这张数据表的权限');
        expect(message).not.toContain('没有这张表');
    });

    it('guides restricted viewers to saved charts on no_run_metric_query', () => {
        const message = formatExploreQueryDeniedMessage(allowed.name, 'no_run_metric_query', {
            restrictedScope: true,
        });
        expect(message).toContain('查看者角色不支持临时查询');
        expect(message).toContain('改用已保存的图表 / 看板查询');
    });
});

/** 进程内 service mock：对齐 v1 createAccessApi 的能力 */
function createAccessFixtures(params: {
    runMetricQuery: boolean;
    explores: Array<{ name: string }>;
    catalog: Array<{ name: string }>;
    clientUse?: Record<string, unknown> | undefined;
    onCatalog?: () => void;
}): { deps: McpToolDeps; context: McpToolContext } {
    const exploreRule = {
        id: 0,
        action: 'view',
        subject: 'Explore',
        conditions: { projectUuid: 'project-1' },
        inverted: false,
        reason: '',
        fields: {},
        priority: 0,
    };
    const user = {
        userUuid: 'user-1',
        email: 'a@b.c',
        abilityRules: params.runMetricQuery ? [exploreRule] : [],
    };
    const context = {
        user: user as unknown as SessionUser,
        account: {} as never,
        ability: {} as never,
        organizationUuid: 'org-1',
    } as unknown as McpToolContext;

    const deps = {
        dashboardService: {
            getViewerContentScopeDiagnostics: jest
                .fn()
                .mockResolvedValue(params.clientUse),
        },
        projectService: {
            getAllExploresSummary: jest.fn().mockResolvedValue(params.explores),
        },
        projectModel: {
            getAllExploreSummaries: jest
                .fn()
                .mockResolvedValue(params.explores),
        },
        catalogService: {
            getCatalog: jest.fn().mockImplementation(() => {
                params.onCatalog?.();
                return Promise.resolve({
                    data: params.catalog.map((item) => ({
                        ...item,
                        type: 'table',
                    })),
                });
            }),
        },
    } as unknown as McpToolDeps;

    return { deps, context };
}

const assertWith = (
    fixtures: { deps: McpToolDeps; context: McpToolContext },
    exploreName: string,
    mode?: 'metric' | 'fieldValues',
    options?: { dashboardStrict?: boolean },
) =>
    assertExploreQueryable(
        fixtures.deps,
        fixtures.context,
        'project-1',
        exploreName,
        mode,
        options,
    );

describe('assertExploreQueryable (in-process)', () => {
    beforeEach(() => {
        resetClassifiedExploresCacheForTests();
    });

    it('rejects a restricted customer with the customer-facing copy', async () => {
        const fixtures = createAccessFixtures({
            runMetricQuery: true,
            explores: [allowed],
            catalog: [],
            clientUse: { scopeApplied: true, status: 'rpc_ok' },
        });
        await expect(
            assertWith(fixtures, allowed.name),
        ).rejects.toThrow('你的账号没有这张数据表的权限');
    });

    it('adds the strict-mode dashboard note for non-restricted roles', async () => {
        const fixtures = createAccessFixtures({
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
            clientUse: { scopeApplied: false, status: 'role_not_restricted' },
        });
        await expect(
            assertWith(fixtures, 'missing_table', 'metric', {
                dashboardStrict: true,
            }),
        ).rejects.toThrow('尚未绑定看板的数据集也会出现在这里');
    });

    it('reports authorization_unavailable when the diagnostics RPC failed', async () => {
        const fixtures = createAccessFixtures({
            runMetricQuery: true,
            explores: [allowed],
            catalog: [],
            clientUse: { scopeApplied: true, status: 'rpc_error' },
        });
        await expect(
            assertWith(fixtures, 'any_table'),
        ).rejects.toThrow('暂时无法确认');
    });

    it('re-checks with a fresh read before rejecting (cache bypass)', async () => {
        let catalogReads = 0;
        const fixtures = createAccessFixtures({
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
            onCatalog: () => {
                catalogReads += 1;
            },
        });
        await expect(assertWith(fixtures, denied.name)).rejects.toThrow();
        expect(catalogReads).toBe(2);
    });

    it('accepts a table that becomes visible while the first read is cached', async () => {
        let catalogReads = 0;
        const fixtures = createAccessFixtures({
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
            onCatalog: () => {
                catalogReads += 1;
            },
        });
        // 覆写目录：第一次读到旧目录（不含 denied），阻断路径重查时已修好
        (fixtures.deps.catalogService.getCatalog as jest.Mock).mockImplementation(
            () => {
                catalogReads += 1;
                return Promise.resolve({
                    data:
                        catalogReads === 1
                            ? [{ ...allowed, type: 'table' }]
                            : [
                                  { ...allowed, type: 'table' },
                                  { ...denied, type: 'table' },
                              ],
                });
            },
        );
        await expect(assertWith(fixtures, denied.name)).resolves.toBeUndefined();
        expect(catalogReads).toBe(2);
    });

    it('reuses classified explores within the TTL', async () => {
        let catalogCalls = 0;
        const fixtures = createAccessFixtures({
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
            onCatalog: () => {
                catalogCalls += 1;
            },
        });
        await expect(assertWith(fixtures, allowed.name)).resolves.toBeUndefined();
        await expect(assertWith(fixtures, allowed.name)).resolves.toBeUndefined();
        expect(catalogCalls).toBe(1);
    });
});

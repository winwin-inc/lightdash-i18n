import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import {
    assertExploreQueryable,
    exploreQueryDenialReason,
    formatExploreQueryDeniedMessage,
    resetClassifiedExploresCacheForTests,
} from './assertExploreQueryable';
import type { ClassifiedExplores } from './classifyExplores';

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

function exploreRule(projectUuid: string) {
    return {
        action: 'view',
        subject: 'Explore',
        conditions: { projectUuid },
    };
}

function createAccessApi(params: {
    projectUuid: string;
    runMetricQuery: boolean;
    explores: Array<{ name: string; label?: string; groupLabel?: string }>;
    catalog: Array<{ name: string; label?: string; groupLabel?: string }>;
    clientUse?: Record<string, unknown>;
    onCatalog?: () => void;
}): LightdashRestClient {
    return {
        getAuthenticatedUser: async () => ({
            abilityRules: params.runMetricQuery
                ? [exploreRule(params.projectUuid)]
                : [],
            ...(params.clientUse ? { clientUse: params.clientUse } : {}),
        }),
        listExplores: async () => params.explores,
        getCatalog: async () => {
            params.onCatalog?.();
            return { data: params.catalog };
        },
    } as unknown as LightdashRestClient;
}

describe('exploreQueryDenialReason', () => {
    it('allows queryable tables', () => {
        assert.equal(
            exploreQueryDenialReason(queryableClassified, allowed.name),
            null,
        );
    });

    it('rejects tables that exist but are not visible', () => {
        assert.equal(
            exploreQueryDenialReason(queryableClassified, denied.name),
            'not_visible',
        );
    });

    it('reports unavailable authorization when the allow-list RPC failed', () => {
        assert.equal(
            exploreQueryDenialReason(scopeUnavailableClassified, denied.name),
            'authorization_unavailable',
        );
    });

    it('rejects metadataOnly tables in metric mode', () => {
        assert.equal(
            exploreQueryDenialReason(metadataOnlyClassified, allowed.name),
            'no_run_metric_query',
        );
    });

    it('allows metadataOnly tables in fieldValues mode', () => {
        assert.equal(
            exploreQueryDenialReason(
                metadataOnlyClassified,
                allowed.name,
                'fieldValues',
            ),
            null,
        );
    });

    it('rejects not-visible tables in fieldValues mode', () => {
        assert.equal(
            exploreQueryDenialReason(
                queryableClassified,
                denied.name,
                'fieldValues',
            ),
            'not_visible',
        );
    });

    it('rejects unknown tables', () => {
        assert.equal(
            exploreQueryDenialReason(queryableClassified, 'missing_table'),
            'unknown_explore',
        );
    });
});

describe('formatExploreQueryDeniedMessage', () => {
    it('speaks "no permission" to restricted (customer) roles', () => {
        const message = formatExploreQueryDeniedMessage(
            denied.name,
            'not_visible',
            { restrictedScope: true },
        );
        assert.match(message, /「restricted_explore」当前不可查询/);
        assert.match(message, /没有这张数据表的权限/);
        assert.match(message, /联系客服开通权限/);
        assert.match(message, /explores\.queryable/);
        // 客户口径不下沉内部术语，也不带"可能…"的推测
        assert.doesNotMatch(message, /用户属性/);
        assert.doesNotMatch(message, /看板/);
        assert.doesNotMatch(message, /不存在/);
        assert.doesNotMatch(message, /可能/);
    });

    it('keeps admin-facing terms for non-restricted roles', () => {
        const message = formatExploreQueryDeniedMessage(
            denied.name,
            'not_visible',
            { restrictedScope: false },
        );
        assert.match(message, /已拒绝查询「restricted_explore」/);
        assert.match(message, /用户属性不满足/);
        assert.match(message, /未进目录/);
        // 非严格部署不提看板
        assert.doesNotMatch(message, /看板/);
    });

    it('mentions dashboards for non-restricted roles only in strict mode', () => {
        const message = formatExploreQueryDeniedMessage(
            denied.name,
            'not_visible',
            { restrictedScope: false, dashboardStrict: true },
        );
        assert.match(message, /看板的授权/);
    });

    it('stays neutral when the role scope is unknown (old backend)', () => {
        const message = formatExploreQueryDeniedMessage(
            denied.name,
            'not_visible',
            { restrictedScope: null },
        );
        assert.match(message, /当前账号看不到这张表/);
        assert.doesNotMatch(message, /用户属性/);
        assert.doesNotMatch(message, /不存在/);
    });

    it('never tells restricted roles the table does not exist', () => {
        const message = formatExploreQueryDeniedMessage(
            'missing_table',
            'unknown_explore',
            { restrictedScope: true },
        );
        assert.match(message, /当前不可查询/);
        assert.match(message, /没有这张数据表的权限/);
        assert.match(message, /联系客服开通权限/);
        assert.doesNotMatch(message, /不存在/);
        assert.doesNotMatch(message, /看板/);
        assert.doesNotMatch(message, /用户属性/);
        assert.doesNotMatch(message, /可能/);
    });

    it('tells non-restricted roles the table is missing or unindexed', () => {
        const message = formatExploreQueryDeniedMessage(
            'missing_table',
            'unknown_explore',
            { restrictedScope: false },
        );
        assert.match(message, /该项目没有这张表/);
        assert.doesNotMatch(message, /尚未绑定看板/);
    });

    it('adds the dashboard note for non-restricted roles in strict mode', () => {
        const message = formatExploreQueryDeniedMessage(
            'missing_table',
            'unknown_explore',
            { restrictedScope: false, dashboardStrict: true },
        );
        assert.match(message, /尚未绑定看板的数据集也会出现在这里/);
    });

    it('does not claim "not a permission problem" when the scope is unknown', () => {
        const message = formatExploreQueryDeniedMessage(
            'missing_table',
            'unknown_explore',
            { restrictedScope: null },
        );
        assert.doesNotMatch(message, /不存在/);
        assert.doesNotMatch(message, /不是权限问题/);
        assert.match(message, /当前账号看不到这张表/);
    });

    it('reports an authorization outage as a temporary failure', () => {
        const message = formatExploreQueryDeniedMessage(
            denied.name,
            'authorization_unavailable',
            { restrictedScope: true },
        );
        assert.match(message, /暂时无法确认/);
        assert.match(message, /稍后重试/);
        assert.doesNotMatch(message, /看板/);
        assert.doesNotMatch(message, /不存在/);
    });

    it('tells viewers how to proceed instead of only refusing', () => {
        const message = formatExploreQueryDeniedMessage(
            allowed.name,
            'no_run_metric_query',
        );
        assert.match(message, /查看者角色不支持临时指标查询/);
        assert.match(message, /run_saved_chart/);
        assert.match(message, /交互式查看者/);
        assert.doesNotMatch(message, /尚未绑定看板/);
    });
});

describe('assertExploreQueryable', () => {
    afterEach(() => {
        resetClassifiedExploresCacheForTests();
    });

    it('allows a catalog table when runMetricQuery is true', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.doesNotReject(() =>
            assertExploreQueryable(
                api,
                'key',
                'project-1',
                allowed.name,
            ),
        );
    });

    it('rejects an attributeDenied table', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    denied.name,
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /已拒绝查询「restricted_explore」/);
                assert.match(error.message, /用户属性不满足/);
                return true;
            },
        );
    });

    it('allows a catalog table in fieldValues mode when runMetricQuery is false', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.doesNotReject(() =>
            assertExploreQueryable(
                api,
                'key',
                'project-1',
                allowed.name,
                'fieldValues',
            ),
        );
    });

    it('rejects an attributeDenied table in fieldValues mode', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    denied.name,
                    'fieldValues',
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /用户属性不满足/);
                return true;
            },
        );
    });

    it('rejects an unknown table in fieldValues mode', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    'missing_table',
                    'fieldValues',
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /该项目没有这张表/);
                return true;
            },
        );
    });

    it('rejects a catalog table when runMetricQuery is false', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    allowed.name,
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /查看者角色不支持临时指标查询/);
                return true;
            },
        );
    });

    it('speaks "no permission" to restricted roles (client-use allow-list)', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
            clientUse: { scopeApplied: true, status: 'rpc_ok' },
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    denied.name,
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /当前不可查询/);
                assert.match(error.message, /没有这张数据表的权限/);
                assert.doesNotMatch(error.message, /用户属性/);
                assert.doesNotMatch(error.message, /不存在/);
                return true;
            },
        );
    });

    it('reports an authorization outage instead of "no permission"', async () => {
        // 后端真实形态：RPC 故障 → /explores 与 catalog 同时为空
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [],
            catalog: [],
            clientUse: { scopeApplied: true, status: 'rpc_error' },
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    denied.name,
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /暂时无法确认/);
                assert.match(error.message, /稍后重试/);
                return true;
            },
        );
    });

    it('adds the strict-mode dashboard note for non-restricted roles', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
            clientUse: { scopeApplied: false, status: 'role_not_restricted' },
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    'missing_table',
                    'metric',
                    { dashboardStrict: true },
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /该项目没有这张表/);
                assert.match(error.message, /尚未绑定看板的数据集也会出现在这里/);
                return true;
            },
        );
    });

    it('re-checks with a fresh read before rejecting (cache bypass)', async () => {
        let catalogReads = 0;
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
            onCatalog: () => {
                catalogReads += 1;
            },
        });
        // 第一次：缓存为空 → 拉取一次并判拒绝；阻断路径必须再拉一次
        await assert.rejects(() =>
            assertExploreQueryable(api, 'key', 'project-1', denied.name),
        );
        assert.equal(catalogReads, 2);
    });

    it('accepts a table that becomes visible while the first read is cached', async () => {
        let catalogReads = 0;
        const api = {
            getAuthenticatedUser: async () => ({
                abilityRules: [exploreRule('project-1')],
            }),
            listExplores: async () => [allowed, denied],
            getCatalog: async () => {
                catalogReads += 1;
                // 第一次读到的是旧目录（不含 denied），阻断路径重查时已修好
                return { data: catalogReads === 1 ? [allowed] : [allowed, denied] };
            },
        } as unknown as LightdashRestClient;
        await assert.doesNotReject(() =>
            assertExploreQueryable(api, 'key', 'project-1', denied.name),
        );
        assert.equal(catalogReads, 2);
    });

    it('rejects an unknown table', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    'missing_table',
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /该项目没有这张表/);
                return true;
            },
        );
    });

    it('reuses classified explores within the TTL', async () => {
        let catalogCalls = 0;
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
            onCatalog: () => {
                catalogCalls += 1;
            },
        });
        await assertExploreQueryable(api, 'key', 'project-1', allowed.name);
        await assertExploreQueryable(api, 'key', 'project-1', allowed.name);
        assert.equal(catalogCalls, 1);
    });
});

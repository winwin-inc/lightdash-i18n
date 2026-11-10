import { ForbiddenError, NotFoundError, SessionUser } from '@lightdash/common';
import {
    DASHBOARD_AUTO_RESOLVED_HINT,
    createRequiredDashboardGuard,
    formatDashboardAccessError,
    resetRequiredDashboardContextForTests,
} from './requiredDashboardContext';
import type { McpToolContext } from '../types';
import type { McpToolDeps } from '../deps';

/**
 * v1（packages/lightdash-mcp requiredDashboardContext.test.ts）对齐移植：
 * 显式 uuid / 反查分流、跨项目不回显、空结果绕缓存重查、预检缓存与
 * 查询执行阶段的 403/404 防御映射。
 * 差异：数据源从 HTTP mock 改为进程内 service mock（getDashboardContexts /
 * getByIdOrSlug），错误对象从 LightdashApiError 改为 ForbiddenError /
 * NotFoundError。
 */

const DASHBOARD_URL = (projectUuid: string, uuid: string) =>
    `https://example.com/projects/${projectUuid}/dashboards/${uuid}/view`;

const CONTEXT_ROW = (uuid: string, slug: string, name: string) => ({
    dashboardUuid: uuid,
    dashboardSlug: slug,
    dashboardName: name,
    chartUuids: ['c1'],
});

const D1 = CONTEXT_ROW('d1', 'slug-1', 'Dash 1');
const D2 = CONTEXT_ROW('d2', 'slug-2', 'Dash 2');

const OTHER_PROJECT_DASHBOARD = {
    uuid: 'd-other',
    slug: 'other',
    name: 'Other Project Dashboard',
    projectUuid: 'proj-other',
};

type MockDashboard = {
    uuid: string;
    slug: string;
    name: string;
    projectUuid: string;
};

type ContextsResponse = {
    contexts: Array<ReturnType<typeof CONTEXT_ROW>>;
    associatedCount?: number;
};

function createContext(): McpToolContext {
    return {
        user: { userUuid: 'user-1', email: 'a@b.c' } as unknown as SessionUser,
        account: {} as never,
        ability: {} as never,
        organizationUuid: 'org-1',
    } as unknown as McpToolContext;
}

/** 进程内 service mock：对齐 v1 createMockApi 的能力 */
function createGuardFixtures(options: {
    /** 反查返回（可按调用次数变化；associatedCount 省略 = 模拟后端未升级） */
    contexts?:
        | ContextsResponse
        | ((calls: number) => ContextsResponse | Promise<ContextsResponse>);
    /** 预检返回的看板或抛出的错误 */
    dashboard?: MockDashboard | Error;
}): {
    deps: McpToolDeps;
    context: McpToolContext;
    guard: ReturnType<typeof createRequiredDashboardGuard>;
    getDashboardContexts: jest.Mock;
    getByIdOrSlug: jest.Mock;
} {
    let contextsCalls = 0;
    const getDashboardContexts = jest.fn().mockImplementation(() => {
        contextsCalls += 1;
        const raw =
            typeof options.contexts === 'function'
                ? options.contexts(contextsCalls)
                : options.contexts;
        return Promise.resolve(raw ?? { contexts: [] });
    });
    const getByIdOrSlug = jest.fn().mockImplementation(() => {
        if (options.dashboard instanceof Error) {
            return Promise.reject(options.dashboard);
        }
        if (options.dashboard) {
            return Promise.resolve(options.dashboard);
        }
        return Promise.reject(new NotFoundError('Dashboard not found'));
    });

    const deps = {
        lightdashConfig: {
            siteUrl: 'https://example.com',
            mcp: { dashboardContact: '请联系客服开通看板访问权限。' },
        },
        dashboardService: { getDashboardContexts, getByIdOrSlug },
    } as unknown as McpToolDeps;

    return {
        deps,
        context: createContext(),
        guard: createRequiredDashboardGuard(deps),
        getDashboardContexts,
        getByIdOrSlug,
    };
}

function structured(result: {
    content: unknown;
    structuredContent?: unknown;
}): Record<string, unknown> {
    return result.structuredContent as Record<string, unknown>;
}

const ensureWith = (
    fixtures: { guard: ReturnType<typeof createRequiredDashboardGuard>; context: McpToolContext },
    params: Parameters<ReturnType<typeof createRequiredDashboardGuard>['ensure']>[1],
) => fixtures.guard.ensure(fixtures.context, params);

beforeEach(() => {
    resetRequiredDashboardContextForTests();
});

describe('createRequiredDashboardGuard - explicit dashboardUuid', () => {
    it('accepts an explicit dashboard that belongs to the explore (no preflight call)', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
            dashboard: {
                uuid: 'd1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: 'proj',
            },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd1',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.context.dashboardUuid).toBe('d1');
            expect(result.context.dashboardSlug).toBe('slug-1');
            expect(result.context.dashboardName).toBe('Dash 1');
            expect(result.context.source).toBe('explicitDashboardUuid');
            expect(result.context.dashboardUrl).toBe(
                DASHBOARD_URL('proj', 'd1'),
            );
        }
        // 命中关联候选时不调 getByIdOrSlug（该 service 会写浏览记录）
        expect(fixtures.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it('blocks with dashboard_configuration_required when nothing is linked', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 0 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd1',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_configuration_required');
            const payload = structured(result.result);
            expect(payload.action).toBe('configure_dashboard');
            expect(payload.associatedCount).toBe(0);
            expect(payload.source).toBe('exploreName');
            expect(payload.exploreName).toBe('orders');
            expect(payload.contact).toBe('请联系客服开通看板访问权限。');
            expect(String(payload.message)).toBe(
                '「orders」还没有绑定任何看板，需要先绑定看板才能查询。',
            );
            // 面向调用方不提内部开关概念
            expect(String(payload.message)).not.toMatch(
                /强制看板模式|MCP_DASHBOARD_STRICT/,
            );
            expect(String(payload.hint)).toMatch(/约 60 秒内生效/);
            expect(String(payload.hint)).toMatch(/管理员/);
            expect(String(payload.hint)).toMatch(/客户/);
        }
        expect(fixtures.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it('blocks with dashboard_permission_required when the pre-check is ForbiddenError', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 1 },
            dashboard: new ForbiddenError(
                "You don't have access to this dashboard",
            ),
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-forbidden',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_permission_required');
            const payload = structured(result.result);
            expect(payload.status).toBe('dashboard_permission_required');
            expect(payload.action).toBe('request_dashboard_access');
            expect(payload.dashboardUuid).toBe('d-forbidden');
            expect(payload.dashboardUrl).toBe(
                DASHBOARD_URL('proj', 'd-forbidden'),
            );
            expect(payload.contact).toBe('请联系客服开通看板访问权限。');
            expect(String(payload.detail)).toMatch(/access to this dashboard/);
            expect(result.result.isError).toBe(true);
        }
    });

    it('blocks with dashboard_not_found when the pre-check is NotFoundError', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 1 },
            dashboard: new NotFoundError('Dashboard not found'),
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-missing',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_not_found');
            const payload = structured(result.result);
            expect(payload.action).toBe('verify_dashboard_uuid');
            expect(payload.dashboardUuid).toBe('d-missing');
            expect(String(payload.message)).toBe(
                '没有找到这个看板，或它不属于当前项目。',
            );
        }
    });

    it('blocks with dashboard_not_found when the dashboard belongs to another project', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
            dashboard: OTHER_PROJECT_DASHBOARD,
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_not_found');
            const payload = structured(result.result);
            expect(payload.dashboardUuid).toBe('d-other');
            expect(payload.detail).toBe('Dashboard does not belong to project');
            // 跨项目不得回显看板内容
            expect(payload.dashboardName).toBeUndefined();
            expect(payload.tiles).toBeUndefined();
        }
    });

    it('resolves a slug input via the canonical uuid returned by getByIdOrSlug', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
            dashboard: {
                uuid: 'd1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: 'proj',
            },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'slug-1',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.context.dashboardUuid).toBe('d1');
            expect(result.context.dashboardSlug).toBe('slug-1');
        }
    });

    it('blocks with dashboard_not_found + candidates when the dashboard is not linked to the explore', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1, D2], associatedCount: 3 },
            dashboard: {
                uuid: 'd-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: 'proj',
            },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_not_found');
            const payload = structured(result.result);
            expect(payload.action).toBe('verify_dashboard_uuid');
            const candidates = payload.candidates as Array<
                Record<string, unknown>
            >;
            expect(candidates.length).toBe(2);
            expect(candidates[0].dashboardUrl).toBe(DASHBOARD_URL('proj', 'd1'));
        }
    });

    it('fails closed with dashboard_context_unavailable when associatedCount is missing', async () => {
        const fixtures = createGuardFixtures({
            // 后端未升级：响应里没有 associatedCount
            contexts: { contexts: [] },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_context_unavailable');
            expect(structured(result.result).action).toBe('retry_later');
        }
        expect(fixtures.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it('requires exploreName or chartUuid to validate an explicit dashboardUuid', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_context_unavailable');
            const payload = structured(result.result);
            expect(payload.message).toBe(
                '需要提供 exploreName 或 chartUuid，才能确定本次查询对应的看板。',
            );
            expect(payload.hint).toBe(
                '请在工具参数里带上 exploreName 或 chartUuid 后重试。',
            );
        }
    });
});

describe('createRequiredDashboardGuard - reverse lookup', () => {
    it('auto-resolves a unique related dashboard', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.context.dashboardUuid).toBe('d1');
            expect(result.context.source).toBe('uniqueExploreContext');
            expect(result.context.candidateCount).toBe(1);
            expect(result.context.dashboardUrl).toBe(DASHBOARD_URL('proj', 'd1'));
        }
    });

    it('auto-resolves a unique related dashboard for a chartUuid input', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            chartUuid: 'c1',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.context.source).toBe('uniqueChartContext');
        }
    });

    it('blocks with dashboard_selection_required when several dashboards match (not an error)', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1, D2], associatedCount: 2 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            chartUuid: 'c1',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_selection_required');
            const payload = structured(result.result);
            expect(payload.action).toBe('select_dashboard');
            expect(payload.source).toBe('chartUuid');
            expect(payload.candidateCount).toBe(2);
            expect(String(payload.message)).toBe(
                '该图表存在于多个看板，请选一个后重试。',
            );
            const candidates = payload.candidates as Array<
                Record<string, unknown>
            >;
            expect(candidates[1].dashboardUrl).toBe(DASHBOARD_URL('proj', 'd2'));
            expect(String(payload.hint)).toContain(DASHBOARD_AUTO_RESOLVED_HINT);
            // 多候选不算错误
            expect(result.result.isError).toBeUndefined();
        }
    });

    it('uses the explore-specific message when several dashboards match an explore', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1, D2], associatedCount: 2 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(String(structured(result.result).message)).toBe(
                '「orders」关联了多个看板，请选一个后重试。',
            );
        }
    });

    it('blocks with dashboard_configuration_required when nothing is linked', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 0 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_configuration_required');
            const payload = structured(result.result);
            expect(payload.associatedCount).toBe(0);
            expect('note' in payload).toBe(false);
        }
    });

    it('blocks with dashboard_permission_required when dashboards exist but none is visible', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 3 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_permission_required');
            const payload = structured(result.result);
            expect(payload.action).toBe('request_dashboard_access');
            expect(payload.associatedCount).toBe(3);
            expect(payload.message).toBe(
                '该数据集关联了 3 张看板，但你的账号看不到其中任何一张。',
            );
            expect(payload.dashboardUuid).toBeNull();
            expect(payload.dashboardUrl).toBeNull();
            expect(payload.contact).toBe('请联系客服开通看板访问权限。');
        }
    });

    it('fails closed with dashboard_context_unavailable when associatedCount is missing', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [] },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_context_unavailable');
            const payload = structured(result.result);
            expect(payload.action).toBe('retry_later');
            expect(payload.message).toBe(
                '后端未返回关联看板数量，无法判断是“没配看板”还是“没有权限”，已阻断本次查询。',
            );
            // 不得落成 configuration_required（后端没升级 ≠ 没配看板）
            expect(payload.status).not.toBe('dashboard_configuration_required');
        }
    });

    it('reports dashboard_context_unavailable when the reverse lookup itself fails', async () => {
        const getDashboardContexts = jest
            .fn()
            .mockRejectedValue(new Error('db down'));
        const deps = {
            lightdashConfig: {
                siteUrl: 'https://example.com',
                mcp: { dashboardContact: '请联系客服开通看板访问权限。' },
            },
            dashboardService: { getDashboardContexts },
        } as unknown as McpToolDeps;
        const guard = createRequiredDashboardGuard(deps);
        const result = await guard.ensure(createContext(), {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe('dashboard_context_unavailable');
            const payload = structured(result.result);
            expect(payload.action).toBe('retry_later');
            expect(payload.message).toBe(
                '暂时无法确认看板信息，本次查询已停止（网络或服务临时故障）。',
            );
            expect(payload.detail).toBe('db down');
        }
    });

    it('re-queries bypassing the cache when the first (cached-empty) read misses the new dashboard', async () => {
        // 第一次读到旧结果（空），阻断路径绕过缓存重查时看板已挂上 → 命中
        const fixtures = createGuardFixtures({
            contexts: (calls: number) =>
                calls === 1
                    ? { contexts: [], associatedCount: 1 }
                    : { contexts: [D1], associatedCount: 1 },
            dashboard: {
                uuid: 'd1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: 'proj',
            },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd1',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.context.dashboardUuid).toBe('d1');
            expect(result.context.source).toBe('explicitDashboardUuid');
        }
        // 首次 + 绕过缓存重查一次
        expect(fixtures.getDashboardContexts).toHaveBeenCalledTimes(2);
        expect(fixtures.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it('re-queries bypassing the cache on the blocking path (still empty)', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 0 },
        });
        const result = await ensureWith(fixtures, {
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        expect(result.ok).toBe(false);
        // 首次 + 绕过缓存重查一次
        expect(fixtures.getDashboardContexts).toHaveBeenCalledTimes(2);
    });

    it('reuses the cached reverse-lookup result within the TTL', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [D1], associatedCount: 1 },
        });
        await ensureWith(fixtures, { projectUuid: 'proj', exploreName: 'orders' });
        await ensureWith(fixtures, { projectUuid: 'proj', exploreName: 'orders' });
        expect(fixtures.getDashboardContexts).toHaveBeenCalledTimes(1);
    });
});

describe('preflight cache', () => {
    it('caches a successful preflight per user+dashboard for 60s', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 1 },
            dashboard: {
                uuid: 'd-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: 'proj',
            },
        });
        const first = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        const second = await ensureWith(fixtures, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        expect(first.ok).toBe(false);
        expect(second.ok).toBe(false);
        // 预检结果（未关联 → not_found）在 60s 内复用
        expect(fixtures.getByIdOrSlug).toHaveBeenCalledTimes(1);
    });

    it('does not share cache across users', async () => {
        const fixtures = createGuardFixtures({
            contexts: { contexts: [], associatedCount: 1 },
            dashboard: {
                uuid: 'd-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: 'proj',
            },
        });
        const otherContext = {
            ...createContext(),
            user: { userUuid: 'user-2' } as unknown as SessionUser,
        } as unknown as McpToolContext;
        await fixtures.guard.ensure(fixtures.context, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        await fixtures.guard.ensure(otherContext, {
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        expect(fixtures.getByIdOrSlug).toHaveBeenCalledTimes(2);
    });
});

describe('formatDashboardAccessError', () => {
    beforeEach(() => {
        // 建一次 guard：让 formatter 能拿到登记的 contact / publicBaseUrl
        createGuardFixtures({});
    });

    it('maps a dashboard ForbiddenError to dashboard_permission_required', () => {
        const result = formatDashboardAccessError({
            error: new ForbiddenError(
                "You don't have access to this dashboard",
            ),
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        expect(result).not.toBeNull();
        if (result) {
            const payload = structured(result);
            expect(payload.status).toBe('dashboard_permission_required');
            expect(payload.action).toBe('request_dashboard_access');
            expect(payload.dashboardUrl).toBe(DASHBOARD_URL('proj', 'd1'));
            expect(payload.contact).toBe('请联系客服开通看板访问权限。');
            expect(result.isError).toBe(true);
        }
    });

    it('maps "does not belong to project" 403 to dashboard_not_found', () => {
        const result = formatDashboardAccessError({
            error: new ForbiddenError('Dashboard does not belong to project'),
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        expect(result).not.toBeNull();
        if (result) {
            const payload = structured(result);
            expect(payload.status).toBe('dashboard_not_found');
            expect(payload.action).toBe('verify_dashboard_uuid');
        }
    });

    it('maps a dashboard NotFoundError to dashboard_not_found', () => {
        const result = formatDashboardAccessError({
            error: new NotFoundError('Dashboard not found'),
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        expect(result).not.toBeNull();
        if (result) {
            expect(structured(result).status).toBe('dashboard_not_found');
        }
    });

    it('returns null for errors that are not dashboard related', () => {
        expect(
            formatDashboardAccessError({
                error: new Error('boom'),
                projectUuid: 'proj',
                dashboardUuid: 'd1',
            }),
        ).toBeNull();
        expect(
            formatDashboardAccessError({
                // 404 但不是看板类（空间不存在）
                error: new NotFoundError('Space not found'),
                projectUuid: 'proj',
                dashboardUuid: 'd1',
            }),
        ).toBeNull();
        expect(
            formatDashboardAccessError({
                error: new NotFoundError('Dashboard not found'),
                projectUuid: null,
                dashboardUuid: null,
            }),
        ).not.toBeNull();
    });

    it('omits the dashboard link when projectUuid is unavailable', () => {
        const result = formatDashboardAccessError({
            error: new NotFoundError('Dashboard not found'),
            projectUuid: null,
            dashboardUuid: 'd1',
        });
        expect(result).not.toBeNull();
        if (result) {
            expect(structured(result).dashboardUrl).toBeNull();
        }
    });

    it('falls back to the default contact when no guard was created', () => {
        resetRequiredDashboardContextForTests();
        const result = formatDashboardAccessError({
            error: new ForbiddenError(
                "You don't have access to this dashboard",
            ),
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        expect(result).not.toBeNull();
        if (result) {
            expect(structured(result).contact).toBe(
                '请联系客服开通看板访问权限。',
            );
            // 未登记 publicBaseUrl 时不生成链接
            expect(structured(result).dashboardUrl).toBeNull();
        }
    });
});

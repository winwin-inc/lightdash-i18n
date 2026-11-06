import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import { LightdashApiError } from '../rest/requestBase';
import { createDashboardContextResolver } from './dashboardContextResolver';
import {
    createRequiredDashboardGuard,
    formatDashboardAccessError,
    resetRequiredDashboardContextForTests,
} from './requiredDashboardContext';

const config: LightdashMcpEnvConfig = {
    baseUrl: 'https://example.com',
    publicBaseUrl: 'https://example.com',
    apiKey: undefined,
    defaultProjectUuid: null,
    maxLimit: 5000,
    oauthEnabled: false,
    oauthIntrospectUrl: 'https://example.com/api/v1/oauth/introspect',
    oauthRequiredScopes: ['mcp:read'],
    oauthResourceMetadataUrl:
        'https://example.com/api/v1/oauth/.well-known/oauth-protected-resource',
    maxSessions: 100,
    softSessionsPerOwner: 10,
    maxSessionsPerOwner: 20,
    lruMinIdleMs: 300_000,
    sessionTtlMs: 900_000,
    pruneIntervalMs: 300_000,
    dashboardStrict: true,
    dashboardContact: '请联系客服开通看板访问权限。',
};

type MockDashboard = {
    uuid: string;
    slug: string;
    name: string;
    projectUuid: string;
};

type MockContext = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    chartUuids: string[];
};

function createMockApi(options: {
    dashboard?: MockDashboard | Error;
    contexts?: MockContext[];
    associatedCount?: number;
}) {
    return {
        getDashboard: async () => {
            if (options.dashboard instanceof Error) {
                throw options.dashboard;
            }
            return options.dashboard;
        },
        getDashboardContexts: async () => ({
            contexts: options.contexts ?? [],
            associatedCount: options.associatedCount,
        }),
    };
}

function createGuard(api: ReturnType<typeof createMockApi>) {
    const resolver = createDashboardContextResolver(api as never);
    return createRequiredDashboardGuard(api as never, config, resolver);
}

function structured(result: {
    content: unknown;
    structuredContent?: unknown;
}): Record<string, unknown> {
    return result.structuredContent as Record<string, unknown>;
}

beforeEach(() => {
    resetRequiredDashboardContextForTests();
});

describe('createRequiredDashboardGuard - explicit dashboardUuid', () => {
    it('accepts an explicit dashboard that belongs to the project and to the explore', async () => {
        const api = createMockApi({
            dashboard: {
                uuid: 'd1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: 'proj',
            },
            contexts: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['c1'],
                },
            ],
            associatedCount: 1,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd1',
            exploreName: 'orders',
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.context.dashboardUuid, 'd1');
            assert.equal(result.context.dashboardSlug, 'slug-1');
            assert.equal(result.context.dashboardName, 'Dash 1');
            assert.equal(result.context.source, 'explicitDashboardUuid');
            assert.equal(
                result.context.dashboardUrl,
                'https://example.com/projects/proj/dashboards/d1/view',
            );
        }
    });

    it('blocks with dashboard_permission_required when the pre-check is 403', async () => {
        const api = createMockApi({
            dashboard: new LightdashApiError(
                403,
                "You don't have access to this dashboard",
            ),
            contexts: [],
            associatedCount: 1,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd-forbidden',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_permission_required');
            const payload = structured(result.result);
            assert.equal(payload.status, 'dashboard_permission_required');
            assert.equal(payload.action, 'request_dashboard_access');
            assert.equal(payload.dashboardUuid, 'd-forbidden');
            assert.equal(
                payload.dashboardUrl,
                'https://example.com/projects/proj/dashboards/d-forbidden/view',
            );
            assert.equal(payload.contact, config.dashboardContact);
            assert.match(String(payload.detail), /access to this dashboard/);
            assert.equal(result.result.isError, true);
        }
    });

    it('blocks with dashboard_not_found when the pre-check is 404', async () => {
        const api = createMockApi({
            dashboard: new LightdashApiError(404, 'Dashboard not found'),
            contexts: [],
            associatedCount: 1,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd-missing',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_not_found');
            const payload = structured(result.result);
            assert.equal(payload.action, 'verify_dashboard_uuid');
            assert.equal(payload.dashboardUuid, 'd-missing');
        }
    });

    it('blocks with dashboard_not_found when the dashboard belongs to another project', async () => {
        const api = createMockApi({
            dashboard: {
                uuid: 'd-other',
                slug: 'other',
                name: 'Other Project Dashboard',
                projectUuid: 'proj-other',
            },
            contexts: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['c1'],
                },
            ],
            associatedCount: 1,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_not_found');
            const payload = structured(result.result);
            assert.equal(payload.dashboardUuid, 'd-other');
            // 跨项目不得回显看板内容
            assert.equal(payload.dashboardName, undefined);
            assert.equal(payload.tiles, undefined);
        }
    });

    it('blocks with dashboard_configuration_required when the explore has no dashboard at all', async () => {
        const api = createMockApi({
            dashboard: {
                uuid: 'd1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: 'proj',
            },
            contexts: [],
            associatedCount: 0,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd1',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_configuration_required');
            const payload = structured(result.result);
            assert.equal(payload.action, 'configure_dashboard');
            assert.equal(payload.associatedCount, 0);
            assert.equal(payload.source, 'exploreName');
            assert.equal(payload.exploreName, 'orders');
            assert.equal(payload.contact, config.dashboardContact);
        }
    });

    it('does not fetch the dashboard when the uuid already matches an associated dashboard', async () => {
        let dashboardCalls = 0;
        const api = {
            getDashboard: async () => {
                dashboardCalls += 1;
                return {
                    uuid: 'd1',
                    slug: 'slug-1',
                    name: 'Dash 1',
                    projectUuid: 'proj',
                };
            },
            getDashboardContexts: async () => ({
                contexts: [
                    {
                        dashboardUuid: 'd1',
                        dashboardSlug: 'slug-1',
                        dashboardName: 'Dash 1',
                        chartUuids: ['c1'],
                    },
                ],
                associatedCount: 1,
            }),
        };
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd1',
            exploreName: 'orders',
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.context.dashboardUuid, 'd1');
            assert.equal(result.context.dashboardSlug, 'slug-1');
            assert.equal(result.context.dashboardName, 'Dash 1');
        }
        // 命中关联候选时不调用 GET /dashboards/{uuid}（该接口会写浏览记录）
        assert.equal(dashboardCalls, 0);
    });

    it('resolves a slug input via the canonical uuid returned by getDashboard', async () => {
        const api = createMockApi({
            dashboard: {
                uuid: 'd1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: 'proj',
            },
            contexts: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['c1'],
                },
            ],
            associatedCount: 1,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'slug-1',
            exploreName: 'orders',
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.context.dashboardUuid, 'd1');
            assert.equal(result.context.dashboardSlug, 'slug-1');
        }
    });

    it('blocks with dashboard_not_found + candidates when the dashboard is not linked to the explore', async () => {
        const api = createMockApi({
            dashboard: {
                uuid: 'd-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: 'proj',
            },
            contexts: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['c1'],
                },
                {
                    dashboardUuid: 'd2',
                    dashboardSlug: 'slug-2',
                    dashboardName: 'Dash 2',
                    chartUuids: ['c1'],
                },
            ],
            associatedCount: 3,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_not_found');
            const payload = structured(result.result);
            assert.equal(payload.action, 'verify_dashboard_uuid');
            const candidates = payload.candidates as Array<
                Record<string, unknown>
            >;
            assert.equal(candidates.length, 2);
            assert.equal(
                candidates[0].dashboardUrl,
                'https://example.com/projects/proj/dashboards/d1/view',
            );
        }
    });

    it('fails closed with dashboard_context_unavailable when associatedCount is missing', async () => {
        const api = createMockApi({
            dashboard: {
                uuid: 'd-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: 'proj',
            },
            contexts: [],
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'd-other',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_context_unavailable');
            assert.equal(structured(result.result).action, 'retry_later');
        }
    });
});

describe('createRequiredDashboardGuard - reverse lookup', () => {
    it('auto-resolves a unique related dashboard', async () => {
        const api = createMockApi({
            contexts: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['c1'],
                },
            ],
            associatedCount: 1,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.context.dashboardUuid, 'd1');
            assert.equal(result.context.source, 'uniqueExploreContext');
            assert.equal(result.context.candidateCount, 1);
            assert.equal(
                result.context.dashboardUrl,
                'https://example.com/projects/proj/dashboards/d1/view',
            );
        }
    });

    it('blocks with dashboard_selection_required when several dashboards match', async () => {
        const api = createMockApi({
            contexts: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['c1'],
                },
                {
                    dashboardUuid: 'd2',
                    dashboardSlug: 'slug-2',
                    dashboardName: 'Dash 2',
                    chartUuids: ['c1'],
                },
            ],
            associatedCount: 2,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            chartUuid: 'c1',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_selection_required');
            const payload = structured(result.result);
            assert.equal(payload.action, 'select_dashboard');
            assert.equal(payload.source, 'chartUuid');
            assert.equal(payload.candidateCount, 2);
            const candidates = payload.candidates as Array<
                Record<string, unknown>
            >;
            assert.equal(
                candidates[1].dashboardUrl,
                'https://example.com/projects/proj/dashboards/d2/view',
            );
            // 多候选不算错误
            assert.equal(result.result.isError, undefined);
        }
    });

    it('blocks with dashboard_configuration_required when nothing is linked', async () => {
        const api = createMockApi({
            contexts: [],
            associatedCount: 0,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_configuration_required');
            const payload = structured(result.result);
            assert.equal(payload.associatedCount, 0);
            assert.match(
                String(payload.message),
                /还没有绑定任何看板，需要先绑定看板才能查询/,
            );
            // 面向调用方不提内部开关概念
            assert.doesNotMatch(
                String(payload.message),
                /强制看板模式|MCP_DASHBOARD_STRICT/,
            );
            assert.match(String(payload.hint), /约 60 秒内生效/);
            assert.match(String(payload.hint), /管理员/);
            assert.match(String(payload.hint), /客户/);
            assert.equal('note' in payload, false);
        }
    });

    it('blocks with dashboard_permission_required when dashboards exist but none is visible', async () => {
        const api = createMockApi({
            contexts: [],
            associatedCount: 3,
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_permission_required');
            const payload = structured(result.result);
            assert.equal(payload.action, 'request_dashboard_access');
            assert.equal(payload.associatedCount, 3);
            assert.equal(payload.dashboardUuid, null);
            assert.equal(payload.dashboardUrl, null);
            assert.equal(payload.contact, config.dashboardContact);
        }
    });

    it('fails closed with dashboard_context_unavailable when associatedCount is missing', async () => {
        const api = createMockApi({
            contexts: [],
        });
        const guard = createGuard(api);
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 'dashboard_context_unavailable');
            const payload = structured(result.result);
            assert.equal(payload.action, 'retry_later');
            // 不得落成 configuration_required（后端没升级 ≠ 没配看板）
            assert.notEqual(payload.status, 'dashboard_configuration_required');
        }
    });

    it('re-queries bypassing the cache on the blocking path', async () => {
        let calls = 0;
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => {
                calls += 1;
                return { contexts: [], associatedCount: 0 };
            },
        };
        const resolver = createDashboardContextResolver(api as never);
        const guard = createRequiredDashboardGuard(
            api as never,
            config,
            resolver,
        );
        const result = await guard.ensure({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        assert.equal(result.ok, false);
        // 首次 + 绕过缓存重查一次
        assert.equal(calls, 2);
    });
});

describe('formatDashboardAccessError', () => {
    beforeEach(() => {
        // 建一次 guard：让 formatter 能拿到登记的 contact / publicBaseUrl
        createGuard(createMockApi({}));
    });

    it('maps a dashboard 403 to dashboard_permission_required', () => {
        const result = formatDashboardAccessError({
            error: new LightdashApiError(
                403,
                "You don't have access to this dashboard",
            ),
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        assert.ok(result);
        const payload = structured(result);
        assert.equal(payload.status, 'dashboard_permission_required');
        assert.equal(payload.action, 'request_dashboard_access');
        assert.equal(
            payload.dashboardUrl,
            'https://example.com/projects/proj/dashboards/d1/view',
        );
        assert.equal(result.isError, true);
    });

    it('maps "does not belong to project" to dashboard_not_found', () => {
        const result = formatDashboardAccessError({
            error: new LightdashApiError(
                403,
                'Dashboard does not belong to project',
            ),
            projectUuid: 'proj',
            dashboardUuid: 'd1',
        });
        assert.ok(result);
        const payload = structured(result);
        assert.equal(payload.status, 'dashboard_not_found');
        assert.equal(payload.action, 'verify_dashboard_uuid');
    });

    it('returns null for errors that are not dashboard related', () => {
        assert.equal(
            formatDashboardAccessError({
                error: new LightdashApiError(500, 'InternalServerError | 500'),
                projectUuid: 'proj',
                dashboardUuid: 'd1',
            }),
            null,
        );
        assert.equal(
            formatDashboardAccessError({
                error: new Error('boom'),
                projectUuid: 'proj',
                dashboardUuid: null,
            }),
            null,
        );
    });
});

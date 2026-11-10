/**
 * 强制看板模式（MCP_DASHBOARD_STRICT=true）的工具级回归测试。
 *
 * 固化规格 §11 的关键场景：
 *  ① 严格模式 0 候选 → 阻断，且不执行查询；
 *  ② 严格模式显式未关联 uuid → 阻断；
 *  ③ 严格模式唯一候选 → 执行查询并带上 dashboardUuid；
 *  ④ 非严格模式同样输入 → 行为与旧版一致（不阻断、不带 uuid）；
 *  ⑤ search_field_values 严格模式空结果不回退 SQL / metric-query。
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LightdashMcpEnvConfig } from '../../config';
import { LightdashApiError } from '../../rest/requestBase';
import { resetSharedDashboardContextResolverForTests } from '../../lib/dashboardContextResolver';
import { resetRequiredDashboardContextForTests } from '../../lib/requiredDashboardContext';
import { resetClassifiedExploresCacheForTests } from '../access/assertExploreQueryable';
import { registerExtensionTools } from '../registerExtensionTools';
import { registerQueryTools, type CoreQueryToolsDeps } from './registerQueryTools';

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

const PROJECT_UUID = 'proj-1';

function createConfig(dashboardStrict: boolean): LightdashMcpEnvConfig {
    return {
        baseUrl: 'https://example.com',
        publicBaseUrl: 'https://example.com',
        apiKey: 'test-key',
        defaultProjectUuid: PROJECT_UUID,
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
        dashboardStrict,
        dashboardContact: '请联系客服开通看板访问权限。',
    };
}

/** 假的 McpServer：把注册进来的工具 handler 收集起来直接调用 */
function createFakeServer(): {
    server: McpServer;
    handlers: Map<string, ToolHandler>;
} {
    const handlers = new Map<string, ToolHandler>();
    const server = {
        tool: (
            name: string,
            _description: string,
            _params: unknown,
            cb: ToolHandler,
        ) => {
            handlers.set(name, cb);
        },
    };
    return { server: server as unknown as McpServer, handlers };
}

type FakeContext = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    chartUuids: string[];
};

type FakeApiOptions = {
    contexts?: FakeContext[];
    associatedCount?: number;
    dashboard?: Record<string, unknown>;
    fieldValuesResponse?: Record<string, unknown>;
};

function createFakeApi(options: FakeApiOptions) {
    const calls = {
        metricQuery: 0,
        metricQueryBodies: [] as Array<Record<string, unknown>>,
        sql: 0,
        dashboardChart: 0,
        searchFieldValues: 0,
        getDashboard: 0,
    };
    const api = {
        getAuthenticatedUser: async () => ({
            abilityRules: [
                {
                    action: 'view',
                    subject: 'Explore',
                    conditions: { projectUuid: PROJECT_UUID },
                },
            ],
        }),
        listExplores: async () => ({
            data: [{ name: 'orders', label: 'Orders', groupLabel: null }],
        }),
        getCatalog: async () => ({
            data: [{ name: 'orders', label: 'Orders', groupLabel: null }],
        }),
        getDashboardContexts: async () => ({
            contexts: options.contexts ?? [],
            associatedCount: options.associatedCount,
        }),
        getDashboard: async () => {
            calls.getDashboard += 1;
            return options.dashboard;
        },
        searchFieldUniqueValues: async () => {
            calls.searchFieldValues += 1;
            return options.fieldValuesResponse ?? { results: [] };
        },
        runMetricQueryUntilReady: async (
            _apiKey: string,
            _projectUuid: string,
            body: Record<string, unknown>,
        ) => {
            calls.metricQuery += 1;
            calls.metricQueryBodies.push(body);
            return {
                queryUuid: 'query-uuid',
                rows: [],
                columns: {},
                executeResult: { fields: {}, warnings: [] },
            };
        },
        runSqlUntilReady: async () => {
            calls.sql += 1;
            throw new Error('SQL fallback must not run in strict mode');
        },
        runDashboardChart: async () => {
            calls.dashboardChart += 1;
            return { queryUuid: 'dashboard-query-uuid', rows: [], columns: {} };
        },
    };
    return { api: api as never, calls };
}

function createDeps(): CoreQueryToolsDeps {
    return {
        getFieldResolver: async () => (field: string) => field,
        getExploreMetadata: async () => ({
            explore: {},
            resolve: (field: string) => field,
            requiresDashboardContext: false,
        }),
        defaultPoll: { pageSize: 500, maxPollAttempts: 1, pollIntervalMs: 1 },
    };
}

function structured(result: CallToolResult): Record<string, unknown> {
    return (result.structuredContent ?? {}) as Record<string, unknown>;
}

/** search_field_values 只返回文本内容（没有 structuredContent），从文本里解析 */
function parseTextPayload(result: CallToolResult): Record<string, unknown> {
    const first = result.content[0];
    assert.ok(first && first.type === 'text');
    return JSON.parse(first.text) as Record<string, unknown>;
}

beforeEach(() => {
    resetRequiredDashboardContextForTests();
    resetSharedDashboardContextResolverForTests();
    resetClassifiedExploresCacheForTests();
});

describe('strict dashboard mode - run_metric_query', () => {
    it('blocks when no dashboard is associated and never runs the query', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({ contexts: [], associatedCount: 0 });
        registerQueryTools(server, createConfig(true), api, createDeps());
        const handler = handlers.get('run_metric_query');
        assert.ok(handler);

        const result = await handler({
            exploreName: 'orders',
            metrics: ['orders_revenue'],
        });

        assert.equal(calls.metricQuery, 0);
        assert.equal(result.isError, true);
        const payload = structured(result);
        assert.equal(payload.status, 'dashboard_configuration_required');
        assert.equal(payload.action, 'configure_dashboard');
        assert.equal(payload.associatedCount, 0);
    });

    it('blocks when the explicit dashboard is not associated with the explore', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({
            contexts: [
                {
                    dashboardUuid: 'dash-1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['chart-1'],
                },
            ],
            associatedCount: 1,
            dashboard: {
                uuid: 'dash-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: PROJECT_UUID,
            },
        });
        registerQueryTools(server, createConfig(true), api, createDeps());
        const handler = handlers.get('run_metric_query');
        assert.ok(handler);

        const result = await handler({
            exploreName: 'orders',
            metrics: ['orders_revenue'],
            dashboardUuid: 'dash-other',
        });

        assert.equal(calls.metricQuery, 0);
        assert.equal(result.isError, true);
        const payload = structured(result);
        assert.equal(payload.status, 'dashboard_not_found');
        assert.equal(payload.action, 'verify_dashboard_uuid');
    });

    it('runs the query with the resolved dashboardUuid when there is a single candidate', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({
            contexts: [
                {
                    dashboardUuid: 'dash-1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['chart-1'],
                },
            ],
            associatedCount: 1,
        });
        registerQueryTools(server, createConfig(true), api, createDeps());
        const handler = handlers.get('run_metric_query');
        assert.ok(handler);

        const result = await handler({
            exploreName: 'orders',
            metrics: ['orders_revenue'],
        });

        assert.equal(calls.metricQuery, 1);
        assert.equal(calls.metricQueryBodies[0]?.dashboardUuid, 'dash-1');
        const payload = structured(result);
        const resolved = payload.resolvedDashboardContext as Record<
            string,
            unknown
        >;
        assert.equal(resolved.dashboardUuid, 'dash-1');
        assert.equal(resolved.source, 'uniqueExploreContext');
    });
});

describe('non strict dashboard mode - run_metric_query', () => {
    it('keeps the legacy behaviour: no blocking and no dashboard context', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({ contexts: [], associatedCount: 0 });
        registerQueryTools(server, createConfig(false), api, createDeps());
        const handler = handlers.get('run_metric_query');
        assert.ok(handler);

        const result = await handler({
            exploreName: 'orders',
            metrics: ['orders_revenue'],
        });

        assert.equal(calls.metricQuery, 1);
        assert.equal(calls.metricQueryBodies[0]?.dashboardUuid, undefined);
        const payload = structured(result);
        assert.notEqual(payload.status, 'dashboard_configuration_required');
        const resolved = payload.resolvedDashboardContext as Record<
            string,
            unknown
        >;
        assert.equal(resolved.source, 'unresolved');
    });

    it('keeps the legacy behaviour for an explicit dashboardUuid', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({
            contexts: [],
            associatedCount: 0,
            dashboard: {
                uuid: 'dash-1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: PROJECT_UUID,
            },
        });
        registerQueryTools(server, createConfig(false), api, createDeps());
        const handler = handlers.get('run_metric_query');
        assert.ok(handler);

        const result = await handler({
            exploreName: 'orders',
            metrics: ['orders_revenue'],
            dashboardUuid: 'dash-1',
        });

        assert.equal(calls.metricQuery, 1);
        assert.equal(calls.metricQueryBodies[0]?.dashboardUuid, 'dash-1');
        const payload = structured(result);
        assert.notEqual(payload.status, 'dashboard_not_found');
    });
});

describe('strict dashboard mode - search_field_values', () => {
    it('returns an empty list without falling back to SQL or metric-query', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({
            contexts: [
                {
                    dashboardUuid: 'dash-1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['chart-1'],
                },
            ],
            associatedCount: 1,
            fieldValuesResponse: { results: [] },
        });
        registerQueryTools(server, createConfig(true), api, createDeps());
        const handler = handlers.get('search_field_values');
        assert.ok(handler);

        const result = await handler({
            table: 'orders',
            fieldId: 'orders_status',
        });

        assert.equal(calls.searchFieldValues, 1);
        assert.equal(calls.sql, 0);
        assert.equal(calls.metricQuery, 0);
        const payload = parseTextPayload(result);
        assert.deepEqual(payload.rows, []);
        assert.equal(payload.source, 'field-values-v1-endpoint');
        const resolved = payload.resolvedDashboardContext as Record<
            string,
            unknown
        >;
        assert.equal(resolved.dashboardUuid, 'dash-1');
    });

    it('fails loudly when the field-values response has no values array at all', async () => {
        const { server, handlers } = createFakeServer();
        const { api, calls } = createFakeApi({
            contexts: [
                {
                    dashboardUuid: 'dash-1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                    chartUuids: ['chart-1'],
                },
            ],
            associatedCount: 1,
            fieldValuesResponse: { unexpected: true },
        });
        registerQueryTools(server, createConfig(true), api, createDeps());
        const handler = handlers.get('search_field_values');
        assert.ok(handler);

        await assert.rejects(
            () =>
                handler({
                    table: 'orders',
                    fieldId: 'orders_status',
                }),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /结构异常/);
                return true;
            },
        );
        assert.equal(calls.sql, 0);
        assert.equal(calls.metricQuery, 0);
    });
});

describe('strict dashboard mode - run_dashboard_tiles', () => {
    it('aborts the whole batch when a tile fails with a dashboard access error', async () => {
        const { server, handlers } = createFakeServer();
        const { api } = createFakeApi({
            contexts: [],
            associatedCount: 0,
            dashboard: {
                uuid: 'dash-1',
                slug: 'slug-1',
                name: 'Dash 1',
                projectUuid: PROJECT_UUID,
                tiles: [
                    {
                        uuid: 'tile-1',
                        type: 'saved_chart',
                        properties: { savedChartUuid: 'chart-1' },
                    },
                ],
            },
        });
        // 磁贴执行阶段返回看板归属错误
        const failingApi = {
            ...(api as unknown as Record<string, unknown>),
            runDashboardChart: async () => {
                throw new LightdashApiError(
                    403,
                    'Dashboard does not belong to project',
                );
            },
        };
        registerExtensionTools(
            server,
            createConfig(true),
            failingApi as never,
            {
                getExploreMetadata: async () => ({
                    explore: {},
                    resolve: (field: string) => field,
                    requiresDashboardContext: false,
                }),
            },
        );
        const handler = handlers.get('run_dashboard_tiles');
        assert.ok(handler);

        const result = await handler({ dashboardUuid: 'dash-1' });

        const payload = parseTextPayload(result);
        assert.equal(payload.status, 'dashboard_not_found');
        assert.equal(payload.action, 'verify_dashboard_uuid');
        assert.equal(result.isError, true);
    });
});

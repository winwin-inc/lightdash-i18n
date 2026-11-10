import {
    AnyType,
    DashboardTileTypes,
    DimensionType,
    FieldType,
    ForbiddenError,
    MetricType,
} from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { registerChartRunTools } from './chartRunTools';
import { McpToolDeps } from './deps';
import { NO_DEFAULT_PROJECT_ERROR } from './projectContext';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

type RegisteredTool = {
    name: string;
    config: { description?: string; inputSchema?: AnyType };
    handler: (args: AnyType, context: McpToolContext) => Promise<AnyType>;
};

const buildRegistry = () => {
    const registered: RegisteredTool[] = [];
    const registry = {
        register: jest.fn(
            (
                name: string,
                config: RegisteredTool['config'],
                handler: RegisteredTool['handler'],
            ) => {
                registered.push({ name, config, handler });
            },
        ),
    };
    return { registry: registry as unknown as McpToolRegistry, registered };
};

const buildChart = ({
    uuid = 'chart-uuid',
    name = 'Revenue by status',
    projectUuid = 'project-uuid',
    exploreName = 'orders',
    limit = 500,
}: {
    uuid?: string;
    name?: string;
    projectUuid?: string;
    exploreName?: string;
    limit?: number;
} = {}) =>
    ({
        uuid,
        projectUuid,
        name,
        tableName: exploreName,
        metricQuery: {
            exploreName,
            dimensions: ['orders_status'],
            metrics: ['orders_total_revenue'],
            filters: {},
            sorts: [],
            limit,
            tableCalculations: [],
        },
        chartConfig: { type: 'cartesian', config: {} },
        tableConfig: { columnOrder: [] },
        parameters: {},
        organizationUuid: 'org-uuid',
        spaceUuid: 'space-uuid',
        spaceName: 'Space',
        slug: 'revenue-by-status',
        isPrivate: false,
        access: [],
        colorPalette: [],
        updatedAt: new Date('2024-01-01'),
        dashboardUuid: null,
        dashboardName: null,
        pinnedListUuid: null,
        pinnedListOrder: null,
    } as unknown as AnyType);

const buildDeps = ({
    contextProjectUuid,
    visibleProjectUuids = ['project-uuid'],
    charts = [buildChart()],
    tiles,
    dashboardStrict = false,
}: {
    contextProjectUuid?: string;
    visibleProjectUuids?: string[];
    charts?: AnyType[];
    tiles?: AnyType[];
    dashboardStrict?: boolean;
} = {}) => {
    const getContext = jest.fn().mockResolvedValue(
        contextProjectUuid
            ? {
                  user_uuid: 'user-uuid',
                  organization_uuid: 'org-uuid',
                  context: {
                      projectUuid: contextProjectUuid,
                      projectName: 'Demo project',
                      tags: null,
                  },
              }
            : undefined,
    );

    const getProject = jest.fn().mockImplementation(async (projectUuid: string) => {
        // Mirrors ProjectService.getProject: it enforces the CASL view
        // check of the account.
        if (!visibleProjectUuids.includes(projectUuid)) {
            throw new ForbiddenError();
        }
        return {
            projectUuid,
            organizationUuid: 'org-uuid',
            name: 'Demo project',
        };
    });

    const get = jest.fn().mockImplementation(async (uuid: string) => {
        const chart = charts.find((c: AnyType) => c.uuid === uuid);
        if (!chart) {
            throw new Error(`Chart ${uuid} not found`);
        }
        return chart;
    });

    const runMetricQuery = jest.fn().mockResolvedValue({
        rows: [{ orders_status: 'completed', orders_total_revenue: 100 }],
        fields: {
            orders_status: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                name: 'status',
                label: 'Status',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '${TABLE}.status',
                hidden: false,
            },
            orders_total_revenue: {
                fieldType: FieldType.METRIC,
                type: MetricType.SUM,
                name: 'total_revenue',
                label: 'Total revenue',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '${TABLE}.amount',
                hidden: false,
            },
        },
        cacheMetadata: { cacheHit: false },
    });

    const getByIdOrSlug = jest.fn().mockResolvedValue({
        uuid: 'dashboard-uuid',
        projectUuid: 'project-uuid',
        name: 'Sales dashboard',
        organizationUuid: 'org-uuid',
        spaceUuid: 'space-uuid',
        spaceName: 'Space',
        slug: 'sales-dashboard',
        isPrivate: false,
        views: 0,
        updatedAt: new Date('2024-01-01'),
        tiles: tiles ?? [
            {
                uuid: 'tile-1',
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 0,
                h: 8,
                w: 12,
                tabUuid: undefined,
                properties: {
                    title: 'Revenue',
                    savedChartUuid: 'chart-uuid',
                },
            },
            {
                uuid: 'tile-2',
                type: DashboardTileTypes.MARKDOWN,
                x: 0,
                y: 8,
                h: 4,
                w: 12,
                tabUuid: undefined,
                properties: {
                    title: 'Some notes',
                    content: 'hello',
                },
            },
        ],
    });

    const track = jest.fn();

    const deps = {
        savedChartService: {
            get,
        },
        dashboardService: {
            getByIdOrSlug,
        },
        projectService: {
            getProject,
            runMetricQuery,
        },
        mcpContextModel: {
            getContext,
        },
        organizationModel: {
            get: jest.fn().mockResolvedValue({
                organizationUuid: 'org-uuid',
                defaultProjectUuid: undefined,
            }),
        },
        analytics: {
            track,
        },
        lightdashConfig: {
            mcp: {
                dashboardStrict,
                dashboardContact: '请联系客服开通看板访问权限。',
            },
            ai: {
                copilot: {
                    maxQueryLimit: 1000,
                },
            },
            query: {
                csvCellsLimit: 100000,
            },
        },
    } as unknown as McpToolDeps;

    return {
        deps,
        getContext,
        getProject,
        get,
        getByIdOrSlug,
        runMetricQuery,
        track,
        visibleProjectUuids,
    };
};

const buildContext = ({
    visibleProjectUuids = ['project-uuid'],
}: {
    visibleProjectUuids?: string[];
} = {}): McpToolContext => {
    const ability = {
        can: jest.fn((_action: string, subjectInstance: AnyType) =>
            visibleProjectUuids.includes(subjectInstance?.projectUuid),
        ),
    };

    return {
        user: {
            userUuid: 'user-uuid',
            email: 'demo@lightdash.com',
            firstName: 'Demo',
            lastName: 'User',
            organizationUuid: 'org-uuid',
            organizationName: 'Demo org',
            role: 'member',
            ability,
            abilityRules: [{ action: 'view', subject: 'Explore' }],
        } as unknown as McpToolContext['user'],
        account: { user: { ability } } as unknown as McpToolContext['account'],
        ability: ability as unknown as McpToolContext['ability'],
        organizationUuid: 'org-uuid',
        authType: 'pat' as McpToolContext['authType'],
        scopes: [],
    };
};

const parseResult = (result: AnyType) =>
    JSON.parse(result.content[0].text as string);

// 看板门控模块的 mock（jest.mock 工厂只能引用 mock 前缀变量）
const mockGuardEnsure = jest.fn();
const mockFormatDashboardAccessError = jest.fn();

jest.mock('./access/requiredDashboardContext', () => ({
    createRequiredDashboardGuard: () => ({
        ensure: (...args: AnyType[]) => mockGuardEnsure(...args),
    }),
    formatDashboardAccessError: (...args: AnyType[]) =>
        mockFormatDashboardAccessError(...args),
}));

const buildGuardContext = (dashboardUuid = 'dashboard-uuid') => ({
    dashboardUuid,
    dashboardSlug: 'sales-dashboard',
    dashboardName: 'Sales dashboard',
    dashboardUrl: '',
    source: 'uniqueChartContext' as const,
    candidateCount: 1,
});

const buildBlockedResult = (status: string) => ({
    content: [
        {
            type: 'text',
            text: JSON.stringify({ status }, null, 2),
        },
    ],
});

describe('registerChartRunTools', () => {
    beforeEach(() => {
        mockGuardEnsure.mockReset();
        mockFormatDashboardAccessError.mockReset();
        mockGuardEnsure.mockResolvedValue({
            ok: true,
            context: buildGuardContext(),
        });
        mockFormatDashboardAccessError.mockReturnValue(null);
    });

    it('registers the run_saved_chart and run_dashboard_tiles tools', () => {
        const { registry, registered } = buildRegistry();
        registerChartRunTools(registry, buildDeps().deps);

        expect(registered.map((tool) => tool.name)).toEqual([
            McpToolName.RUN_SAVED_CHART,
            McpToolName.RUN_DASHBOARD_TILES,
        ]);
        expect(registered[0].name).toEqual('run_saved_chart');
        expect(registered[1].name).toEqual('run_dashboard_tiles');
        expect(registered[0].config.description).toBeDefined();
        expect(registered[1].config.description).toBeDefined();
    });

    describe('project resolution', () => {
        it('prefers the explicit projectUuid argument', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, get, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['explicit-project-uuid'],
                charts: [buildChart({ projectUuid: 'explicit-project-uuid' })],
            });
            registerChartRunTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            await registered[0].handler(
                {
                    savedChartUuid: 'chart-uuid',
                    projectUuid: 'explicit-project-uuid',
                },
                context,
            );

            expect(getContext).not.toHaveBeenCalled();
            expect(get).toHaveBeenCalledWith(
                'chart-uuid',
                context.account,
                { projectUuid: 'explicit-project-uuid' },
            );
        });

        it('falls back to the project set in the MCP context', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, get, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['context-project-uuid'],
                charts: [buildChart({ projectUuid: 'context-project-uuid' })],
            });
            registerChartRunTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });
            await registered[0].handler(
                { savedChartUuid: 'chart-uuid' },
                context,
            );

            expect(getContext).toHaveBeenCalledWith('user-uuid', 'org-uuid');
            expect(get).toHaveBeenCalledWith(
                'chart-uuid',
                context.account,
                { projectUuid: 'context-project-uuid' },
            );
        });

        it('throws a ForbiddenError when no default project resolves', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerChartRunTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            ).rejects.toThrow(NO_DEFAULT_PROJECT_ERROR);
        });

        it('throws a ForbiddenError when no level of the fallback chain is viewable', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'hidden-project-uuid',
                visibleProjectUuids: ['other-project-uuid'],
            });
            registerChartRunTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['other-project-uuid'],
            });

            await expect(
                registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('run_saved_chart', () => {
        it('runs the chart metric query and returns the columns and rows', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerChartRunTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            );

            expect(runMetricQuery).toHaveBeenCalledTimes(1);
            const call = runMetricQuery.mock.calls[0][0];
            expect(call.account).toEqual(context.account);
            expect(call.projectUuid).toEqual('project-uuid');
            expect(call.exploreName).toEqual('orders');
            expect(call.metricQuery.exploreName).toEqual('orders');
            expect(call.metricQuery.dimensions).toEqual(['orders_status']);
            expect(call.metricQuery.metrics).toEqual(['orders_total_revenue']);
            expect(call.context).toEqual('mcp');
            expect(call.chartUuid).toEqual('chart-uuid');
            expect(call.queryTags).toEqual({
                project_uuid: 'project-uuid',
                user_uuid: 'user-uuid',
                organization_uuid: 'org-uuid',
            });

            expect(result.savedChartUuid).toEqual('chart-uuid');
            expect(result.name).toEqual('Revenue by status');
            expect(result.rowCount).toEqual(1);
            expect(result.truncated).toEqual(false);
            expect(result.rows).toEqual([
                { orders_status: 'completed', orders_total_revenue: 100 },
            ]);
            expect(result.columns.map((c: AnyType) => c.fieldId)).toEqual([
                'orders_status',
                'orders_total_revenue',
            ]);
        });

        it('applies the limit to the metric query and caps it by the server limit', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerChartRunTools(registry, deps);

            const context = buildContext();
            await registered[0].handler(
                { savedChartUuid: 'chart-uuid', limit: 10 },
                context,
            );

            expect(runMetricQuery.mock.calls[0][0].metricQuery.limit).toEqual(10);

            await registered[0].handler(
                { savedChartUuid: 'chart-uuid', limit: 100000 },
                context,
            );

            expect(runMetricQuery.mock.calls[1][0].metricQuery.limit).toEqual(
                1000,
            );
        });

        it('throws when the chart belongs to another project', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'project-uuid',
                charts: [buildChart({ projectUuid: 'another-project' })],
            });
            registerChartRunTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('run_dashboard_tiles', () => {
        it('runs every saved chart tile of the dashboard', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerChartRunTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[1].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            );

            expect(runMetricQuery).toHaveBeenCalledTimes(1);
            expect(result.dashboardUuid).toEqual('dashboard-uuid');
            expect(result.name).toEqual('Sales dashboard');
            expect(result.tiles).toHaveLength(1);
            expect(result.tiles[0]).toEqual(
                expect.objectContaining({
                    uuid: 'tile-1',
                    name: 'Revenue',
                    chartUuid: 'chart-uuid',
                    rowCount: 1,
                }),
            );
            expect(result.tiles[0].rows).toEqual([
                { orders_status: 'completed', orders_total_revenue: 100 },
            ]);
            expect(result.rowCount).toEqual(1);
        });

        it('reports the error of a failing tile without breaking the call', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'project-uuid',
                charts: [buildChart({ uuid: 'chart-2' })],
                tiles: [
                    {
                        uuid: 'tile-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 8,
                        w: 12,
                        tabUuid: undefined,
                        properties: {
                            title: 'Missing chart',
                            savedChartUuid: 'chart-missing',
                        },
                    },
                    {
                        uuid: 'tile-2',
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 8,
                        h: 8,
                        w: 12,
                        tabUuid: undefined,
                        properties: {
                            title: 'Working chart',
                            savedChartUuid: 'chart-2',
                        },
                    },
                ],
            });
            registerChartRunTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[1].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            );

            expect(result.tiles).toHaveLength(2);
            expect(result.tiles[0].error).toEqual(
                'Chart chart-missing not found',
            );
            expect(result.tiles[0].rowCount).toEqual(0);
            expect(result.tiles[1].error).toBeUndefined();
            expect(result.tiles[1].rowCount).toEqual(1);
            expect(result.rowCount).toEqual(1);
        });

        it('throws a ForbiddenError when no default project resolves', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerChartRunTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[1].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('dashboard strict gating', () => {
        it('adds the optional dashboardUuid parameter to run_saved_chart only when strict is on', () => {
            const { registry, registered } = buildRegistry();
            registerChartRunTools(registry, buildDeps().deps);
            expect(registered[0].config.inputSchema).not.toHaveProperty(
                'dashboardUuid',
            );

            const { registry: strictRegistry, registered: strictRegistered } =
                buildRegistry();
            registerChartRunTools(
                strictRegistry,
                buildDeps({ dashboardStrict: true }).deps,
            );
            expect(strictRegistered[0].config.inputSchema).toHaveProperty(
                'dashboardUuid',
            );
        });

        it('blocks run_saved_chart with the structured guard payload when strict is on', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, get, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
                dashboardStrict: true,
            });
            registerChartRunTools(registry, deps);

            const blockedResult = buildBlockedResult(
                'dashboard_selection_required',
            );
            mockGuardEnsure.mockResolvedValueOnce({
                ok: false,
                result: blockedResult,
            });

            const context = buildContext();
            const result = await registered[0].handler(
                {
                    savedChartUuid: 'chart-uuid',
                    dashboardUuid: 'dashboard-uuid',
                },
                context,
            );

            expect(result).toEqual(blockedResult);
            // v1 对齐：先取图表再 guard；blocked 时不跑数
            expect(get).toHaveBeenCalledTimes(1);
            expect(runMetricQuery).not.toHaveBeenCalled();
            expect(mockGuardEnsure).toHaveBeenCalledWith(context, {
                projectUuid: 'project-uuid',
                dashboardUuid: 'dashboard-uuid',
                chartUuid: 'chart-uuid',
            });
        });

        it('maps dashboard-class errors of run_saved_chart when strict is on', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
                dashboardStrict: true,
            });
            registerChartRunTools(registry, deps);

            runMetricQuery.mockRejectedValueOnce(
                new ForbiddenError(
                    'You must contact your administrator to configure dashboard access permissions',
                ),
            );
            const mappedResult = buildBlockedResult(
                'dashboard_permission_required',
            );
            mockFormatDashboardAccessError.mockReturnValueOnce(mappedResult);

            const result = await registered[0].handler(
                { savedChartUuid: 'chart-uuid' },
                buildContext(),
            );

            expect(result).toEqual(mappedResult);
            // guard 解析出的 dashboardUuid 用于错误映射
            expect(mockFormatDashboardAccessError).toHaveBeenCalledWith({
                error: expect.any(ForbiddenError),
                projectUuid: 'project-uuid',
                dashboardUuid: 'dashboard-uuid',
            });
        });

        it('blocks run_dashboard_tiles before running any tile when the dashboard fetch fails (strict)', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, get, runMetricQuery, getByIdOrSlug } = buildDeps({
                contextProjectUuid: 'project-uuid',
                dashboardStrict: true,
            });
            registerChartRunTools(registry, deps);

            getByIdOrSlug.mockRejectedValueOnce(
                new ForbiddenError(
                    'You do not have access to the space this dashboard belongs to',
                ),
            );
            const mappedResult = buildBlockedResult(
                'dashboard_permission_required',
            );
            mockFormatDashboardAccessError.mockReturnValueOnce(mappedResult);

            const result = await registered[1].handler(
                { dashboardUuid: 'dashboard-uuid' },
                buildContext(),
            );

            expect(result).toEqual(mappedResult);
            expect(mockFormatDashboardAccessError).toHaveBeenCalledWith({
                error: expect.any(ForbiddenError),
                projectUuid: 'project-uuid',
                dashboardUuid: 'dashboard-uuid',
            });
            expect(get).not.toHaveBeenCalled();
            expect(runMetricQuery).not.toHaveBeenCalled();
        });

        it('blocks the whole batch when a tile fails with a dashboard-class error (strict)', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
                dashboardStrict: true,
            });
            registerChartRunTools(registry, deps);

            runMetricQuery.mockRejectedValueOnce(
                new ForbiddenError(
                    'You must contact your administrator to configure dashboard access permissions',
                ),
            );
            const mappedResult = buildBlockedResult(
                'dashboard_permission_required',
            );
            mockFormatDashboardAccessError.mockReturnValueOnce(mappedResult);

            const result = await registered[1].handler(
                { dashboardUuid: 'dashboard-uuid' },
                buildContext(),
            );

            expect(result).toEqual(mappedResult);
            expect(mockFormatDashboardAccessError).toHaveBeenCalledWith({
                error: expect.any(ForbiddenError),
                projectUuid: 'project-uuid',
                dashboardUuid: 'dashboard-uuid',
            });
        });

        it('keeps non-dashboard tile errors per tile when strict is on', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'project-uuid',
                dashboardStrict: true,
                charts: [buildChart({ uuid: 'chart-2' })],
                tiles: [
                    {
                        uuid: 'tile-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 8,
                        w: 12,
                        tabUuid: undefined,
                        properties: {
                            title: 'Missing chart',
                            savedChartUuid: 'chart-missing',
                        },
                    },
                    {
                        uuid: 'tile-2',
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 8,
                        h: 8,
                        w: 12,
                        tabUuid: undefined,
                        properties: {
                            title: 'Working chart',
                            savedChartUuid: 'chart-2',
                        },
                    },
                ],
            });
            registerChartRunTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[1].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            );

            // 非看板类错误（formatDashboardAccessError 返回 null）不走整批阻断
            expect(mockFormatDashboardAccessError).toHaveBeenCalled();
            expect(result.tiles).toHaveLength(2);
            expect(result.tiles[0].error).toEqual(
                'Chart chart-missing not found',
            );
            expect(result.tiles[1].rowCount).toEqual(1);
            expect(result.rowCount).toEqual(1);
        });
    });
});

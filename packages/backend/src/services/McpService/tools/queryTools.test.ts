import {
    AnyType,
    DimensionType,
    Explore,
    FieldType,
    ForbiddenError,
    MetricType,
} from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { NO_DEFAULT_PROJECT_ERROR } from './projectContext';
import { McpToolRegistry } from './registry';
import { registerQueryTools } from './queryTools';
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

const buildExplore = (): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        tags: ['finance'],
        baseTable: 'orders',
        joinedTables: [],
        targetDatabase: 'postgres',
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'db',
                schema: 'public',
                sqlTable: 'orders',
                description: 'The orders table',
                lineageGraph: {},
                dimensions: {
                    status: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'status',
                        label: 'Status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.status',
                        hidden: false,
                    },
                },
                metrics: {
                    total_revenue: {
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
            },
        },
    } as unknown as Explore);

const buildDeps = ({
    contextProjectUuid,
    visibleProjectUuids = ['project-uuid'],
}: {
    contextProjectUuid?: string;
    visibleProjectUuids?: string[];
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

    const getAllExploresSummary = jest.fn().mockResolvedValue([
        {
            name: 'orders',
            label: 'Orders',
            tags: ['finance'],
            description: 'The orders table',
            schemaName: 'public',
            databaseName: 'db',
        },
        {
            name: 'users',
            label: 'Users',
            tags: [],
            description: null,
            schemaName: 'public',
            databaseName: 'db',
        },
    ]);

    const findExplores = jest.fn().mockResolvedValue({
        orders: buildExplore(),
    });

    const getExplore = jest.fn().mockResolvedValue(buildExplore());

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

    const track = jest.fn();

    const deps = {
        projectService: {
            getProject,
            getAllExploresSummary,
            findExplores,
            getExplore,
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
        getAllExploresSummary,
        findExplores,
        getExplore,
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

describe('registerQueryTools', () => {
    it('registers the list_explores and run_semantic_metric_query tools', () => {
        const { registry, registered } = buildRegistry();
        registerQueryTools(registry, buildDeps().deps);

        expect(registered.map((tool) => tool.name)).toEqual([
            McpToolName.LIST_EXPLORES,
            McpToolName.RUN_SEMANTIC_METRIC_QUERY,
        ]);
        expect(registered[0].name).toEqual('list_explores');
        expect(registered[1].name).toEqual('run_semantic_metric_query');
        expect(registered[0].config.description).toBeDefined();
        expect(registered[1].config.description).toBeDefined();
    });

    describe('project resolution', () => {
        it('prefers the explicit projectUuid argument', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getAllExploresSummary, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            registerQueryTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            await registered[0].handler(
                { projectUuid: 'explicit-project-uuid' },
                context,
            );

            expect(getContext).not.toHaveBeenCalled();
            expect(getAllExploresSummary).toHaveBeenCalledWith(
                context.account,
                'explicit-project-uuid',
                true,
                false,
            );
        });

        it('falls back to the project set in the MCP context', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getAllExploresSummary, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['context-project-uuid'],
            });
            registerQueryTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });
            await registered[0].handler({}, context);

            expect(getContext).toHaveBeenCalledWith('user-uuid', 'org-uuid');
            expect(getAllExploresSummary).toHaveBeenCalledWith(
                context.account,
                'context-project-uuid',
                true,
                false,
            );
        });

        it('throws a ForbiddenError when no default project resolves', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerQueryTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[0].handler({}, context),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(registered[0].handler({}, context)).rejects.toThrow(
                NO_DEFAULT_PROJECT_ERROR,
            );
        });

        it('throws a ForbiddenError when no level of the fallback chain is viewable', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'hidden-project-uuid',
                visibleProjectUuids: ['other-project-uuid'],
            });
            registerQueryTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['other-project-uuid'],
            });

            await expect(
                registered[0].handler({}, context),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('list_explores', () => {
        it('returns the explores with their metadata and the total', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerQueryTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler({}, context),
            );

            expect(result.projectUuid).toEqual('project-uuid');
            expect(result.total).toEqual(2);
            expect(result.explores).toHaveLength(2);
            expect(result.explores[0]).toEqual({
                name: 'orders',
                label: 'Orders',
                description: 'The orders table',
                tableCount: 1,
                baseTable: 'orders',
                tags: ['finance'],
            });
        });

        it('filters the explores by name and paginates the result', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerQueryTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler(
                    { exploreName: 'users', page: 1, pageSize: 10 },
                    context,
                ),
            );

            expect(result.total).toEqual(1);
            expect(result.explores.map((e: AnyType) => e.name)).toEqual([
                'users',
            ]);
        });
    });

    describe('run_semantic_metric_query', () => {
        it('runs the query and returns the columns and rows', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerQueryTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[1].handler(
                    {
                        exploreName: 'orders',
                        metrics: ['orders_total_revenue'],
                        dimensions: ['orders_status'],
                    },
                    context,
                ),
            );

            expect(runMetricQuery).toHaveBeenCalledTimes(1);
            const call = runMetricQuery.mock.calls[0][0];
            expect(call.projectUuid).toEqual('project-uuid');
            expect(call.exploreName).toEqual('orders');
            expect(call.metricQuery.metrics).toEqual([
                'orders_total_revenue',
            ]);
            expect(call.metricQuery.dimensions).toEqual(['orders_status']);
            expect(call.context).toEqual('mcp');

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

        it('throws when a field does not exist in the explore', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerQueryTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[1].handler(
                    {
                        exploreName: 'orders',
                        metrics: ['orders_unknown_metric'],
                    },
                    context,
                ),
            ).rejects.toThrow(
                'Field "orders_unknown_metric" does not exist in explore "orders"',
            );
        });

        it('throws when a dimension is passed as a metric', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerQueryTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[1].handler(
                    {
                        exploreName: 'orders',
                        metrics: ['orders_status'],
                    },
                    context,
                ),
            ).rejects.toThrow(
                'Field "orders_status" is not a metric in explore "orders"',
            );
        });

        it('passes the filters through to the metric query', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, runMetricQuery } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerQueryTools(registry, deps);

            const context = buildContext();
            await registered[1].handler(
                {
                    exploreName: 'orders',
                    metrics: ['orders_total_revenue'],
                    dimensions: ['orders_status'],
                    filters: {
                        dimensions: [
                            {
                                fieldId: 'orders_status',
                                operator: 'equals',
                                values: ['completed'],
                            },
                        ],
                    },
                },
                context,
            );

            const call = runMetricQuery.mock.calls[0][0];
            expect(call.metricQuery.filters.dimensions.and).toHaveLength(1);
            expect(call.metricQuery.filters.dimensions.and[0]).toEqual(
                expect.objectContaining({
                    operator: 'equals',
                    values: ['completed'],
                    target: { fieldId: 'orders_status' },
                }),
            );
        });

        it('reports truncation when the row limit is reached', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            deps.projectService.runMetricQuery = jest.fn().mockResolvedValue({
                rows: [{ orders_total_revenue: 1 }],
                fields: {},
                cacheMetadata: { cacheHit: false },
            });
            registerQueryTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[1].handler(
                    {
                        exploreName: 'orders',
                        metrics: ['orders_total_revenue'],
                        limit: 1,
                    },
                    context,
                ),
            );

            expect(result.truncated).toEqual(true);
            expect(result.rowCount).toEqual(1);
        });

        it('throws when no default project resolves', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerQueryTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[1].handler(
                    {
                        exploreName: 'orders',
                        metrics: ['orders_total_revenue'],
                    },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });
});

import {
    AnyType,
    ChartKind,
    ChartType,
    ForbiddenError,
} from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { McpToolRegistry } from './registry';
import { registerSavedChartTools } from './savedChartTools';
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

const buildChart = (projectUuid = 'project-uuid') => ({
    uuid: 'chart-uuid',
    name: 'Revenue by month',
    description: 'Monthly revenue',
    organizationUuid: 'org-uuid',
    projectUuid,
    spaceUuid: 'space-uuid',
    spaceName: 'Finance',
    slug: 'revenue-by-month',
    isPrivate: false,
    tableName: 'orders',
    chartConfig: {
        type: ChartType.PIE,
        config: { series: [] },
    },
    metricQuery: { dimensions: [], metrics: [] },
    tableConfig: { columnOrder: [] },
    parameters: {},
    dashboardUuid: null,
    dashboardName: null,
    colorPalette: [],
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedByUser: undefined,
    access: [],
});

const buildDeps = ({
    contextProjectUuid,
    chartProjectUuid = 'project-uuid',
}: {
    contextProjectUuid?: string;
    chartProjectUuid?: string;
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

    const getProject = jest.fn().mockImplementation(
        async (projectUuid: string) => ({
            projectUuid,
            organizationUuid: 'org-uuid',
        }),
    );

    const get = jest.fn().mockResolvedValue(buildChart(chartProjectUuid));

    const deps = {
        projectService: { getProject },
        mcpContextModel: { getContext },
        savedChartService: { get },
        lightdashConfig: { siteUrl: 'https://lightdash.example.com' },
    } as unknown as McpToolDeps;

    return { deps, getContext, getProject, get };
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

describe('registerSavedChartTools', () => {
    it('registers the get_saved_chart tool', () => {
        const { registry, registered } = buildRegistry();
        registerSavedChartTools(registry, buildDeps().deps);

        expect(registered.map((tool) => tool.name)).toEqual([
            McpToolName.GET_SAVED_CHART,
        ]);
        expect(registered[0].name).toEqual('get_saved_chart');
        expect(registered[0].config.description).toBeDefined();
        expect(Object.keys(registered[0].config.inputSchema ?? {})).toEqual([
            'savedChartUuid',
            'projectUuid',
            'full',
        ]);
    });

    describe('project resolution', () => {
        it('prefers the explicit projectUuid argument', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, get, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                chartProjectUuid: 'explicit-project-uuid',
            });
            registerSavedChartTools(registry, deps);

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
            expect(get).toHaveBeenCalledWith('chart-uuid', context.account, {
                projectUuid: 'explicit-project-uuid',
            });
        });

        it('falls back to the project set in the MCP context', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, get, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                chartProjectUuid: 'context-project-uuid',
            });
            registerSavedChartTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });
            await registered[0].handler(
                { savedChartUuid: 'chart-uuid' },
                context,
            );

            expect(getContext).toHaveBeenCalledWith('user-uuid', 'org-uuid');
            expect(get).toHaveBeenCalledWith('chart-uuid', context.account, {
                projectUuid: 'context-project-uuid',
            });
        });

        it('throws a ForbiddenError when there is no project context', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerSavedChartTools(registry, deps);

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
            ).rejects.toThrow(
                'No project context set. Use set_project or provide projectUuid parameter.',
            );
        });

        it('throws a ForbiddenError when the user cannot view the project', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'hidden-project-uuid',
                chartProjectUuid: 'hidden-project-uuid',
            });
            registerSavedChartTools(registry, deps);

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

        it('throws a ForbiddenError when the chart is in another project', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                chartProjectUuid: 'other-project-uuid',
            });
            registerSavedChartTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });

            await expect(
                registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('get_saved_chart', () => {
        it('returns the chart summary with the web url and the chart kind', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerSavedChartTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler(
                    { savedChartUuid: 'chart-uuid' },
                    context,
                ),
            );

            expect(result.uuid).toEqual('chart-uuid');
            expect(result.name).toEqual('Revenue by month');
            expect(result.projectUuid).toEqual('project-uuid');
            expect(result.spaceUuid).toEqual('space-uuid');
            expect(result.chartKind).toEqual(ChartKind.PIE);
            expect(result.chartType).toEqual(ChartType.PIE);
            expect(result.webUrl).toEqual(
                'https://lightdash.example.com/projects/project-uuid/saved/chart-uuid',
            );
            expect(result.metricQuery).toBeUndefined();
        });

        it('returns the chart configuration when full is true', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerSavedChartTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler(
                    { savedChartUuid: 'chart-uuid', full: true },
                    context,
                ),
            );

            expect(result.metricQuery).toEqual({
                dimensions: [],
                metrics: [],
            });
            expect(result.chartConfig).toEqual({
                type: ChartType.PIE,
                config: { series: [] },
            });
        });
    });
});

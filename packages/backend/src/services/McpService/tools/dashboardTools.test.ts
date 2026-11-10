import {
    AnyType,
    ChartKind,
    DashboardTileTypes,
    ForbiddenError,
} from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { registerDashboardTools } from './dashboardTools';
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

const buildTiles = () =>
    [
        {
            uuid: 'tile-uuid',
            type: DashboardTileTypes.SAVED_CHART,
            x: 0,
            y: 0,
            h: 6,
            w: 6,
            tabUuid: 'tab-uuid',
            properties: {
                title: 'Revenue',
                savedChartUuid: 'chart-uuid',
                chartName: 'Revenue by month',
                lastVersionChartKind: ChartKind.LINE,
                chartSlug: 'revenue-by-month',
            },
        },
        {
            uuid: 'markdown-tile-uuid',
            type: DashboardTileTypes.MARKDOWN,
            x: 6,
            y: 0,
            h: 3,
            w: 6,
            tabUuid: 'tab-uuid',
            properties: {
                title: 'Some notes',
                content: 'hello',
            },
        },
    ] as unknown as AnyType[];

const buildDashboard = (projectUuid = 'project-uuid') => ({
    uuid: 'dashboard-uuid',
    name: 'Finance dashboard',
    description: 'All the finance charts',
    organizationUuid: 'org-uuid',
    projectUuid,
    spaceUuid: 'space-uuid',
    spaceName: 'Finance',
    slug: 'finance-dashboard',
    isPrivate: false,
    views: 12,
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedByUser: undefined,
    tiles: buildTiles(),
    filters: {},
    parameters: {},
    tabs: [],
    config: undefined,
});

const buildDeps = ({
    contextProjectUuid,
    dashboardProjectUuid = 'project-uuid',
    visibleProjectUuids = ['project-uuid'],
}: {
    contextProjectUuid?: string;
    dashboardProjectUuid?: string;
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

    const getByIdOrSlug = jest
        .fn()
        .mockResolvedValue(buildDashboard(dashboardProjectUuid));

    const deps = {
        projectService: { getProject },
        mcpContextModel: { getContext },
        organizationModel: {
            get: jest.fn().mockResolvedValue({
                organizationUuid: 'org-uuid',
                defaultProjectUuid: undefined,
            }),
        },
        dashboardService: { getByIdOrSlug },
        lightdashConfig: { siteUrl: 'https://lightdash.example.com' },
    } as unknown as McpToolDeps;

    return { deps, getContext, getProject, getByIdOrSlug };
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

describe('registerDashboardTools', () => {
    it('registers the get_dashboard_code and get_dashboard_tiles tools', () => {
        const { registry, registered } = buildRegistry();
        registerDashboardTools(registry, buildDeps().deps);

        expect(registered.map((tool) => tool.name)).toEqual([
            McpToolName.GET_DASHBOARD_CODE,
            McpToolName.GET_DASHBOARD_TILES,
        ]);
        expect(registered[0].name).toEqual('get_dashboard_code');
        expect(registered[1].name).toEqual('get_dashboard_tiles');
        expect(registered[0].config.description).toBeDefined();
        expect(registered[1].config.description).toBeDefined();
    });

    describe('project resolution', () => {
        it('prefers the explicit projectUuid argument', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getByIdOrSlug, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                dashboardProjectUuid: 'explicit-project-uuid',
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            registerDashboardTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            await registered[0].handler(
                {
                    dashboardUuid: 'dashboard-uuid',
                    projectUuid: 'explicit-project-uuid',
                },
                context,
            );

            expect(getContext).not.toHaveBeenCalled();
            expect(getByIdOrSlug).toHaveBeenCalledWith(
                context.user,
                'dashboard-uuid',
                { projectUuid: 'explicit-project-uuid' },
            );
        });

        it('falls back to the project set in the MCP context', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getByIdOrSlug, getContext } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                dashboardProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['context-project-uuid'],
            });
            registerDashboardTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });
            await registered[0].handler(
                { dashboardUuid: 'dashboard-uuid' },
                context,
            );

            expect(getContext).toHaveBeenCalledWith('user-uuid', 'org-uuid');
            expect(getByIdOrSlug).toHaveBeenCalledWith(
                context.user,
                'dashboard-uuid',
                { projectUuid: 'context-project-uuid' },
            );
        });

        it('throws a ForbiddenError when no default project resolves', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerDashboardTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[0].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                registered[1].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            ).rejects.toThrow(NO_DEFAULT_PROJECT_ERROR);
        });

        it('throws a ForbiddenError when no level of the fallback chain is viewable', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'hidden-project-uuid',
                dashboardProjectUuid: 'hidden-project-uuid',
                visibleProjectUuids: ['other-project-uuid'],
            });
            registerDashboardTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['other-project-uuid'],
            });

            await expect(
                registered[0].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        it('throws a ForbiddenError when the dashboard is in another project', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                dashboardProjectUuid: 'other-project-uuid',
            });
            registerDashboardTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });

            await expect(
                registered[0].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('get_dashboard_code', () => {
        it('returns the dashboard summary and its tiles', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerDashboardTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            );

            expect(result.uuid).toEqual('dashboard-uuid');
            expect(result.name).toEqual('Finance dashboard');
            expect(result.projectUuid).toEqual('project-uuid');
            expect(result.spaceUuid).toEqual('space-uuid');
            expect(result.webUrl).toEqual(
                'https://lightdash.example.com/projects/project-uuid/dashboards/dashboard-uuid/view',
            );
            expect(result.tileCount).toEqual(2);
            expect(result.tiles[0]).toEqual({
                uuid: 'tile-uuid',
                type: DashboardTileTypes.SAVED_CHART,
                title: 'Revenue',
                x: 0,
                y: 0,
                h: 6,
                w: 6,
                tabUuid: 'tab-uuid',
                chartUuid: 'chart-uuid',
                chartName: 'Revenue by month',
                chartKind: ChartKind.LINE,
                chartSlug: 'revenue-by-month',
            });
            expect(result.tiles[1].chartUuid).toBeNull();
            expect(result.tiles[1].chartKind).toBeNull();
            expect(result.rawTiles).toBeUndefined();
        });

        it('returns the dashboard configuration when full is true', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerDashboardTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[0].handler(
                    { dashboardUuid: 'dashboard-uuid', full: true },
                    context,
                ),
            );

            expect(result.filters).toEqual({});
            expect(result.rawTiles).toHaveLength(2);
        });
    });

    describe('get_dashboard_tiles', () => {
        it('returns only the tile list', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerDashboardTools(registry, deps);

            const context = buildContext();
            const result = parseResult(
                await registered[1].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    context,
                ),
            );

            expect(result.dashboardUuid).toEqual('dashboard-uuid');
            expect(result.tileCount).toEqual(2);
            expect(result.tiles).toHaveLength(2);
            expect(result.tiles[0].chartUuid).toEqual('chart-uuid');
            expect(result.tiles[0].chartKind).toEqual(ChartKind.LINE);
            expect(result.filters).toBeUndefined();
        });
    });
});

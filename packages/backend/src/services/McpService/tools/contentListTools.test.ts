import {
    AnyType,
    ContentType,
    DashboardTileTypes,
    ForbiddenError,
    SummaryContent,
} from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { registerContentListTools } from './contentListTools';
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

const buildContent = (overrides: AnyType = {}): SummaryContent =>
    ({
        contentType: ContentType.CHART,
        uuid: 'chart-uuid',
        slug: 'my-chart',
        name: 'My chart',
        description: 'A chart',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        createdBy: null,
        lastUpdatedAt: new Date('2024-02-02T00:00:00.000Z'),
        lastUpdatedBy: null,
        project: { uuid: 'project-uuid', name: 'Demo project' },
        organization: { uuid: 'org-uuid', name: 'Demo org' },
        space: { uuid: 'space-uuid', name: 'Demo space' },
        pinnedList: null,
        views: 3,
        firstViewedAt: null,
        source: 'dbt_explore',
        chartKind: 'line',
        dashboard: null,
        ...overrides,
    } as unknown as SummaryContent);

const buildDeps = ({
    contextProjectUuid,
    contents = [buildContent()],
    supportsContentVerification = false,
    visibleProjectUuids = ['project-uuid'],
}: {
    contextProjectUuid?: string;
    contents?: SummaryContent[];
    supportsContentVerification?: boolean;
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

    const find = jest.fn().mockResolvedValue({
        data: contents,
        pagination: {
            page: 1,
            pageSize: 50,
            totalPageCount: 1,
            totalResults: contents.length,
        },
    });

    const getByIdOrSlug = jest.fn().mockResolvedValue({
        uuid: 'dashboard-uuid',
        name: 'My dashboard',
        projectUuid: 'project-uuid',
        spaceUuid: 'space-uuid',
        updatedAt: new Date('2024-03-03T00:00:00.000Z'),
        tiles: [
            {
                uuid: 'tile-1',
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 0,
                h: 0,
                w: 0,
                tabUuid: undefined,
                properties: {
                    title: 'Revenue',
                    savedChartUuid: 'chart-uuid',
                    chartName: 'Revenue chart',
                    lastVersionChartKind: 'line',
                },
            },
            {
                uuid: 'tile-2',
                type: DashboardTileTypes.MARKDOWN,
                x: 0,
                y: 0,
                h: 0,
                w: 0,
                tabUuid: undefined,
                properties: { title: 'Notes', content: 'hello' },
            },
        ],
    });

    const contentService: AnyType = { find };
    if (supportsContentVerification) {
        contentService.listVerifiedContent = jest.fn();
    }

    const deps = {
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
        },
        contentService,
        projectService: { getProject },
        dashboardService: { getByIdOrSlug },
        mcpContextModel: { getContext },
        organizationModel: {
            get: jest.fn().mockResolvedValue({
                organizationUuid: 'org-uuid',
                defaultProjectUuid: undefined,
            }),
        },
    } as unknown as McpToolDeps;

    return { deps, getContext, getProject, find, getByIdOrSlug };
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
            abilityRules: [{ action: 'view', subject: 'Project' }],
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

describe('registerContentListTools', () => {
    it('registers the four content list tools', () => {
        const { registry, registered } = buildRegistry();
        registerContentListTools(registry, buildDeps().deps);

        expect(registered.map((tool) => tool.name)).toEqual([
            McpToolName.LIST_SPACES,
            McpToolName.LIST_DASHBOARDS,
            McpToolName.LIST_CHARTS,
            McpToolName.LIST_VERIFIED_CONTENT,
        ]);
        expect(registered.map((tool) => tool.name)).toEqual([
            'list_spaces',
            'list_dashboards',
            'list_charts',
            'list_verified_content',
        ]);
        registered.forEach((tool) => {
            expect(tool.config.description).toBeDefined();
            expect(tool.config.inputSchema).toBeDefined();
        });
    });

    describe('project resolution', () => {
        it('prefers the explicit projectUuid argument', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getContext, find } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            registerContentListTools(registry, deps);

            await registered[0].handler(
                { projectUuid: 'explicit-project-uuid' },
                buildContext({ visibleProjectUuids: ['explicit-project-uuid'] }),
            );

            expect(getContext).not.toHaveBeenCalled();
            expect(find.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    projectUuids: ['explicit-project-uuid'],
                }),
            );
        });

        it('falls back to the project set in the MCP context', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getContext, find } = buildDeps({
                contextProjectUuid: 'context-project-uuid',
                visibleProjectUuids: ['context-project-uuid'],
            });
            registerContentListTools(registry, deps);

            await registered[0].handler(
                {},
                buildContext({ visibleProjectUuids: ['context-project-uuid'] }),
            );

            expect(getContext).toHaveBeenCalledWith('user-uuid', 'org-uuid');
            expect(find.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    projectUuids: ['context-project-uuid'],
                }),
            );
        });

        it('throws a ForbiddenError when no default project resolves', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps();
            registerContentListTools(registry, deps);

            await expect(
                registered[0].handler({}, buildContext()),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                registered[0].handler({}, buildContext()),
            ).rejects.toThrow(NO_DEFAULT_PROJECT_ERROR);
        });

        it('throws a ForbiddenError when no level of the fallback chain is viewable', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'hidden-project-uuid',
            });
            registerContentListTools(registry, deps);

            await expect(
                registered[0].handler({}, buildContext()),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(find).not.toHaveBeenCalled();
        });
    });

    describe('filters', () => {
        it('lists the spaces of the project', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentListTools(registry, deps);

            await registered[0].handler({}, buildContext());

            expect(find.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    projectUuids: ['project-uuid'],
                    contentTypes: [ContentType.SPACE],
                }),
            );
            expect(find.mock.calls[0][1].spaceUuids).toBeUndefined();
            expect(find.mock.calls[0][3]).toEqual({ page: 1, pageSize: 50 });
        });

        it('lists the dashboards of a space', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentListTools(registry, deps);

            await registered[1].handler(
                { spaceUuid: 'space-uuid', page: 2, pageSize: 10 },
                buildContext(),
            );

            expect(find.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    projectUuids: ['project-uuid'],
                    spaceUuids: ['space-uuid'],
                    contentTypes: [ContentType.DASHBOARD],
                }),
            );
            expect(find.mock.calls[0][3]).toEqual({ page: 2, pageSize: 10 });
        });

        it('reports that the content verification feature is not supported', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentListTools(registry, deps);

            const result = parseResult(
                await registered[3].handler({}, buildContext()),
            );

            expect(result).toEqual(
                expect.objectContaining({
                    error: expect.any(String),
                    supported: false,
                }),
            );
            expect(find).not.toHaveBeenCalled();
        });

        it('queries charts and dashboards for the verified content', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
                supportsContentVerification: true,
            });
            registerContentListTools(registry, deps);

            await registered[3].handler({}, buildContext());

            expect(find.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    projectUuids: ['project-uuid'],
                    contentTypes: [ContentType.CHART, ContentType.DASHBOARD],
                }),
            );
        });
    });

    describe('list_charts', () => {
        it('returns the saved chart tiles of the dashboard', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, getByIdOrSlug } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentListTools(registry, deps);

            const result = parseResult(
                await registered[2].handler(
                    { dashboardUuid: 'dashboard-uuid' },
                    buildContext(),
                ),
            );

            expect(getByIdOrSlug).toHaveBeenCalledWith(
                expect.anything(),
                'dashboard-uuid',
            );
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(
                expect.objectContaining({
                    uuid: 'chart-uuid',
                    name: 'Revenue chart',
                    contentType: ContentType.CHART,
                    projectUuid: 'project-uuid',
                    spaceUuid: 'space-uuid',
                    dashboardUuid: 'dashboard-uuid',
                    chartKind: 'line',
                    webUrl: 'https://lightdash.example.com/projects/project-uuid/saved/chart-uuid',
                }),
            );
        });

        it('throws a ForbiddenError when the dashboard is in another project', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerContentListTools(registry, deps);

            await expect(
                registered[2].handler(
                    {
                        dashboardUuid: 'dashboard-uuid',
                        projectUuid: 'other-project-uuid',
                    },
                    buildContext({
                        visibleProjectUuids: ['other-project-uuid'],
                    }),
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('output', () => {
        it('returns the compact summary by default', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerContentListTools(registry, deps);

            const result = parseResult(
                await registered[0].handler({}, buildContext()),
            );

            expect(result[0]).toEqual({
                uuid: 'chart-uuid',
                name: 'My chart',
                contentType: ContentType.CHART,
                projectUuid: 'project-uuid',
                spaceUuid: 'space-uuid',
                spaceName: 'Demo space',
                description: 'A chart',
                updatedAt: '2024-02-02T00:00:00.000Z',
                webUrl: 'https://lightdash.example.com/projects/project-uuid/saved/chart-uuid',
            });
        });

        it('returns the full content summary when full=true', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerContentListTools(registry, deps);

            const result = parseResult(
                await registered[0].handler({ full: true }, buildContext()),
            );

            expect(result[0].chartKind).toEqual('line');
            expect(result[0].webUrl).toEqual(
                'https://lightdash.example.com/projects/project-uuid/saved/chart-uuid',
            );
        });
    });
});

import {
    AnyType,
    ContentType,
    ForbiddenError,
    SummaryContent,
} from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { NO_DEFAULT_PROJECT_ERROR } from './projectContext';
import { McpToolRegistry } from './registry';
import { registerContentSearchTools } from './contentSearchTools';
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

    const find = jest.fn().mockResolvedValue({
        data: [buildContent()],
        pagination: {
            page: 1,
            pageSize: 50,
            totalPageCount: 1,
            totalResults: 1,
        },
    });

    const deps = {
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
        },
        contentService: { find },
        projectService: { getProject },
        mcpContextModel: { getContext },
        organizationModel: {
            get: jest.fn().mockResolvedValue({
                organizationUuid: 'org-uuid',
                defaultProjectUuid: undefined,
            }),
        },
    } as unknown as McpToolDeps;

    return { deps, getContext, getProject, find };
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

describe('registerContentSearchTools', () => {
    it('registers the four content search tools', () => {
        const { registry, registered } = buildRegistry();
        registerContentSearchTools(registry, buildDeps().deps);

        expect(registered.map((tool) => tool.name)).toEqual([
            McpToolName.FIND_CONTENT,
            McpToolName.FIND_CHARTS,
            McpToolName.FIND_DASHBOARDS,
            McpToolName.FIND_SPACES,
        ]);
        expect(registered.map((tool) => tool.name)).toEqual([
            'find_content',
            'find_charts',
            'find_dashboards',
            'find_spaces',
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
            registerContentSearchTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['explicit-project-uuid'],
            });
            await registered[0].handler(
                {
                    projectUuid: 'explicit-project-uuid',
                    searchQueries: [{ label: 'revenue' }],
                },
                context,
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
            registerContentSearchTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['context-project-uuid'],
            });
            await registered[0].handler(
                { searchQueries: [{ label: 'revenue' }] },
                context,
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
            registerContentSearchTools(registry, deps);

            const context = buildContext();

            await expect(
                registered[0].handler(
                    { searchQueries: [{ label: 'revenue' }] },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                registered[0].handler(
                    { searchQueries: [{ label: 'revenue' }] },
                    context,
                ),
            ).rejects.toThrow(NO_DEFAULT_PROJECT_ERROR);
        });

        it('throws a ForbiddenError when no level of the fallback chain is viewable', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'hidden-project-uuid',
                visibleProjectUuids: ['other-project-uuid'],
            });
            registerContentSearchTools(registry, deps);

            const context = buildContext({
                visibleProjectUuids: ['other-project-uuid'],
            });

            await expect(
                registered[0].handler(
                    { searchQueries: [{ label: 'revenue' }] },
                    context,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(find).not.toHaveBeenCalled();
        });
    });

    describe('search filters', () => {
        it('searches charts, dashboards and spaces for find_content', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentSearchTools(registry, deps);

            await registered[0].handler(
                { searchQueries: [{ label: 'revenue' }] },
                buildContext(),
            );

            const call = find.mock.calls[0];
            expect(call[1]).toEqual(
                expect.objectContaining({
                    projectUuids: ['project-uuid'],
                    contentTypes: [
                        ContentType.CHART,
                        ContentType.DASHBOARD,
                        ContentType.SPACE,
                    ],
                    search: 'revenue',
                }),
            );
            expect(call[3]).toEqual({ page: 1, pageSize: 50 });
        });

        it('restricts the content type for each specialised tool', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentSearchTools(registry, deps);

            const context = buildContext();
            await registered[1].handler(
                { searchQueries: [{ label: 'revenue' }] },
                context,
            );
            await registered[2].handler(
                { searchQueries: [{ label: 'revenue' }] },
                context,
            );
            await registered[3].handler(
                { searchQueries: [{ label: 'revenue' }] },
                context,
            );

            expect(find.mock.calls[0][1].contentTypes).toEqual([
                ContentType.CHART,
            ]);
            expect(find.mock.calls[1][1].contentTypes).toEqual([
                ContentType.DASHBOARD,
            ]);
            expect(find.mock.calls[2][1].contentTypes).toEqual([
                ContentType.SPACE,
            ]);
        });

        it('runs one search per query and returns the results per label', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentSearchTools(registry, deps);

            const result = parseResult(
                await registered[0].handler(
                    {
                        searchQueries: [
                            { label: 'revenue' },
                            { label: 'orders' },
                        ],
                    },
                    buildContext(),
                ),
            );

            expect(find).toHaveBeenCalledTimes(2);
            expect(find.mock.calls[0][1].search).toEqual('revenue');
            expect(find.mock.calls[1][1].search).toEqual('orders');
            expect(result).toHaveLength(2);
            expect(result[0].label).toEqual('revenue');
            expect(result[1].label).toEqual('orders');
        });

        it('passes the pagination arguments through', async () => {
            const { registry, registered } = buildRegistry();
            const { deps, find } = buildDeps({
                contextProjectUuid: 'project-uuid',
            });
            registerContentSearchTools(registry, deps);

            await registered[0].handler(
                {
                    searchQueries: [{ label: 'revenue' }],
                    page: 2,
                    pageSize: 10,
                },
                buildContext(),
            );

            expect(find.mock.calls[0][3]).toEqual({ page: 2, pageSize: 10 });
        });
    });

    describe('output', () => {
        it('returns the compact summary by default', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerContentSearchTools(registry, deps);

            const result = parseResult(
                await registered[0].handler(
                    { searchQueries: [{ label: 'revenue' }] },
                    buildContext(),
                ),
            );

            expect(result[0].results[0]).toEqual({
                uuid: 'chart-uuid',
                name: 'My chart',
                contentType: ContentType.CHART,
                projectUuid: 'project-uuid',
                spaceUuid: 'space-uuid',
                spaceName: 'Demo space',
                description: 'A chart',
                updatedAt: '2024-02-02T00:00:00.000Z',
                webUrl:
                    'https://lightdash.example.com/projects/project-uuid/saved/chart-uuid',
            });
        });

        it('returns the full content summary when full=true', async () => {
            const { registry, registered } = buildRegistry();
            const { deps } = buildDeps({ contextProjectUuid: 'project-uuid' });
            registerContentSearchTools(registry, deps);

            const result = parseResult(
                await registered[0].handler(
                    { searchQueries: [{ label: 'revenue' }], full: true },
                    buildContext(),
                ),
            );

            expect(result[0].results[0].chartKind).toEqual('line');
            expect(result[0].results[0].webUrl).toEqual(
                'https://lightdash.example.com/projects/project-uuid/saved/chart-uuid',
            );
        });
    });
});

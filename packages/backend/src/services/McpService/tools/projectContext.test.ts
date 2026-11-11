import {
    AnyType,
    Explore,
    ForbiddenError,
    NotFoundError,
} from '@lightdash/common';
import { LightdashConfig } from '../../../config/parseConfig';
import { McpService } from '../McpService';
import { McpToolDeps } from './deps';
import {
    NO_DEFAULT_PROJECT_ERROR,
    NO_DEFAULT_PROJECT_HINT,
    resolveProjectContext,
} from './projectContext';
import { McpToolContext } from './types';

// The warehouses package pulls in native warehouse drivers, which are not
// needed to test the MCP project context.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

const buildContext = (): McpToolContext =>
    ({
        user: {
            userUuid: 'user-uuid',
            organizationUuid: 'org-uuid',
        } as AnyType,
        account: {} as AnyType,
        ability: {} as AnyType,
        organizationUuid: 'org-uuid',
        authType: 'pat',
        scopes: [],
    } as AnyType);

/**
 * Deps mock for the helper level tests. `getProject` mirrors
 * `ProjectService.getProject`: it throws when the account cannot view the
 * project, which is how every level of the chain is validated.
 */
const buildHelperDeps = ({
    contextProjectUuid,
    organizationDefaultProjectUuid,
    serverDefaultProjectUuid,
    unviewableProjectUuids = [],
}: {
    contextProjectUuid?: string;
    organizationDefaultProjectUuid?: string;
    serverDefaultProjectUuid?: string | null;
    unviewableProjectUuids?: string[];
} = {}) => {
    const getContext = jest.fn().mockResolvedValue(
        contextProjectUuid
            ? {
                  context: {
                      projectUuid: contextProjectUuid,
                      projectName: 'Demo project',
                      tags: null,
                  },
              }
            : undefined,
    );

    const organizationGet = jest.fn().mockResolvedValue({
        organizationUuid: 'org-uuid',
        defaultProjectUuid: organizationDefaultProjectUuid,
    });

    const getProject = jest.fn().mockImplementation(async (projectUuid) => {
        if (unviewableProjectUuids.includes(projectUuid)) {
            throw new ForbiddenError();
        }
        return {
            projectUuid,
            organizationUuid: 'org-uuid',
            name: 'Demo project',
        };
    });

    const deps = {
        mcpContextModel: { getContext },
        organizationModel: { get: organizationGet },
        projectService: { getProject },
        lightdashConfig: {
            mcp: { defaultProjectUuid: serverDefaultProjectUuid ?? null },
        },
    } as unknown as McpToolDeps;

    return { deps, getContext, organizationGet, getProject };
};

describe('resolveProjectContext (four level fallback chain)', () => {
    it('returns source "argument" when the explicit projectUuid is valid', async () => {
        const { deps, getContext, organizationGet } = buildHelperDeps({
            contextProjectUuid: 'user-project',
            organizationDefaultProjectUuid: 'org-project',
        });

        const resolved = await resolveProjectContext(
            deps,
            buildContext(),
            'explicit-project',
        );

        expect(resolved).toEqual({
            projectUuid: 'explicit-project',
            source: 'argument',
        });
        expect(getContext).not.toHaveBeenCalled();
        expect(organizationGet).not.toHaveBeenCalled();
    });

    it('throws without fallback when the explicit project is not viewable', async () => {
        const { deps, getContext, organizationGet } = buildHelperDeps({
            organizationDefaultProjectUuid: 'org-project',
            unviewableProjectUuids: ['hidden-project'],
        });

        await expect(
            resolveProjectContext(deps, buildContext(), 'hidden-project'),
        ).rejects.toBeInstanceOf(ForbiddenError);

        // An explicit argument must never be silently replaced with a
        // default: no implicit level is even consulted.
        expect(getContext).not.toHaveBeenCalled();
        expect(organizationGet).not.toHaveBeenCalled();
    });

    it('returns source "user_default" when the context has a valid project', async () => {
        const { deps, organizationGet } = buildHelperDeps({
            contextProjectUuid: 'user-project',
            organizationDefaultProjectUuid: 'org-project',
        });

        const resolved = await resolveProjectContext(deps, buildContext());

        expect(resolved).toEqual({
            projectUuid: 'user-project',
            source: 'user_default',
        });
        expect(organizationGet).not.toHaveBeenCalled();
    });

    it('falls through the user default to the organization default when the stored project is stale', async () => {
        const { deps, getProject } = buildHelperDeps({
            contextProjectUuid: 'stale-user-project',
            organizationDefaultProjectUuid: 'org-project',
            unviewableProjectUuids: ['stale-user-project'],
        });

        const resolved = await resolveProjectContext(deps, buildContext());

        expect(resolved).toEqual({
            projectUuid: 'org-project',
            source: 'organization_default',
        });
        // Every level is validated: the stale user default first, then the
        // organization default.
        expect(getProject.mock.calls.map((call) => call[0])).toEqual([
            'stale-user-project',
            'org-project',
        ]);
    });

    it('returns source "organization_default" when there is no user default', async () => {
        const { deps, getContext, getProject } = buildHelperDeps({
            organizationDefaultProjectUuid: 'org-project',
        });

        const resolved = await resolveProjectContext(deps, buildContext());

        expect(resolved).toEqual({
            projectUuid: 'org-project',
            source: 'organization_default',
        });
        expect(getContext).toHaveBeenCalledWith('user-uuid', 'org-uuid');
        // The organization default is permission-checked before it wins.
        expect(getProject).toHaveBeenCalledWith('org-project', expect.anything());
    });

    it('returns source "server_default" when only the deployment default is set', async () => {
        const { deps, getProject } = buildHelperDeps({
            serverDefaultProjectUuid: 'server-project',
        });

        const resolved = await resolveProjectContext(deps, buildContext());

        expect(resolved).toEqual({
            projectUuid: 'server-project',
            source: 'server_default',
        });
        // The deployment default is permission-checked before it wins.
        expect(getProject).toHaveBeenCalledWith(
            'server-project',
            expect.anything(),
        );
    });

    it('falls through the organization default to the server default when it is not viewable', async () => {
        const { deps } = buildHelperDeps({
            organizationDefaultProjectUuid: 'stale-org-project',
            serverDefaultProjectUuid: 'server-project',
            unviewableProjectUuids: ['stale-org-project'],
        });

        const resolved = await resolveProjectContext(deps, buildContext());

        expect(resolved).toEqual({
            projectUuid: 'server-project',
            source: 'server_default',
        });
    });

    it('throws ForbiddenError with the shared error and hint when every level is missing', async () => {
        const { deps } = buildHelperDeps();

        const error = await resolveProjectContext(
            deps,
            buildContext(),
        ).catch((e) => e);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect(error.message).toEqual(
            `${NO_DEFAULT_PROJECT_ERROR} ${NO_DEFAULT_PROJECT_HINT}`,
        );
        expect(error.message).toContain(NO_DEFAULT_PROJECT_ERROR);
        expect(error.message).toContain(NO_DEFAULT_PROJECT_HINT);
    });
});

/**
 * Explore fixture for the catalogTags tests: it matches the tags `a` and `b`
 * at the explore level (no field level tags), so tag filtering can hide or
 * expose it depending on the effective tags.
 */
const buildExplore = (tags: string[]): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        tags,
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
                description: null,
                lineageGraph: {},
                requiredAttributes: undefined,
                dimensions: {
                    status: {
                        name: 'status',
                        label: 'Status',
                        table: 'orders',
                        tableLabel: 'Orders',
                    },
                },
                metrics: {
                    total: {
                        name: 'total',
                        label: 'Total',
                        table: 'orders',
                        tableLabel: 'Orders',
                    },
                },
            },
        },
    } as unknown as Explore);

const buildAgentContext = (): McpToolContext => {
    const ability = {
        can: jest.fn(() => true),
        cannot: jest.fn(() => false),
    };

    return {
        user: {
            userUuid: 'user-uuid',
            organizationUuid: 'org-uuid',
            ability,
        } as AnyType,
        account: { user: { ability } } as AnyType,
        ability: ability as AnyType,
        organizationUuid: 'org-uuid',
        authType: 'pat',
        scopes: [],
    } as AnyType;
};

const buildMcpService = ({
    contextTags = null,
    exploreTags = ['a', 'b'],
}: {
    contextTags?: string[] | null;
    exploreTags?: string[];
} = {}) => {
    const getContext = jest.fn().mockResolvedValue({
        context: {
            projectUuid: 'project-uuid',
            projectName: 'Demo project',
            tags: contextTags,
        },
    });

    const searchCatalog = jest.fn().mockResolvedValue({
        data: [],
        pagination: {
            page: 1,
            pageSize: 15,
            totalPageCount: 0,
            totalResults: 0,
        },
    });

    const mcpService = new McpService({
        lightdashConfig: {
            mcp: {
                enabled: true,
                oauthRequiredScopes: [],
                defaultProjectUuid: null,
            },
        } as AnyType as LightdashConfig,
        analytics: {} as AnyType,
        catalogService: { searchCatalog } as AnyType,
        projectModel: {
            findExploresFromCache: jest
                .fn()
                .mockResolvedValue({ orders: buildExplore(exploreTags) }),
        } as AnyType,
        projectService: {
            getProject: jest.fn().mockResolvedValue({
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                name: 'Demo project',
            }),
        } as AnyType,
        userAttributesModel: {
            getAttributeValuesForOrgMember: jest.fn().mockResolvedValue({}),
        } as AnyType,
        searchModel: {} as AnyType,
        spaceModel: {} as AnyType,
        spaceService: {} as AnyType,
        mcpContextModel: { getContext } as AnyType,
        organizationModel: {
            get: jest.fn().mockResolvedValue({
                organizationUuid: 'org-uuid',
                defaultProjectUuid: undefined,
            }),
        } as AnyType,
        featureFlagService: {} as AnyType,
        contentService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        searchService: {} as AnyType,
    });

    return { mcpService, searchCatalog };
};

describe('catalogTags priority (find_explores / find_fields)', () => {
    it('find_explores: the explicit catalogTags override the context tags', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: ['b'],
        });

        const findExplores = await mcpService.getFindExploresFunction(
            {
                type: 'find_explores_v2',
                exploreName: 'orders',
                projectUuid: 'project-uuid',
                catalogTags: ['a'],
            },
            buildAgentContext(),
        );
        await findExplores({ exploreName: 'orders', fieldSearchSize: 5 });

        expect(searchCatalog).toHaveBeenCalledTimes(2);
        expect(searchCatalog.mock.calls[0][0].catalogSearch.yamlTags).toEqual(
            ['a'],
        );
    });

    it('find_explores: an empty catalogTags array disables tag filtering', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: ['b'],
        });

        const findExplores = await mcpService.getFindExploresFunction(
            {
                type: 'find_explores_v2',
                exploreName: 'orders',
                projectUuid: 'project-uuid',
                catalogTags: [],
            },
            buildAgentContext(),
        );
        await findExplores({ exploreName: 'orders', fieldSearchSize: 5 });

        expect(searchCatalog).toHaveBeenCalledTimes(2);
        expect(searchCatalog.mock.calls[0][0].catalogSearch.yamlTags).toBe(
            undefined,
        );
    });

    it('find_explores: the context tags apply when catalogTags is not given', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: ['b'],
        });

        const findExplores = await mcpService.getFindExploresFunction(
            {
                type: 'find_explores_v2',
                exploreName: 'orders',
                projectUuid: 'project-uuid',
            },
            buildAgentContext(),
        );
        await findExplores({ exploreName: 'orders', fieldSearchSize: 5 });

        expect(searchCatalog).toHaveBeenCalledTimes(2);
        expect(searchCatalog.mock.calls[0][0].catalogSearch.yamlTags).toEqual(
            ['b'],
        );
    });

    it('find_explores: nothing filters when there are no catalogTags and no context tags', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: null,
        });

        const findExplores = await mcpService.getFindExploresFunction(
            {
                type: 'find_explores_v2',
                exploreName: 'orders',
                projectUuid: 'project-uuid',
            },
            buildAgentContext(),
        );
        await findExplores({ exploreName: 'orders', fieldSearchSize: 5 });

        expect(searchCatalog).toHaveBeenCalledTimes(2);
        expect(searchCatalog.mock.calls[0][0].catalogSearch.yamlTags).toBe(
            undefined,
        );
    });

    it('find_fields: the explicit catalogTags override the context tags', async () => {
        // The explore only matches the context tag 'b': an explicit
        // catalogTags override must hide it.
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: ['b'],
            exploreTags: ['b'],
        });

        const findFields = await mcpService.getFindFieldsFunction(
            {
                type: 'find_fields',
                table: 'orders',
                fieldSearchQueries: [{ label: 'Total' }],
                page: 1,
                projectUuid: 'project-uuid',
                catalogTags: ['a'],
            },
            buildAgentContext(),
        );

        await expect(
            findFields({
                table: 'orders',
                fieldSearchQuery: { label: 'Total' },
                page: 1,
                pageSize: 15,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(searchCatalog).not.toHaveBeenCalled();
    });

    it('find_fields: an empty catalogTags array disables tag filtering', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: ['b'],
            exploreTags: ['b'],
        });

        const findFields = await mcpService.getFindFieldsFunction(
            {
                type: 'find_fields',
                table: 'orders',
                fieldSearchQueries: [{ label: 'Total' }],
                page: 1,
                projectUuid: 'project-uuid',
                catalogTags: [],
            },
            buildAgentContext(),
        );
        await findFields({
            table: 'orders',
            fieldSearchQuery: { label: 'Total' },
            page: 1,
            pageSize: 15,
        });

        expect(searchCatalog).toHaveBeenCalledTimes(1);
    });

    it('find_fields: the context tags apply when catalogTags is not given', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: ['b'],
            exploreTags: ['b'],
        });

        const findFields = await mcpService.getFindFieldsFunction(
            {
                type: 'find_fields',
                table: 'orders',
                fieldSearchQueries: [{ label: 'Total' }],
                page: 1,
                projectUuid: 'project-uuid',
            },
            buildAgentContext(),
        );
        await findFields({
            table: 'orders',
            fieldSearchQuery: { label: 'Total' },
            page: 1,
            pageSize: 15,
        });

        expect(searchCatalog).toHaveBeenCalledTimes(1);
    });

    it('find_fields: nothing filters when there are no catalogTags and no context tags', async () => {
        const { mcpService, searchCatalog } = buildMcpService({
            contextTags: null,
            exploreTags: ['b'],
        });

        const findFields = await mcpService.getFindFieldsFunction(
            {
                type: 'find_fields',
                table: 'orders',
                fieldSearchQueries: [{ label: 'Total' }],
                page: 1,
                projectUuid: 'project-uuid',
            },
            buildAgentContext(),
        );
        await findFields({
            table: 'orders',
            fieldSearchQuery: { label: 'Total' },
            page: 1,
            pageSize: 15,
        });

        expect(searchCatalog).toHaveBeenCalledTimes(1);
    });
});

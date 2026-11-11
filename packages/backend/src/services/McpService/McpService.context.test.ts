import { AnyType, ForbiddenError } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { McpToolContext } from './tools/types';
import { McpToolRegistry } from './tools/registry';
import {
    NO_DEFAULT_PROJECT_ERROR,
    NO_DEFAULT_PROJECT_HINT,
} from './tools/projectContext';
import { McpService } from './McpService';

// The warehouses package pulls in native warehouse drivers, which are not
// needed to test the MCP project context.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

const buildContext = (
    userUuid: string,
    organizationUuid = 'org-uuid',
): McpToolContext => {
    const ability = {
        can: jest.fn(() => true),
        cannot: jest.fn(() => false),
    };

    return {
        user: {
            userUuid,
            organizationUuid,
            ability,
        } as AnyType,
        account: { user: { ability } } as AnyType,
        ability: ability as AnyType,
        organizationUuid,
        authType: 'pat',
        scopes: [],
    } as AnyType;
};

/**
 * Builds an McpService with the models of the four level fallback chain
 * mocked. `getProject` mirrors `ProjectService.getProject`: it throws when
 * the account cannot view the project.
 */
const buildService = ({
    contextProjectUuid,
    contextTags = null,
    organizationDefaultProjectUuid,
    serverDefaultProjectUuid = null,
    unviewableProjectUuids = [],
}: {
    contextProjectUuid?: string;
    contextTags?: string[] | null;
    organizationDefaultProjectUuid?: string;
    serverDefaultProjectUuid?: string | null;
    unviewableProjectUuids?: string[];
} = {}) => {
    const getContext = jest.fn().mockImplementation(
        async (userUuid: string, organizationUuid: string) => {
            if (userUuid !== 'user-1' || organizationUuid !== 'org-uuid') {
                return undefined;
            }
            return contextProjectUuid
                ? {
                      user_uuid: userUuid,
                      organization_uuid: organizationUuid,
                      context: {
                          projectUuid: contextProjectUuid,
                          projectName: 'Demo project',
                          tags: contextTags,
                      },
                  }
                : undefined;
        },
    );

    const setContext = jest.fn().mockResolvedValue(undefined);

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

    const mcpService = new McpService({
        lightdashConfig: {
            mcp: {
                enabled: true,
                oauthRequiredScopes: ['mcp:read'],
                defaultProjectUuid: serverDefaultProjectUuid,
            },
        } as AnyType as LightdashConfig,
        analytics: {} as AnyType,
        catalogService: {} as AnyType,
        projectModel: {} as AnyType,
        projectService: { getProject } as AnyType,
        userAttributesModel: {} as AnyType,
        searchModel: {} as AnyType,
        spaceModel: {} as AnyType,
        spaceService: {} as AnyType,
        mcpContextModel: { getContext, setContext } as AnyType,
        organizationModel: { get: organizationGet } as AnyType,
        featureFlagService: {} as AnyType,
        contentService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        searchService: {} as AnyType,
    });

    return {
        mcpService,
        getContext,
        setContext,
        organizationGet,
        getProject,
    };
};

type CapturedTool = {
    name: string;
    config: { description?: string; inputSchema?: AnyType };
    handler: (args: AnyType, context: McpToolContext) => Promise<AnyType>;
};

/**
 * Builds the service while capturing the tools registered by
 * `setupHandlers`, so their handlers can be invoked directly without going
 * through the MCP SDK transport. The real registration is replaced, so the
 * tools are never attached to the MCP server.
 */
const buildServiceWithTools = (
    options: Parameters<typeof buildService>[0],
) => {
    const captured: CapturedTool[] = [];
    const spy = jest
        .spyOn(McpToolRegistry.prototype, 'register')
        .mockImplementation(
            (
                name: string,
                config: CapturedTool['config'],
                handler: CapturedTool['handler'],
            ) => {
                captured.push({ name, config, handler });
            },
        );

    try {
        return { ...buildService(options), tools: captured };
    } finally {
        spy.mockRestore();
    }
};

const parseResult = (result: AnyType) => JSON.parse(result.content[0].text);

const requireTool = (tools: CapturedTool[], name: string): CapturedTool => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
        throw new Error(`Tool ${name} was not registered`);
    }
    return tool;
};

describe('McpService project context (four level fallback chain)', () => {
    describe('resolveProjectUuid', () => {
        it('resolves the explicit projectUuid without consulting any default', async () => {
            const { mcpService, getContext, organizationGet } = buildService({
                contextProjectUuid: 'user-project',
                organizationDefaultProjectUuid: 'org-project',
            });

            const projectUuid = await mcpService.resolveProjectUuid(
                buildContext('user-1'),
                { projectUuid: 'explicit-project' },
            );

            expect(projectUuid).toEqual('explicit-project');
            expect(getContext).not.toHaveBeenCalled();
            expect(organizationGet).not.toHaveBeenCalled();
        });

        it('throws without fallback when the explicit project is not viewable', async () => {
            const { mcpService, getContext, organizationGet } = buildService({
                organizationDefaultProjectUuid: 'org-project',
                unviewableProjectUuids: ['hidden-project'],
            });

            await expect(
                mcpService.resolveProjectUuid(buildContext('user-1'), {
                    projectUuid: 'hidden-project',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);

            expect(getContext).not.toHaveBeenCalled();
            expect(organizationGet).not.toHaveBeenCalled();
        });

        it('resolves the user default stored with set_project', async () => {
            const { mcpService, organizationGet } = buildService({
                contextProjectUuid: 'user-project',
                organizationDefaultProjectUuid: 'org-project',
            });

            const projectUuid = await mcpService.resolveProjectUuid(
                buildContext('user-1'),
            );

            expect(projectUuid).toEqual('user-project');
            expect(organizationGet).not.toHaveBeenCalled();
        });

        it('falls back to the organization default when the user default is stale', async () => {
            const { mcpService, getProject } = buildService({
                contextProjectUuid: 'stale-user-project',
                organizationDefaultProjectUuid: 'org-project',
                unviewableProjectUuids: ['stale-user-project'],
            });

            const projectUuid = await mcpService.resolveProjectUuid(
                buildContext('user-1'),
            );

            expect(projectUuid).toEqual('org-project');
            expect(getProject.mock.calls.map((call) => call[0])).toEqual([
                'stale-user-project',
                'org-project',
            ]);
        });

        it('falls back to the server default when the organization default is stale', async () => {
            const { mcpService } = buildService({
                organizationDefaultProjectUuid: 'stale-org-project',
                serverDefaultProjectUuid: 'server-project',
                unviewableProjectUuids: ['stale-org-project'],
            });

            const projectUuid = await mcpService.resolveProjectUuid(
                buildContext('user-1'),
            );

            expect(projectUuid).toEqual('server-project');
        });

        it('throws the shared error and hint when every level is missing', async () => {
            const { mcpService } = buildService();

            const error = await mcpService
                .resolveProjectUuid(buildContext('user-1'))
                .catch((e) => e);

            expect(error).toBeInstanceOf(ForbiddenError);
            expect(error.message).toEqual(
                `${NO_DEFAULT_PROJECT_ERROR} ${NO_DEFAULT_PROJECT_HINT}`,
            );
        });
    });

    describe('getProjectUuidFromContext', () => {
        it('reads the default of the current user and organization', async () => {
            const { mcpService, getContext } = buildService({
                contextProjectUuid: 'user-project',
            });

            await mcpService.getProjectUuidFromContext(buildContext('user-1'));

            expect(getContext).toHaveBeenCalledWith('user-1', 'org-uuid');
        });

        it('resolves the implicit chain and does not leak other users', async () => {
            const { mcpService } = buildService({
                contextProjectUuid: 'user-project',
                organizationDefaultProjectUuid: 'org-project',
            });

            const projectUuid = await mcpService.getProjectUuidFromContext(
                buildContext('user-1'),
            );
            const otherProjectUuid = await mcpService.getProjectUuidFromContext(
                buildContext('user-2'),
            );

            expect(projectUuid).toEqual('user-project');
            expect(otherProjectUuid).toEqual('org-project');
        });

        it('returns undefined when no level resolves', async () => {
            const { mcpService } = buildService();

            await expect(
                mcpService.getProjectUuidFromContext(buildContext('user-1')),
            ).resolves.toBeUndefined();
        });
    });

    describe('get_current_project tool', () => {

        it('returns the user default with its source and hasUserDefault', async () => {
            const { tools } = buildServiceWithTools({
                contextProjectUuid: 'user-project',
                contextTags: ['finance'],
                organizationDefaultProjectUuid: 'org-project',
            });

            const tool = requireTool(tools, 'get_current_project');
            const result = parseResult(
                await tool.handler({}, buildContext('user-1')),
            );

            expect(result).toEqual({
                projectUuid: 'user-project',
                projectName: 'Demo project',
                selectedTags: ['finance'],
                source: 'user_default',
                hasUserDefault: true,
            });
        });

        it('reports the fallback source when there is no user default', async () => {
            const { tools } = buildServiceWithTools({
                organizationDefaultProjectUuid: 'org-project',
            });

            const tool = requireTool(tools, 'get_current_project');
            const result = parseResult(
                await tool.handler({}, buildContext('user-1')),
            );

            expect(result).toEqual({
                projectUuid: 'org-project',
                projectName: 'Demo project',
                selectedTags: null,
                source: 'organization_default',
                hasUserDefault: false,
            });
        });

        it('reports the server default source when only the deployment default is set', async () => {
            const { tools } = buildServiceWithTools({
                serverDefaultProjectUuid: 'server-project',
            });

            const tool = requireTool(tools, 'get_current_project');
            const result = parseResult(
                await tool.handler({}, buildContext('user-1')),
            );

            expect(result).toEqual({
                projectUuid: 'server-project',
                projectName: 'Demo project',
                selectedTags: null,
                source: 'server_default',
                hasUserDefault: false,
            });
        });

        it('returns the shared error and hint when no default resolves', async () => {
            const { tools } = buildServiceWithTools({});

            const tool = requireTool(tools, 'get_current_project');
            const result = parseResult(
                await tool.handler({}, buildContext('user-1')),
            );

            expect(result).toEqual({
                error: NO_DEFAULT_PROJECT_ERROR,
                hint: NO_DEFAULT_PROJECT_HINT,
            });
        });
    });

    describe('set_project tool', () => {
        it('keeps returning projectUuid, projectName and selectedTags', async () => {
            const { tools, setContext, getContext } = buildServiceWithTools({
                contextProjectUuid: 'user-project',
            });

            const tool = requireTool(tools, 'set_project');
            const result = parseResult(
                await tool.handler(
                    { projectUuid: 'user-project', tags: ['finance'] },
                    buildContext('user-1'),
                ),
            );

            expect(result).toEqual({
                projectUuid: 'user-project',
                projectName: 'Demo project',
                selectedTags: ['finance'],
            });
            expect(setContext).toHaveBeenCalledWith({
                userUuid: 'user-1',
                organizationUuid: 'org-uuid',
                context: {
                    projectUuid: 'user-project',
                    projectName: 'Demo project',
                    tags: ['finance'],
                },
            });
            expect(getContext).not.toHaveBeenCalled();
        });
    });
});

import { AnyType, ForbiddenError } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { McpToolContext } from './tools/types';
import { McpService } from './McpService';

// The warehouses package pulls in native warehouse drivers, which are not
// needed to test the MCP project context.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

const buildContext = (
    userUuid: string,
    organizationUuid: string,
): McpToolContext =>
    ({
        user: {
            userUuid,
            organizationUuid,
        } as AnyType,
        account: {} as AnyType,
        ability: {} as AnyType,
        organizationUuid,
        authType: 'pat',
        scopes: [],
    } as AnyType);

describe('McpService project context', () => {
    let mcpService: McpService;
    let mcpContextModel: {
        getContext: jest.Mock;
        setContext: jest.Mock;
    };

    beforeEach(() => {
        mcpContextModel = {
            getContext: jest.fn().mockResolvedValue(undefined),
            setContext: jest.fn().mockResolvedValue(undefined),
        };

        const lightdashConfig = {
            mcp: {
                enabled: true,
                oauthRequiredScopes: ['mcp:read'],
            },
        } as AnyType as LightdashConfig;

        mcpService = new McpService({
            lightdashConfig,
            analytics: {} as AnyType,
            catalogService: {} as AnyType,
            projectModel: {} as AnyType,
            projectService: {} as AnyType,
            userAttributesModel: {} as AnyType,
            searchModel: {} as AnyType,
            spaceModel: {} as AnyType,
            spaceService: {} as AnyType,
            mcpContextModel: mcpContextModel as AnyType,
            featureFlagService: {} as AnyType,
            contentService: {} as AnyType,
            savedChartService: {} as AnyType,
            dashboardService: {} as AnyType,
            searchService: {} as AnyType,
        });
    });

    it('reads the context of the current user and organization', async () => {
        await mcpService.getProjectUuidFromContext(
            buildContext('user-1', 'org-1'),
        );

        expect(mcpContextModel.getContext).toHaveBeenCalledWith(
            'user-1',
            'org-1',
        );
    });

    it('does not leak the context of another user', async () => {
        mcpContextModel.getContext.mockImplementation(
            async (userUuid: string) =>
                userUuid === 'user-1'
                    ? {
                          context: {
                              projectUuid: 'project-1',
                              projectName: 'Project 1',
                              tags: null,
                          },
                      }
                    : undefined,
        );

        const projectUuid = await mcpService.getProjectUuidFromContext(
            buildContext('user-1', 'org-1'),
        );
        const otherProjectUuid = await mcpService.getProjectUuidFromContext(
            buildContext('user-2', 'org-1'),
        );

        expect(projectUuid).toEqual('project-1');
        expect(otherProjectUuid).toBeUndefined();
    });

    it('prefers the explicit project uuid over the stored context', async () => {
        mcpContextModel.getContext.mockResolvedValue({
            context: {
                projectUuid: 'stored-project',
                projectName: 'Stored project',
                tags: null,
            },
        });

        const projectUuid = await mcpService.resolveProjectUuid(
            buildContext('user-1', 'org-1'),
            { projectUuid: 'explicit-project' },
        );

        expect(projectUuid).toEqual('explicit-project');
        expect(mcpContextModel.getContext).not.toHaveBeenCalled();
    });

    it('throws when no project is set', async () => {
        await expect(
            mcpService.resolveProjectUuid(buildContext('user-1', 'org-1')),
        ).rejects.toThrow(ForbiddenError);
    });
});

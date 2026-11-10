import { AnyType, ForbiddenError } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { McpAuthContext, McpAuthType } from './McpAuthContext';
import { McpService } from './McpService';

// The warehouses package pulls in native warehouse drivers, which are not
// needed to test the MCP authentication layer.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

const buildContext = ({
    authType,
    scopes,
}: {
    authType: McpAuthType;
    scopes: string[];
}): AnyType => {
    const authContext: McpAuthContext = {
        user: {
            userUuid: 'user-uuid',
            organizationUuid: 'organization-uuid',
        } as AnyType,
        account: {
            authentication: {
                type: authType === McpAuthType.OAuth ? 'oauth' : 'pat',
            },
        } as AnyType,
        authType,
        scopes,
    };

    return {
        authInfo: {
            token: 'token',
            clientId: 'client-id',
            scopes,
            extra: authContext,
        },
    };
};

describe('McpService authentication', () => {
    let mcpService: McpService;

    beforeEach(() => {
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
            mcpContextModel: {} as AnyType,
            organizationModel: {} as AnyType,
            featureFlagService: {} as AnyType,
            contentService: {} as AnyType,
            savedChartService: {} as AnyType,
            dashboardService: {} as AnyType,
            searchService: {} as AnyType,
        });
    });

    it('allows OAuth tokens with the required scope', () => {
        const context = buildContext({
            authType: McpAuthType.OAuth,
            scopes: ['mcp:read'],
        });

        expect(mcpService.canAccessMcp(context)).toBe(true);
    });

    it('rejects OAuth tokens without any MCP scope', () => {
        const context = buildContext({
            authType: McpAuthType.OAuth,
            scopes: ['read'],
        });

        expect(() => mcpService.canAccessMcp(context)).toThrow(ForbiddenError);
        expect(() => mcpService.canAccessMcp(context)).toThrow(
            'Missing required OAuth scope(s): mcp:read',
        );
    });

    it('rejects OAuth tokens without scopes', () => {
        const context = buildContext({
            authType: McpAuthType.OAuth,
            scopes: [],
        });

        expect(() => mcpService.canAccessMcp(context)).toThrow(ForbiddenError);
    });

    it('allows personal access tokens regardless of scopes', () => {
        const context = buildContext({
            authType: McpAuthType.Pat,
            scopes: [],
        });

        expect(mcpService.canAccessMcp(context)).toBe(true);
    });

    it('rejects requests without auth info', () => {
        expect(() => mcpService.canAccessMcp({})).toThrow(ForbiddenError);
    });
});

import { AnyType, ForbiddenError } from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/extensions
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodRawShape } from 'zod';
import { LightdashConfig } from '../../../config/parseConfig';
import { McpAuthContext, McpAuthType } from '../McpAuthContext';
import { McpToolName } from '../McpToolName';
import { MCP_TOOL_SCOPES, McpToolScope } from './scopes';
import { McpToolContext } from './types';

type McpToolConfig = {
    description?: string;
    inputSchema?: ZodRawShape;
};

type McpToolHandler = (
    args: AnyType,
    context: McpToolContext,
) => Promise<CallToolResult>;

/**
 * Registers MCP tools on the MCP server.
 *
 * The registry is the only place where tools are attached to the server, which
 * guarantees that every tool goes through the same authentication and scope
 * checks.
 */
export class McpToolRegistry {
    constructor(
        private readonly server: McpServer,
        private readonly lightdashConfig: LightdashConfig,
    ) {}

    /**
     * Checks that the caller is allowed to use the MCP server at all.
     */
    public canAccessMcp(authContext: McpAuthContext | undefined): boolean {
        if (!authContext) {
            throw new ForbiddenError('Invalid authInfo context');
        }

        const { authType, scopes } = authContext;

        if (authType === McpAuthType.Pat) {
            // Personal access tokens are not scope limited
            return true;
        }

        const requiredScopes = this.lightdashConfig.mcp.oauthRequiredScopes;
        const missingScopes = requiredScopes.filter(
            (scope) => !scopes.includes(scope),
        );

        if (missingScopes.length > 0) {
            throw new ForbiddenError(
                `Missing required OAuth scope(s): ${missingScopes.join(', ')}`,
            );
        }

        return true;
    }

    /**
     * Checks that the caller has the scope required by a given tool.
     */
    public static assertToolAccess(
        context: McpToolContext,
        toolName: McpToolName,
    ): void {
        if (context.authType === McpAuthType.Pat) {
            // Personal access tokens are not scope limited
            return;
        }

        const requiredScope = MCP_TOOL_SCOPES[toolName] ?? McpToolScope.Read;
        if (!context.scopes.includes(requiredScope)) {
            throw new ForbiddenError(
                `Missing required OAuth scope "${requiredScope}" to call tool "${toolName}"`,
            );
        }
    }

    public register(
        name: McpToolName,
        config: McpToolConfig,
        handler: McpToolHandler,
    ): void {
        // The MCP SDK infers deep types from the zod input schema, which can
        // trigger TS2589. We use a narrow signature to avoid that.
        const registerTool = this.server.registerTool.bind(
            this.server,
        ) as unknown as (
            name: string,
            config: McpToolConfig,
            cb: (args: AnyType, context: AnyType) => Promise<CallToolResult>,
        ) => void;

        registerTool(
            name,
            config,
            async (args: AnyType, sdkContext: AnyType) => {
                const context = McpToolRegistry.buildToolContext(sdkContext);
                McpToolRegistry.assertToolAccess(context, name);
                return handler(args, context);
            },
        );
    }

    /**
     * Converts the raw MCP SDK context into the normalised tool context.
     */
    public static buildToolContext(sdkContext: AnyType): McpToolContext {
        const authContext = sdkContext?.authInfo?.extra as
            | McpAuthContext
            | undefined;

        if (!authContext) {
            throw new ForbiddenError('Invalid authInfo context');
        }

        const { user, account, authType, scopes } = authContext;

        if (!user.organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }

        return {
            user,
            account,
            ability: user.ability,
            organizationUuid: user.organizationUuid,
            authType,
            scopes,
        };
    }
}

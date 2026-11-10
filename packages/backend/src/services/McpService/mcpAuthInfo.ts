// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
    Account,
    ApiKeyAccount,
    AuthorizationError,
    OauthAccount,
    SessionUser,
} from '@lightdash/common';
import {
    McpAuthContext,
    McpAuthType,
    PAT_SCOPES,
} from './McpAuthContext';

/**
 * Builds the MCP authentication context from the authenticated request.
 *
 * MCP only supports token based authentication:
 * - Lightdash OAuth access token (scope limited)
 * - Personal access token (not scope limited)
 */
export function buildMcpAuthInfo(
    user: SessionUser | undefined,
    account: Account | undefined,
): AuthInfo {
    if (!user || !account) {
        throw new AuthorizationError('Unauthenticated');
    }

    if (account.isOauthUser()) {
        const oauthAccount = account as OauthAccount;
        const scopes = oauthAccount.authentication.scopes ?? [];
        const authContext: McpAuthContext = {
            user,
            account: oauthAccount,
            authType: McpAuthType.OAuth,
            scopes,
        };

        return {
            token: oauthAccount.authentication.token,
            clientId: oauthAccount.authentication.clientId,
            scopes,
            extra: authContext,
        };
    }

    if (account.isPatUser()) {
        const apiKeyAccount = account as ApiKeyAccount;
        const authContext: McpAuthContext = {
            user,
            account: apiKeyAccount,
            authType: McpAuthType.Pat,
            scopes: PAT_SCOPES,
        };

        return {
            token: apiKeyAccount.authentication.source,
            clientId: 'API key',
            scopes: PAT_SCOPES,
            extra: authContext,
        };
    }

    throw new AuthorizationError(
        'MCP requires an OAuth access token or a personal access token',
    );
}

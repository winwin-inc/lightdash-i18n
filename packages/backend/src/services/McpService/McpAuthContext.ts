import { ApiKeyAccount, OauthAccount, SessionUser } from '@lightdash/common';
import { MCP_SUPPORTED_SCOPES, OAuthScope } from '../OAuthService/OAuthService';

export { MCP_SUPPORTED_SCOPES };

export enum McpAuthType {
    OAuth = 'oauth',
    Pat = 'pat',
}

/**
 * Unified authentication context for MCP.
 *
 * Both Lightdash OAuth access tokens and personal access tokens (PAT) are
 * normalized into this shape so tools never need to know how the caller
 * authenticated.
 */
export type McpAuthContext = {
    user: SessionUser;
    account: OauthAccount | ApiKeyAccount;
    authType: McpAuthType;
    /** OAuth scopes granted to the token. PATs get the full set. */
    scopes: string[];
};

/**
 * Scopes granted to personal access tokens.
 * PATs are not scope limited, they are issued per user and already carry the
 * user's full permissions.
 */
export const PAT_SCOPES: string[] = [OAuthScope.MCP_READ, OAuthScope.MCP_WRITE];

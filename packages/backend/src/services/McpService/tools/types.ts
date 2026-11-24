import { Account, MemberAbility, SessionUser } from '@lightdash/common';
import { McpAuthType } from '../McpAuthContext';

/**
 * Normalised context passed to every MCP tool handler.
 *
 * The MCP SDK context is converted once (in the tool registry) so that tools
 * never have to deal with `authInfo.extra` casting.
 */
export type McpToolContext = {
    user: SessionUser;
    account: Account;
    ability: MemberAbility;
    organizationUuid: string;
    authType: McpAuthType;
    scopes: string[];
    /**
     * Raw headers of the underlying MCP request (best effort; transports that
     * do not populate `requestInfo` leave it undefined). Used for analytics
     * attributes such as `X-Lightdash-Client`.
     */
    requestHeaders?: Record<string, string | string[] | undefined>;
};

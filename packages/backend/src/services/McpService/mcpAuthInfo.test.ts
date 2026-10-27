import { AnyType, AuthorizationError } from '@lightdash/common';
import { McpAuthType } from './McpAuthContext';
import { buildMcpAuthInfo } from './mcpAuthInfo';

const user = {
    userUuid: 'user-uuid',
    organizationUuid: 'organization-uuid',
} as AnyType;

describe('buildMcpAuthInfo', () => {
    it('throws when the request is not authenticated', () => {
        expect(() => buildMcpAuthInfo(undefined, undefined)).toThrow(
            AuthorizationError,
        );
    });

    it('keeps the OAuth scopes on the auth info', () => {
        const authInfo = buildMcpAuthInfo(user, {
            isOauthUser: () => true,
            isPatUser: () => false,
            authentication: {
                token: 'oauth-token',
                clientId: 'client-id',
                scopes: ['mcp:read'],
            },
        } as AnyType);

        expect(authInfo.token).toEqual('oauth-token');
        expect(authInfo.clientId).toEqual('client-id');
        expect(authInfo.scopes).toEqual(['mcp:read']);
        expect((authInfo.extra as AnyType).authType).toEqual(
            McpAuthType.OAuth,
        );
        expect((authInfo.extra as AnyType).scopes).toEqual(['mcp:read']);
    });

    it('defaults the OAuth scopes to an empty list', () => {
        const authInfo = buildMcpAuthInfo(user, {
            isOauthUser: () => true,
            isPatUser: () => false,
            authentication: {
                token: 'oauth-token',
                clientId: 'client-id',
            },
        } as AnyType);

        expect(authInfo.scopes).toEqual([]);
    });

    it('gives personal access tokens the full set of scopes', () => {
        const authInfo = buildMcpAuthInfo(user, {
            isOauthUser: () => false,
            isPatUser: () => true,
            authentication: {
                source: 'ldpat_123',
            },
        } as AnyType);

        expect(authInfo.token).toEqual('ldpat_123');
        expect(authInfo.scopes).toEqual(['mcp:read', 'mcp:write']);
        expect((authInfo.extra as AnyType).authType).toEqual(McpAuthType.Pat);
    });

    it('rejects accounts that are neither OAuth nor PAT', () => {
        expect(() =>
            buildMcpAuthInfo(user, {
                isOauthUser: () => false,
                isPatUser: () => false,
            } as AnyType),
        ).toThrow(AuthorizationError);
    });
});

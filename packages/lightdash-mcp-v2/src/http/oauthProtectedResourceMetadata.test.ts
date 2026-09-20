import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOAuthProtectedResourceMetadata } from './oauthProtectedResourceMetadata';

describe('buildOAuthProtectedResourceMetadata', () => {
    it('builds the WorkBuddy-compatible root metadata body', () => {
        assert.deepEqual(
            buildOAuthProtectedResourceMetadata({
                resourceServerUrl: new URL(
                    'https://mcp-x.pre.banmahui.cn/mcp',
                ),
                authorizationServerUrl:
                    'https://keycloak.dev.banmahui.cn/realms/mcp/',
                scopesSupported: ['openid', 'mcp:read'],
            }),
            {
                resource: 'https://mcp-x.pre.banmahui.cn/mcp',
                authorization_servers: [
                    'https://keycloak.dev.banmahui.cn/realms/mcp',
                ],
                scopes_supported: ['openid', 'mcp:read'],
            },
        );
    });
});

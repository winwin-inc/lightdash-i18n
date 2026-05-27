import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import {
    createOauthCache,
    parseApiKeyFromRequest,
    parseBearerTokenFromRequest,
    validateOauthToken,
} from './authAndCache';

describe('authAndCache oauth helpers', () => {
    it('parseApiKeyFromRequest supports x-api-key and Authorization ApiKey', () => {
        const byHeader = {
            headers: { 'x-api-key': 'pat-1' },
        } as unknown as Request;
        assert.equal(parseApiKeyFromRequest(byHeader), 'pat-1');

        const byAuthorization = {
            headers: { authorization: 'ApiKey pat-2' },
        } as unknown as Request;
        assert.equal(parseApiKeyFromRequest(byAuthorization), 'pat-2');
    });

    it('parseBearerTokenFromRequest reads Authorization Bearer', () => {
        const req = {
            headers: { authorization: 'Bearer oauth-token' },
        } as unknown as Request;
        assert.equal(parseBearerTokenFromRequest(req), 'oauth-token');
    });

    it('validateOauthToken checks active and required scopes', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            ({
                ok: true,
                json: async () => ({
                    active: true,
                    scope: 'mcp:read mcp:write',
                    sub: 'user-1',
                }),
            }) as Response) as typeof fetch;
        try {
            const result = await validateOauthToken(createOauthCache(), {
                introspectUrl: 'https://example.com/api/v1/oauth/introspect',
                introspectApiKey: 'pat-service',
                token: 'oauth-token-1',
                requiredScopes: ['mcp:read'],
            });
            assert.equal(result.subject, 'user-1');
            assert.deepEqual(result.scopes, ['mcp:read', 'mcp:write']);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

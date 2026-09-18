import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { Request } from 'express';
import {
    maskApiKey,
    parseBearerTokenFromRequest,
    parseUserAttributesHeader,
} from './authAndCache';
import {
    createLocalJWKSet,
    verifyKeycloakAccessToken,
} from './keycloakJwt';
import {
    createPatCache,
    getOrExchangePat,
    invalidatePatCache,
    isPatCacheValid,
    PAT_CACHE_SKEW_MS,
} from './tokenExchange';

describe('authAndCache helpers', () => {
    it('parseBearerTokenFromRequest reads Authorization Bearer', () => {
        const req = {
            headers: { authorization: 'Bearer oauth-token' },
        } as unknown as Request;
        assert.equal(parseBearerTokenFromRequest(req), 'oauth-token');
    });

    it('maskApiKey masks middle characters', () => {
        assert.equal(maskApiKey('ldpat_abcdefgh'), 'ldpa***efgh');
    });

    it('parseUserAttributesHeader accepts valid JSON under size cap', () => {
        const req = {
            headers: {
                'x-lightdash-user-attributes': '{"region":"cn"}',
            },
        } as unknown as Request;
        assert.equal(
            parseUserAttributesHeader(req),
            '{"region":"cn"}',
        );
    });
});

async function signTestToken(options: {
    issuer: string;
    audience: string;
    kid: string;
    claims: Record<string, unknown>;
    exp: number | string;
}): Promise<{ token: string; jwks: ReturnType<typeof createLocalJWKSet> }> {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.alg = 'RS256';
    jwk.kid = options.kid;
    jwk.use = 'sig';
    const token = await new SignJWT(options.claims)
        .setProtectedHeader({ alg: 'RS256', kid: options.kid })
        .setIssuer(options.issuer)
        .setAudience(options.audience)
        .setSubject(
            typeof options.claims.sub === 'string'
                ? options.claims.sub
                : 'kc-sub',
        )
        .setExpirationTime(options.exp)
        .sign(privateKey);
    return { token, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

describe('Keycloak JWT verification', () => {
    it('accepts valid token with email and required scopes', async () => {
        const issuer = 'https://keycloak.example/realms/mcp';
        const audience = 'http://localhost:3333/mcp';
        const { token, jwks } = await signTestToken({
            issuer,
            audience,
            kid: 'test-kid',
            claims: {
                email: 'demo@example.com',
                scope: 'openid mcp:read',
                sub: 'kc-sub-1',
            },
            exp: '2h',
        });

        const claims = await verifyKeycloakAccessToken(token, {
            keycloakRealmUrl: issuer,
            audience,
            requiredScopes: ['openid', 'mcp:read'],
            jwks,
        });
        assert.equal(claims.email, 'demo@example.com');
        assert.equal(claims.subject, 'kc-sub-1');
        assert.deepEqual(claims.scopes, ['openid', 'mcp:read']);
    });

    it('rejects token without email claim', async () => {
        const issuer = 'https://keycloak.example/realms/mcp-no-email';
        const audience = 'http://localhost:3333/mcp';
        const { token, jwks } = await signTestToken({
            issuer,
            audience,
            kid: 'no-email-kid',
            claims: {
                scope: 'openid mcp:read',
                sub: 'kc-sub-2',
            },
            exp: '2h',
        });

        await assert.rejects(
            () =>
                verifyKeycloakAccessToken(token, {
                    keycloakRealmUrl: issuer,
                    audience,
                    requiredScopes: ['openid', 'mcp:read'],
                    jwks,
                }),
            /missing email/,
        );
    });

    it('rejects expired JWT', async () => {
        const issuer = 'https://keycloak.example/realms/mcp-expired';
        const audience = 'http://localhost:3333/mcp';
        const { token, jwks } = await signTestToken({
            issuer,
            audience,
            kid: 'expired-kid',
            claims: {
                email: 'demo@example.com',
                scope: 'openid mcp:read',
                sub: 'kc-sub-3',
            },
            exp: Math.floor(Date.now() / 1000) - 60,
        });

        await assert.rejects(
            () =>
                verifyKeycloakAccessToken(token, {
                    keycloakRealmUrl: issuer,
                    audience,
                    requiredScopes: ['openid', 'mcp:read'],
                    jwks,
                }),
            /JWT verification failed/,
        );
    });
});

describe('PAT token exchange cache', () => {
    it('re-exchanges when cache expired (respects backend expiresAt + skew)', async () => {
        const cache = createPatCache();
        let exchangeCount = 0;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (_input, init) => {
            exchangeCount += 1;
            const body = JSON.parse(String(init?.body ?? '{}')) as {
                email?: string;
            };
            const expiresAt = new Date(
                Date.now() +
                    (exchangeCount === 1 ? PAT_CACHE_SKEW_MS / 2 : 3_600_000),
            ).toISOString();
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    status: 'ok',
                    results: {
                        accessToken: `ldpat_${exchangeCount}`,
                        tokenType: 'ApiKey',
                        expiresAt,
                        userUuid: 'u1',
                        email: body.email,
                    },
                }),
            } as Response;
        }) as typeof fetch;

        try {
            const first = await getOrExchangePat({
                cache,
                baseUrl: 'https://ld.example',
                tokenExchangeSecret: 'secret',
                email: 'a@example.com',
            });
            assert.equal(first.accessToken, 'ldpat_1');
            assert.equal(exchangeCount, 1);

            assert.equal(isPatCacheValid(first), false);

            const second = await getOrExchangePat({
                cache,
                baseUrl: 'https://ld.example',
                tokenExchangeSecret: 'secret',
                email: 'a@example.com',
            });
            assert.equal(second.accessToken, 'ldpat_2');
            assert.equal(exchangeCount, 2);
            assert.equal(isPatCacheValid(second), true);

            const third = await getOrExchangePat({
                cache,
                baseUrl: 'https://ld.example',
                tokenExchangeSecret: 'secret',
                email: 'a@example.com',
            });
            assert.equal(third.accessToken, 'ldpat_2');
            assert.equal(exchangeCount, 2);

            invalidatePatCache(cache, 'a@example.com');
            const fourth = await getOrExchangePat({
                cache,
                baseUrl: 'https://ld.example',
                tokenExchangeSecret: 'secret',
                email: 'a@example.com',
            });
            assert.equal(fourth.accessToken, 'ldpat_3');
            assert.equal(exchangeCount, 3);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('surfaces user-not-found from token-exchange', async () => {
        const cache = createPatCache();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            ({
                ok: false,
                status: 404,
                text: async () => 'not found',
            }) as Response) as typeof fetch;
        try {
            await assert.rejects(
                () =>
                    getOrExchangePat({
                        cache,
                        baseUrl: 'https://ld.example',
                        tokenExchangeSecret: 'secret',
                        email: 'missing@example.com',
                    }),
                /user not found/,
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

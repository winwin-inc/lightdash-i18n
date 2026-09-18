import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import { httpRequestApiKeyStore } from '../lib/requestContext';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from './coreToolsContext';

function baseConfig(
    defaultProjectUuid: string | null,
): LightdashMcpEnvConfig {
    return {
        baseUrl: 'https://example.com',
        defaultProjectUuid,
        maxLimit: 5000,
        keycloakRealmUrl: 'https://keycloak.example/realms/mcp',
        mcpPublicUrl: 'http://localhost:3333',
        oauthAudience: 'http://localhost:3333/mcp',
        oauthRequiredScopes: ['openid', 'mcp:read'],
        tokenExchangeSecret: 'test-secret',
    };
}

test('resolveCoreToolsProjectUuid throws when no arg or env', () => {
    const key = `pat-empty-${Math.random()}`;
    assert.throws(
        () =>
            resolveCoreToolsProjectUuid(
                baseConfig(null),
                key,
                undefined,
            ),
        /缺少 projectUuid/,
    );
});

test('resolveCoreToolsProjectUuid prefers tool argument', () => {
    const key = `pat-arg-${Math.random()}`;
    const u = resolveCoreToolsProjectUuid(
        baseConfig('from-env'),
        key,
        'from-arg',
    );
    assert.equal(u, 'from-arg');
});

test('resolveCoreToolsProjectUuid uses env when no arg', () => {
    const key = `pat-env-${Math.random()}`;
    const u = resolveCoreToolsProjectUuid(
        baseConfig('uuid-env-only'),
        key,
        undefined,
    );
    assert.equal(u, 'uuid-env-only');
});

test('resolveCoreToolsApiKey uses exchanged PAT from request context', async () => {
    await httpRequestApiKeyStore.run(
        {
            apiKey: 'ldpat_from_exchange',
            authType: 'keycloak',
            oauthAccessToken: 'keycloak-jwt',
            userEmail: 'demo@example.com',
        },
        async () => {
            const token = resolveCoreToolsApiKey(baseConfig(null));
            assert.equal(token, 'ldpat_from_exchange');
        },
    );
});

test('resolveCoreToolsApiKey throws when no PAT in context', () => {
    assert.throws(
        () => resolveCoreToolsApiKey(baseConfig(null)),
        /apiKey is required/,
    );
});

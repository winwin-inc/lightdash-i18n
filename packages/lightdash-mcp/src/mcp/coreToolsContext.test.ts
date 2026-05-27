import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import { patchMcpSession } from '../lib/mcpSessionStore';
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
        apiKey: undefined,
        defaultProjectUuid,
        maxLimit: 5000,
        oauthEnabled: false,
        oauthIntrospectUrl: 'https://example.com/api/v1/oauth/introspect',
        oauthRequiredScopes: ['mcp:read'],
        oauthResourceMetadataUrl:
            'https://example.com/api/v1/oauth/.well-known/oauth-protected-resource',
    };
}

test('resolveCoreToolsProjectUuid throws when no arg, session, or env', () => {
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
    patchMcpSession(key, { projectUuid: 'from-session' });
    const u = resolveCoreToolsProjectUuid(
        baseConfig('from-env'),
        key,
        'from-arg',
    );
    assert.equal(u, 'from-arg');
});

test('resolveCoreToolsProjectUuid uses session when no arg and env null', () => {
    const key = `pat-session-${Math.random()}`;
    patchMcpSession(key, { projectUuid: 'uuid-session-only' });
    const u = resolveCoreToolsProjectUuid(baseConfig(null), key, undefined);
    assert.equal(u, 'uuid-session-only');
});

test('resolveCoreToolsProjectUuid uses env when no arg and no session', () => {
    const key = `pat-env-${Math.random()}`;
    const u = resolveCoreToolsProjectUuid(
        baseConfig('uuid-env-only'),
        key,
        undefined,
    );
    assert.equal(u, 'uuid-env-only');
});

test('resolveCoreToolsApiKey can fallback to oauth token in request context', async () => {
    await httpRequestApiKeyStore.run(
        {
            apiKey: undefined,
            authType: 'oauth',
            oauthAccessToken: 'oauth-token-1',
        },
        async () => {
            const token = resolveCoreToolsApiKey(baseConfig(null));
            assert.equal(token, 'oauth-token-1');
        },
    );
});

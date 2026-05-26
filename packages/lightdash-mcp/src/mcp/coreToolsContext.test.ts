import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import { patchMcpSession } from '../lib/mcpSessionStore';
import { resolveCoreToolsProjectUuid } from './coreToolsContext';

function baseConfig(
    defaultProjectUuid: string | null,
): LightdashMcpEnvConfig {
    return {
        baseUrl: 'https://example.com',
        apiKey: undefined,
        defaultProjectUuid,
        maxLimit: 5000,
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

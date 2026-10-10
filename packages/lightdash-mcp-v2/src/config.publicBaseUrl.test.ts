import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadConfigFromEnv } from './config';

describe('LIGHTDASH_PUBLIC_SITE_URL (mcp-v2)', () => {
    const keys = [
        'LIGHTDASH_SITE_URL',
        'LIGHTDASH_PUBLIC_SITE_URL',
        'KEYCLOAK_REALM_URL',
        'MCP_PUBLIC_URL',
        'LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET',
    ] as const;
    const prev: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of keys) prev[k] = process.env[k];
        process.env.KEYCLOAK_REALM_URL = 'https://keycloak.example/realms/mcp';
        process.env.MCP_PUBLIC_URL = 'https://mcp.example';
        process.env.LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET = 'test-secret';
    });

    afterEach(() => {
        for (const k of keys) {
            const v = prev[k];
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    it('falls back to LIGHTDASH_SITE_URL when PUBLIC unset', () => {
        process.env.LIGHTDASH_SITE_URL = 'https://api.internal.example/';
        delete process.env.LIGHTDASH_PUBLIC_SITE_URL;
        const cfg = loadConfigFromEnv();
        assert.equal(cfg.baseUrl, 'https://api.internal.example');
        assert.equal(cfg.publicBaseUrl, 'https://api.internal.example');
    });

    it('uses LIGHTDASH_PUBLIC_SITE_URL for publicBaseUrl when set', () => {
        process.env.LIGHTDASH_SITE_URL = 'http://lightdash.prod:8080';
        process.env.LIGHTDASH_PUBLIC_SITE_URL = 'https://x.brandct.com/';
        const cfg = loadConfigFromEnv();
        assert.equal(cfg.baseUrl, 'http://lightdash.prod:8080');
        assert.equal(cfg.publicBaseUrl, 'https://x.brandct.com');
    });
});

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
    REQUIRED_ENV_KEYS,
    buildDegradedServiceBody,
    describeRequiredEnvPresence,
    listMissingRequiredEnv,
    missingEnvHint,
} from './config';

const REQUIRED = [...REQUIRED_ENV_KEYS];

describe('listMissingRequiredEnv', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of REQUIRED) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of REQUIRED) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    });

    it('lists all required keys when none are set', () => {
        assert.deepEqual(listMissingRequiredEnv(), REQUIRED);
    });

    it('ignores whitespace-only values', () => {
        process.env.LIGHTDASH_SITE_URL = '  ';
        process.env.KEYCLOAK_REALM_URL = 'https://kc.example/realms/mcp';
        process.env.MCP_PUBLIC_URL = 'http://localhost:3333';
        process.env.LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET = 'secret';
        assert.deepEqual(listMissingRequiredEnv(), ['LIGHTDASH_SITE_URL']);
    });

    it('returns empty when all required keys are present', () => {
        process.env.LIGHTDASH_SITE_URL = 'https://ld.example';
        process.env.KEYCLOAK_REALM_URL = 'https://kc.example/realms/mcp';
        process.env.MCP_PUBLIC_URL = 'http://localhost:3333';
        process.env.LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET = 'secret';
        assert.deepEqual(listMissingRequiredEnv(), []);
    });

    it('describeRequiredEnvPresence marks SET vs MISSING without secret values', () => {
        process.env.LIGHTDASH_SITE_URL = 'https://ld.example';
        process.env.KEYCLOAK_REALM_URL = 'https://kc.example/realms/mcp';
        // MCP_PUBLIC_URL and secret missing
        const { missing, lines } = describeRequiredEnvPresence();
        assert.deepEqual(missing, [
            'MCP_PUBLIC_URL',
            'LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET',
        ]);
        assert.ok(lines.includes('LIGHTDASH_SITE_URL=SET'));
        assert.ok(lines.includes('KEYCLOAK_REALM_URL=SET'));
        assert.ok(lines.includes('MCP_PUBLIC_URL=MISSING'));
        assert.ok(
            lines.includes('LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET=MISSING'),
        );
        assert.ok(!lines.some((l) => l.includes('https://ld.example')));
        assert.ok(!lines.some((l) => l.includes('secret')));
    });
});

describe('buildDegradedServiceBody', () => {
    it('shapes 503 health/mcp body with missingEnv and K8s-oriented hint', () => {
        const missing = ['KEYCLOAK_REALM_URL', 'MCP_PUBLIC_URL'];
        const body = buildDegradedServiceBody(missing);
        assert.equal(body.ok, false);
        assert.equal(body.ready, false);
        assert.equal(body.package, '@lightdash/mcp-v2');
        assert.deepEqual(body.missingEnv, missing);
        assert.equal(body.hint, missingEnvHint(missing));
        assert.match(body.hint, /lightdash-mcp-config/);
        assert.match(body.hint, /lightdash-mcp-secret/);
        assert.match(body.hint, /KEYCLOAK_REALM_URL/);
    });
});

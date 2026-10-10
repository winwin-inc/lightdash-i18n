import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { loadConfigFromEnv } from './config';

describe('LIGHTDASH_PUBLIC_SITE_URL', () => {
    const prevSite = process.env.LIGHTDASH_SITE_URL;
    const prevPublic = process.env.LIGHTDASH_PUBLIC_SITE_URL;

    afterEach(() => {
        if (prevSite === undefined) delete process.env.LIGHTDASH_SITE_URL;
        else process.env.LIGHTDASH_SITE_URL = prevSite;
        if (prevPublic === undefined) delete process.env.LIGHTDASH_PUBLIC_SITE_URL;
        else process.env.LIGHTDASH_PUBLIC_SITE_URL = prevPublic;
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

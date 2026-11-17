import assert from 'node:assert/strict';
import test from 'node:test';
import type { OAuthCredentials, SiteProfile } from '../types';
import { authHeadersFor, clearCredentials, savePat } from './pat';
import { defaultConfig } from '../config/store';

const site = (authHeader: 'authorization' | 'x-api-key'): SiteProfile => ({
    name: 'x',
    mcpUrl: 'https://x.brandct.com/api/v1/mcp',
    authMode: 'oauth',
    authHeader,
});

test('authHeadersFor：oauth → Authorization: Bearer', () => {
    const headers = authHeadersFor({
        site: site('x-api-key'), // oauth 不看 authHeader，固定 Bearer
        credentials: {
            mode: 'oauth',
            clientId: 'cid',
            clientSecret: 'sec',
            redirectUri: 'http://127.0.0.1:1/callback',
            accessToken: 'at-123',
            accessExpiresAt: new Date().toISOString(),
            refreshToken: 'rt',
            scope: 'mcp:read',
        },
    });
    assert.deepEqual(headers, { Authorization: 'Bearer at-123' });
});

test('authHeadersFor：pat + authorization → Authorization: ApiKey', () => {
    const headers = authHeadersFor({
        site: site('authorization'),
        credentials: { mode: 'pat', pat: 'ldpat_a'.padEnd(45, 'x') },
    });
    assert.deepEqual(headers, {
        Authorization: `ApiKey ${'ldpat_a'.padEnd(45, 'x')}`,
    });
});

test('authHeadersFor：pat + x-api-key → x-api-key 头（v1 逃生口）', () => {
    const pat = 'ldpat_b'.padEnd(45, 'y');
    const headers = authHeadersFor({
        site: site('x-api-key'),
        credentials: { mode: 'pat', pat },
    });
    assert.deepEqual(headers, { 'x-api-key': pat });
});

test('authHeadersFor：无凭证返回空对象（让服务端回 401）', () => {
    assert.deepEqual(
        authHeadersFor({ site: site('authorization'), credentials: null }),
        {},
    );
});

test('savePat：纯替换目标站点凭证，不动其它站点与入参', () => {
    const config = defaultConfig();
    const oauthCreds: OAuthCredentials = {
        mode: 'oauth',
        clientId: 'cid',
        clientSecret: null,
        redirectUri: 'http://127.0.0.1:2/callback',
        accessToken: 'old',
        accessExpiresAt: new Date().toISOString(),
        refreshToken: null,
        scope: 'mcp:read',
    };
    const withBoth = {
        ...config,
        auth: { inner: { mode: 'pat' as const, pat: 'keep-me' }, x: oauthCreds },
    };
    const next = savePat({ siteName: 'x', pat: 'ldpat_c'.padEnd(45, 'z'), config: withBoth });

    assert.equal(next.auth.x?.mode, 'pat');
    assert.equal(next.auth.inner?.mode, 'pat');
    // 入参未被修改
    assert.equal(withBoth.auth.x?.mode, 'oauth');
    assert.equal(config.auth.x, undefined);
});

test('clearCredentials：删除指定站点且幂等', () => {
    const config = savePat({
        siteName: 'inner',
        pat: 'p',
        config: defaultConfig(),
    });
    const once = clearCredentials(config, 'inner');
    assert.equal(once.auth.inner, undefined);
    const twice = clearCredentials(once, 'inner');
    assert.equal(twice.auth.inner, undefined);
    // 未动其它键
    assert.deepEqual(twice.auth, once.auth);
});

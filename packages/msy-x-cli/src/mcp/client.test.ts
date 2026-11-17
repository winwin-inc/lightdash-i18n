import assert from 'node:assert/strict';
import test from 'node:test';
import type {
    AuthCredentials,
    AuthHeader,
    OAuthCredentials,
    PatCredentials,
    SiteProfile,
} from '../types';
import { buildAuthHeaders, createMcpClient } from './client';

const site = (authHeader: AuthHeader): SiteProfile => ({
    name: 'x',
    mcpUrl: 'https://x.example.com/api/v1/mcp',
    authMode: 'oauth',
    authHeader,
});

const oauth: OAuthCredentials = {
    mode: 'oauth',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:18936/callback',
    accessToken: 'access-token-abc',
    accessExpiresAt: '2026-01-01T00:00:00.000Z',
    refreshToken: 'refresh-token',
    scope: 'mcp:read',
};

const pat = (value: string): PatCredentials => ({
    mode: 'pat',
    pat: value,
});

test('oauth → Authorization: Bearer <accessToken>（与 authHeader 无关）', () => {
    for (const authHeader of ['authorization', 'x-api-key'] as AuthHeader[]) {
        const headers = buildAuthHeaders({
            authHeader,
            credentials: oauth as AuthCredentials,
        });
        assert.deepEqual(headers, {
            Authorization: 'Bearer access-token-abc',
        });
    }
});

test('pat + authorization → Authorization: ApiKey <pat>', () => {
    const headers = buildAuthHeaders({
        authHeader: 'authorization',
        credentials: pat('ldpat_abc'),
    });
    assert.deepEqual(headers, { Authorization: 'ApiKey ldpat_abc' });
});

test('pat + x-api-key → x-api-key: <pat>（v1 逃生口）', () => {
    const headers = buildAuthHeaders({
        authHeader: 'x-api-key',
        credentials: pat('ldpat_def'),
    });
    assert.deepEqual(headers, { 'x-api-key': 'ldpat_def' });
});

test('credentials 为 null → 不带任何鉴权头', () => {
    const headers = buildAuthHeaders({
        authHeader: 'authorization',
        credentials: null,
    });
    assert.deepEqual(headers, {});
});

test('createMcpClient 是异步工厂（不发真实请求，仅冒烟断言导出形状）', () => {
    assert.equal(typeof createMcpClient, 'function');
    assert.equal(typeof buildAuthHeaders, 'function');
});

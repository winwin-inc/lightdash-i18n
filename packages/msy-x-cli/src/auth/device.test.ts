import assert from 'node:assert/strict';
import test from 'node:test';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CliError } from '../cli/errors';
import type { SiteProfile } from '../types';
import { loginWithDeviceQr } from './device';

const site: SiteProfile = {
    name: 'x',
    mcpUrl: 'https://x.brandct.com/api/v1/mcp',
    authMode: 'oauth',
    authHeader: 'authorization',
};

const jsonResponse = (
    status: number,
    body: Record<string, unknown>,
): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

test('设备码登录：pending → token，凭证与浏览器 OAuth 同构', async () => {
    const calls: string[] = [];
    let polls = 0;
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/device')) {
            return jsonResponse(200, {
                device_code: 'dc-1',
                user_code: 'ABCD-2345',
                verification_uri: 'https://x.brandct.com/api/v1/oauth/device/activate',
                verification_uri_complete:
                    'https://x.brandct.com/api/v1/oauth/device/activate?user_code=ABCD-2345',
                expires_in: 600,
                interval: 5,
            });
        }
        // /device/token：第一次 pending，第二次发 token
        polls += 1;
        if (polls === 1) {
            return jsonResponse(400, { error: 'authorization_pending' });
        }
        return jsonResponse(200, {
            access_token: 'at-device',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'rt-device',
            scope: 'mcp:read',
        });
    };

    const printed: string[] = [];
    const credentials = await loginWithDeviceQr({
        site,
        fetchFn,
        print: (line) => printed.push(line),
        pollIntervalMs: 1,
    });

    assert.equal(credentials.mode, 'oauth');
    assert.equal(credentials.clientId, 'msy-x-cli');
    assert.equal(credentials.clientSecret, null);
    assert.equal(credentials.accessToken, 'at-device');
    assert.equal(credentials.refreshToken, 'rt-device');
    assert.equal(credentials.scope, 'mcp:read');
    // 二维码提示必须包含明文 user_code 与备用链接
    assert.ok(printed.join('\n').includes('ABCD-2345'));
    assert.ok(
        printed
            .join('\n')
            .includes(
                'https://x.brandct.com/api/v1/oauth/device/activate?user_code=ABCD-2345',
            ),
    );
    // 一次申请 + 两次轮询
    assert.deepEqual(
        calls.filter((u) => u.endsWith('/device')).length,
        1,
    );
    assert.equal(polls, 2);
});

test('设备码登录：用户拒绝 → AUTH_REQUIRED', async () => {
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(200, {
                device_code: 'dc-2',
                user_code: 'WXYZ-2345',
                verification_uri: 'https://x.brandct.com/api/v1/oauth/device/activate',
                verification_uri_complete:
                    'https://x.brandct.com/api/v1/oauth/device/activate?user_code=WXYZ-2345',
                expires_in: 600,
                interval: 5,
            });
        }
        return jsonResponse(400, { error: 'access_denied' });
    };

    await assert.rejects(
        loginWithDeviceQr({
            site,
            fetchFn,
            print: () => undefined,
            pollIntervalMs: 1,
        }),
        (error: unknown) =>
            error instanceof CliError && error.code === 'AUTH_REQUIRED',
    );
});

test('设备码登录：过期 → AUTH_REQUIRED', async () => {
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(200, {
                device_code: 'dc-3',
                user_code: 'QRST-2345',
                verification_uri: 'https://x.brandct.com/api/v1/oauth/device/activate',
                verification_uri_complete:
                    'https://x.brandct.com/api/v1/oauth/device/activate?user_code=QRST-2345',
                expires_in: 600,
                interval: 5,
            });
        }
        return jsonResponse(400, { error: 'expired_token' });
    };

    await assert.rejects(
        loginWithDeviceQr({
            site,
            fetchFn,
            print: () => undefined,
            pollIntervalMs: 1,
        }),
        (error: unknown) =>
            error instanceof CliError && error.code === 'AUTH_REQUIRED',
    );
});

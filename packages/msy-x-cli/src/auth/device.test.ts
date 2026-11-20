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

const deviceOkBody = (
    extra: Record<string, unknown>,
): Record<string, unknown> => ({
    device_code: 'dc-x',
    user_code: 'TEST-2345',
    verification_uri: 'https://x.brandct.com/api/v1/oauth/device/activate',
    verification_uri_complete:
        'https://x.brandct.com/api/v1/oauth/device/activate?user_code=TEST-2345',
    expires_in: 600,
    interval: 5,
    ...extra,
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

test('设备码登录：轮询遇 5xx（server_error）可重试，随后成功拿到 token', async () => {
    let polls = 0;
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(
                200,
                deviceOkBody({ device_code: 'dc-5xx', user_code: 'R5XX-2345' }),
            );
        }
        polls += 1;
        if (polls === 1) {
            // 服务端暂时不可用：不应判成 AUTH_REQUIRED 终态提前退出
            return jsonResponse(500, { error: 'server_error' });
        }
        return jsonResponse(200, {
            access_token: 'at-retry-5xx',
            token_type: 'Bearer',
        });
    };

    const credentials = await loginWithDeviceQr({
        site,
        fetchFn,
        print: () => undefined,
        pollIntervalMs: 1,
    });
    // 未在第一次轮询的 5xx 处提前终态（AUTH_REQUIRED/退 3）退出
    assert.equal(polls, 2);
    assert.equal(credentials.accessToken, 'at-retry-5xx');
});

test('设备码登录：轮询返回非 JSON（解析失败）可重试，随后成功拿到 token', async () => {
    let polls = 0;
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(
                200,
                deviceOkBody({ device_code: 'dc-html', user_code: 'HTML-2345' }),
            );
        }
        polls += 1;
        if (polls === 1) {
            // 网关 HTML：response.json() 抛解析错误，不应判成终态
            return new Response('<html>Bad Gateway</html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            });
        }
        return jsonResponse(200, {
            access_token: 'at-retry-parse',
            token_type: 'Bearer',
        });
    };

    const credentials = await loginWithDeviceQr({
        site,
        fetchFn,
        print: () => undefined,
        pollIntervalMs: 1,
    });
    assert.equal(polls, 2);
    assert.equal(credentials.accessToken, 'at-retry-parse');
});

test('设备码登录：轮询网络失败（fetch TypeError）可重试，随后成功拿到 token', async () => {
    let polls = 0;
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(
                200,
                deviceOkBody({ device_code: 'dc-net', user_code: 'NET-2345' }),
            );
        }
        polls += 1;
        if (polls === 1) {
            throw new TypeError('fetch failed');
        }
        return jsonResponse(200, {
            access_token: 'at-retry-net',
            token_type: 'Bearer',
        });
    };

    const credentials = await loginWithDeviceQr({
        site,
        fetchFn,
        print: () => undefined,
        pollIntervalMs: 1,
    });
    assert.equal(polls, 2);
    assert.equal(credentials.accessToken, 'at-retry-net');
});

/**
 * 临时替换 Date.now：第 1、2 次调用（deadline 计算 + 首轮检查）未到期，
 * 第 3 次起（重试后的 deadline 检查）视为已到期；用完恢复。
 */
const withExpiringClock = async (
    fn: () => Promise<void>,
): Promise<void> => {
    const originalNow = Date.now;
    const base = originalNow();
    let ticks = 0;
    globalThis.Date.now = (): number => {
        ticks += 1;
        return ticks <= 2 ? base : base + 60 * 60 * 1000;
    };
    try {
        await fn();
    } finally {
        globalThis.Date.now = originalNow;
    }
};

test('设备码登录：deadline 到期且有服务端可重试错误 → AUTH_REQUIRED（服务端暂时不可用）', async () => {
    await withExpiringClock(async () => {
        const fetchFn: FetchLike = async (input) => {
            const url = String(input);
            if (url.endsWith('/device')) {
                return jsonResponse(
                    200,
                    deviceOkBody({ device_code: 'dc-dl', user_code: 'DLSS-2345' }),
                );
            }
            return jsonResponse(503, { error: 'server_error' });
        };

        await assert.rejects(
            loginWithDeviceQr({
                site,
                fetchFn,
                print: () => undefined,
                pollIntervalMs: 1,
            }),
            (error: unknown) =>
                error instanceof CliError &&
                error.code === 'AUTH_REQUIRED' &&
                error.message.includes('服务端暂时不可用'),
        );
    });
});

test('设备码登录：deadline 到期且有网络类可重试错误 → NETWORK（退 6）', async () => {
    await withExpiringClock(async () => {
        const fetchFn: FetchLike = async (input) => {
            const url = String(input);
            if (url.endsWith('/device')) {
                return jsonResponse(
                    200,
                    deviceOkBody({ device_code: 'dc-dl-net', user_code: 'DLN-2345' }),
                );
            }
            throw new TypeError('fetch failed');
        };

        await assert.rejects(
            loginWithDeviceQr({
                site,
                fetchFn,
                print: () => undefined,
                pollIntervalMs: 1,
            }),
            (error: unknown) =>
                error instanceof CliError &&
                error.code === 'NETWORK' &&
                error.exitCode === 6,
        );
    });
});

test('设备码登录：deadline 到期且无可重试错误 → 保持现有超时文案', async () => {
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(
                200,
                deviceOkBody({ device_code: 'dc-dl-pure', user_code: 'DLP-2345' }),
            );
        }
        // 一直 pending（非可重试类），deadline 到期不应带「服务端暂时不可用」
        return jsonResponse(400, { error: 'authorization_pending' });
    };

    await assert.rejects(
        loginWithDeviceQr({
            site,
            fetchFn,
            print: () => undefined,
            pollIntervalMs: 1,
            timeoutMs: 0,
        }),
        (error: unknown) =>
            error instanceof CliError &&
            error.code === 'AUTH_REQUIRED' &&
            error.message.includes('设备码登录超时') &&
            !error.message.includes('服务端暂时不可用'),
    );
});

/**
 * 临时替换 globalThis.setTimeout：捕获 sleep 的间隔参数并立即放行，
 * 避免测试真等 5 秒；测完恢复原实现。
 */
const withCapturedSetTimeout = async (
    fn: (sleepArgs: number[]) => Promise<void>,
): Promise<void> => {
    const original = globalThis.setTimeout;
    const sleepArgs: number[] = [];
    const fakeSetTimeout = ((
        callback: (...args: never[]) => void,
        ms?: number,
    ) => {
        sleepArgs.push(typeof ms === 'number' ? ms : 0);
        return original(callback, 0) as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;
    globalThis.setTimeout = fakeSetTimeout;
    try {
        await fn(sleepArgs);
    } finally {
        globalThis.setTimeout = original;
    }
};

test('设备码登录：interval 缺失/非法时兜底 5s，不热轮询', async () => {
    // JSON 无法携带 NaN，用「缺失」与「null（NaN 经 JSON 往返）」两个用例
    const cases: Record<string, unknown>[] = [
        deviceOkBody({ device_code: 'dc-no-interval', interval: undefined }),
        deviceOkBody({ device_code: 'dc-null-interval', interval: null }),
    ];
    for (const deviceBody of cases) {
        let polls = 0;
        const fetchFn: FetchLike = async (input) => {
            const url = String(input);
            if (url.endsWith('/device')) {
                return jsonResponse(200, deviceBody);
            }
            polls += 1;
            if (polls === 1) {
                return jsonResponse(400, { error: 'authorization_pending' });
            }
            return jsonResponse(200, {
                access_token: 'at-fallback',
                token_type: 'Bearer',
            });
        };

        await withCapturedSetTimeout(async (sleepArgs) => {
            const credentials = await loginWithDeviceQr({
                site,
                fetchFn,
                print: () => undefined,
                // 不传 pollIntervalMs，走服务端 interval 兜底分支
            });
            assert.equal(credentials.accessToken, 'at-fallback');
            assert.equal(polls, 2);
            // 只 sleep 一次，且间隔是 5s 兜底，而非 0ms 热轮询
            assert.deepEqual(sleepArgs, [5_000]);
        });
    }
});

test('设备码登录：invalid_grant → AUTH_REQUIRED（设备码无效或已过期）', async () => {
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(
                200,
                deviceOkBody({ device_code: 'dc-ig', user_code: 'INVAL-2345' }),
            );
        }
        return jsonResponse(400, { error: 'invalid_grant' });
    };

    await assert.rejects(
        loginWithDeviceQr({
            site,
            fetchFn,
            print: () => undefined,
            pollIntervalMs: 1,
        }),
        (error: unknown) =>
            error instanceof CliError &&
            error.code === 'AUTH_REQUIRED' &&
            error.message.includes('设备码无效或已过期'),
    );
});

test('设备码登录：POST /device 404 → 站点不支持扫码登录', async () => {
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(404, { error: 'not_found' });
        }
        throw new Error('不应轮询 token');
    };

    await assert.rejects(
        loginWithDeviceQr({ site, fetchFn, print: () => undefined }),
        (error: unknown) =>
            error instanceof CliError &&
            error.code === 'AUTH_REQUIRED' &&
            error.message.includes('不支持扫码登录') &&
            // 版本要求统一到 2.7.5（2.7.4 的设备码会话存内存，多副本随机失败）
            error.message.includes('2.7.5'),
    );
});

test('设备码登录：pending → token 路径不回归（服务端 interval 生效）', async () => {
    let polls = 0;
    const fetchFn: FetchLike = async (input) => {
        const url = String(input);
        if (url.endsWith('/device')) {
            return jsonResponse(
                200,
                deviceOkBody({ device_code: 'dc-reg', user_code: 'REG-2345' }),
            );
        }
        polls += 1;
        if (polls === 1) {
            return jsonResponse(400, { error: 'authorization_pending' });
        }
        return jsonResponse(200, {
            access_token: 'at-reg',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'rt-reg',
            scope: 'mcp:read',
        });
    };

    await withCapturedSetTimeout(async (sleepArgs) => {
        const credentials = await loginWithDeviceQr({
            site,
            fetchFn,
            print: () => undefined,
            // 不传 pollIntervalMs，验证服务端 interval=5 → 5000ms 既有行为
        });
        assert.equal(credentials.mode, 'oauth');
        assert.equal(credentials.accessToken, 'at-reg');
        assert.equal(credentials.refreshToken, 'rt-reg');
        assert.equal(polls, 2);
        assert.deepEqual(sleepArgs, [5_000]);
    });
});

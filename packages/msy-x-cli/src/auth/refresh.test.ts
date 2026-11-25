import assert from 'node:assert/strict';
import { mkdtemp, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import { defaultConfig, readConfig, writeConfig } from '../config/store';
import type { EnvVars } from '../config/paths';
import type { CliConfig, OAuthCredentials, SiteProfile } from '../types';
import { ensureFreshCredentials } from './refresh';

/** 全部走临时目录（mkdtemp + MSY_X_CONFIG），绝不碰真实 ~/.config */
const makeTempEnv = async (): Promise<{ env: EnvVars; dir: string; file: string }> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'msy-x-refresh-'));
    const file = path.join(dir, 'config.yaml');
    return { env: { MSY_X_CONFIG: file }, dir, file };
};

const site: SiteProfile = {
    name: 'x',
    mcpUrl: 'https://x.brandct.com/api/v1/mcp',
    authMode: 'oauth',
    authHeader: 'authorization',
};

const expiredCredentials: OAuthCredentials = {
    mode: 'oauth',
    clientId: 'client-id-1',
    clientSecret: 'client-secret-1',
    redirectUri: 'http://127.0.0.1:53721/callback',
    accessToken: 'old-access',
    accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    refreshToken: 'rt-old',
    scope: 'mcp:read',
};

const writeCredentials = async (
    env: EnvVars,
    credentials: OAuthCredentials,
): Promise<CliConfig> => {
    const config: CliConfig = {
        ...defaultConfig(),
        auth: { x: credentials },
    };
    await writeConfig(config, env);
    return config;
};

type MockControls = {
    fetchFn: FetchLike;
    tokenCalls: () => number;
    lastTokenBody: () => URLSearchParams | null;
};

type MockOptions = {
    status?: number;
    accessToken?: string;
    /** 非 200 时的响应体（默认 OAuth 错误体 `{"error":"invalid_grant"}`） */
    body?: string;
    /** 抛网络异常（模拟连不上/超时）而不是返回响应 */
    throwNetworkError?: boolean;
    /** token 请求期间执行（模拟并发登录/刷新已改写磁盘） */
    onToken?: () => Promise<void>;
};

/** 本地 mock fetch：只应看到 token 端点（refresh 不做元数据发现） */
const makeMock = (options: MockOptions = {}): MockControls => {
    let tokenCalls = 0;
    let lastBody: URLSearchParams | null = null;
    const fetchFn: FetchLike = async (url, init) => {
        const target = String(url);
        if (!target.endsWith('/token')) {
            throw new Error(`测试 mock 未预期的请求：${target}`);
        }
        tokenCalls += 1;
        lastBody = new URLSearchParams(String(init?.body ?? ''));
        if (options.onToken !== undefined) await options.onToken();
        if (options.throwNetworkError === true) {
            throw new TypeError('fetch failed');
        }
        if ((options.status ?? 200) !== 200) {
            const status = options.status ?? 200;
            const body =
                options.body ?? JSON.stringify({ error: 'invalid_grant' });
            return new Response(body, {
                status,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(
            JSON.stringify({
                access_token: options.accessToken ?? 'new-access',
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: 'rt-new',
                scope: 'mcp:read',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    };
    return { fetchFn, tokenCalls: () => tokenCalls, lastTokenBody: () => lastBody };
};

test('access 未过期：原样返回，不发任何请求', async () => {
    const { env } = await makeTempEnv();
    const fresh = {
        ...expiredCredentials,
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    const config = await writeCredentials(env, fresh);
    const mock = makeMock({});

    const result = await ensureFreshCredentials({
        site,
        credentials: fresh,
        config,
        env,
        fetchFn: mock.fetchFn,
    });
    assert.equal(result, fresh);
    assert.equal(mock.tokenCalls(), 0);
});

test('PAT 凭证直接返回（无过期概念）', async () => {
    const { env } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({});
    const result = await ensureFreshCredentials({
        site,
        credentials: { mode: 'pat', pat: 'ldpat_x' },
        config,
        env,
        fetchFn: mock.fetchFn,
    });
    assert.deepEqual(result, { mode: 'pat', pat: 'ldpat_x' });
    assert.equal(mock.tokenCalls(), 0);
});

test('过期 → 刷新成功：原子写回新凭证，client_secret_post，锁已释放', async () => {
    const { env, dir } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({});

    const result = await ensureFreshCredentials({
        site,
        credentials: expiredCredentials,
        config,
        env,
        fetchFn: mock.fetchFn,
    });

    assert.equal(result.mode, 'oauth');
    if (result.mode === 'oauth') {
        assert.equal(result.accessToken, 'new-access');
        assert.equal(result.refreshToken, 'rt-new');
        assert.ok(Date.parse(result.accessExpiresAt) > Date.now());
    }
    assert.equal(mock.tokenCalls(), 1);
    const body = mock.lastTokenBody();
    assert.equal(body?.get('grant_type'), 'refresh_token');
    assert.equal(body?.get('refresh_token'), 'rt-old');
    assert.equal(body?.get('client_id'), 'client-id-1');
    assert.equal(body?.get('client_secret'), 'client-secret-1');

    // 写回了配置文件
    const saved = await readConfig(env);
    assert.equal(saved.auth.x?.mode, 'oauth');
    if (saved.auth.x?.mode === 'oauth') {
        assert.equal(saved.auth.x.accessToken, 'new-access');
    }
    // 锁已释放
    await assert.rejects(() => stat(path.join(dir, 'refresh.lock')));
});

test('并发刷新（两个 Promise）：只刷一次，另一个吃到结果', async () => {
    const { env } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({});

    const [first, second] = await Promise.all([
        ensureFreshCredentials({
            site,
            credentials: expiredCredentials,
            config,
            env,
            fetchFn: mock.fetchFn,
        }),
        ensureFreshCredentials({
            site,
            credentials: expiredCredentials,
            config,
            env,
            fetchFn: mock.fetchFn,
        }),
    ]);

    assert.equal(mock.tokenCalls(), 1, '并发时 token 端点只应被打一次');
    assert.ok(first.mode === 'oauth' && second.mode === 'oauth');
    if (first.mode === 'oauth' && second.mode === 'oauth') {
        assert.equal(first.accessToken, 'new-access');
        assert.equal(second.accessToken, 'new-access');
    }
    const saved = await readConfig(env);
    assert.ok(saved.auth.x?.mode === 'oauth');
});

test('refresh token 被服务端拒绝（invalid_grant）：清凭证 + AUTH_REQUIRED（退 3）', async () => {
    const { env, dir } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({ status: 400 });

    await assert.rejects(
        () =>
            ensureFreshCredentials({
                site,
                credentials: expiredCredentials,
                config,
                env,
                fetchFn: mock.fetchFn,
            }),
        (error: unknown) =>
            error instanceof CliError &&
            error.code === 'AUTH_REQUIRED' &&
            error.exitCode === ExitCode.AUTH_REQUIRED,
    );

    // 凭证被清空
    const saved = await readConfig(env);
    assert.equal(saved.auth.x, undefined);
    // 锁也释放了（失败路径不能把后续刷新全锁死）
    await assert.rejects(() => stat(path.join(dir, 'refresh.lock')));
});

// 0.2.4 的缺陷：网关 503 / 断网时会把整份登录删掉，用户看到「需要重新授权」
test('刷新遇服务端 503（非 OAuth 错误体）：保留凭证，抛 NETWORK（退 6）', async () => {
    const { env, dir } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({
        status: 503,
        body: '<html><body>503 Service Temporarily Unavailable</body></html>',
    });

    await assert.rejects(
        () =>
            ensureFreshCredentials({
                site,
                credentials: expiredCredentials,
                config,
                env,
                fetchFn: mock.fetchFn,
            }),
        (error: unknown) =>
            error instanceof CliError &&
            error.code === 'NETWORK' &&
            error.exitCode === ExitCode.NETWORK,
    );

    // 凭证必须原样留在本地（refresh token 还能再试）
    const saved = await readConfig(env);
    assert.deepEqual(saved.auth.x, expiredCredentials);
    await assert.rejects(() => stat(path.join(dir, 'refresh.lock')));
});

test('刷新遇网络异常：保留凭证，抛 NETWORK（退 6）', async () => {
    const { env } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({ throwNetworkError: true });

    await assert.rejects(
        () =>
            ensureFreshCredentials({
                site,
                credentials: expiredCredentials,
                config,
                env,
                fetchFn: mock.fetchFn,
            }),
        (error: unknown) =>
            error instanceof CliError && error.code === 'NETWORK',
    );

    const saved = await readConfig(env);
    assert.deepEqual(saved.auth.x, expiredCredentials);
});

// 并发：刷新进行中用户在另一终端登录成功（磁盘已被替换）
test('刷新期间完成新登录：不覆盖磁盘上的新凭证', async () => {
    const { env } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const freshLogin: OAuthCredentials = {
        ...expiredCredentials,
        accessToken: 'login-access',
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshToken: 'rt-from-login',
    };
    const mock = makeMock({
        onToken: async () => {
            await writeCredentials(env, freshLogin);
        },
    });

    const result = await ensureFreshCredentials({
        site,
        credentials: expiredCredentials,
        config,
        env,
        fetchFn: mock.fetchFn,
    });

    // 返回与磁盘都是新登录那份，不是刷新结果
    assert.deepEqual(result, freshLogin);
    const saved = await readConfig(env);
    assert.deepEqual(saved.auth.x, freshLogin);
});

test('刷新被拒但期间完成新登录：不删掉新凭证，仍抛 AUTH_REQUIRED', async () => {
    const { env } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const freshLogin: OAuthCredentials = {
        ...expiredCredentials,
        accessToken: 'login-access',
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshToken: 'rt-from-login',
    };
    const mock = makeMock({
        status: 400,
        onToken: async () => {
            await writeCredentials(env, freshLogin);
        },
    });

    await assert.rejects(
        () =>
            ensureFreshCredentials({
                site,
                credentials: expiredCredentials,
                config,
                env,
                fetchFn: mock.fetchFn,
            }),
        (error: unknown) =>
            error instanceof CliError && error.code === 'AUTH_REQUIRED',
    );

    // 新登录必须还在（否则等于把刚登录的用户踢下线）
    const saved = await readConfig(env);
    assert.deepEqual(saved.auth.x, freshLogin);
});

test('过期且没有 refresh token：清凭证并抛 AUTH_REQUIRED', async () => {
    const { env } = await makeTempEnv();
    const config = await writeCredentials(env, {
        ...expiredCredentials,
        refreshToken: null,
    });
    const mock = makeMock({});

    await assert.rejects(
        () =>
            ensureFreshCredentials({
                site,
                credentials: { ...expiredCredentials, refreshToken: null },
                config,
                env,
                fetchFn: mock.fetchFn,
            }),
        (error: unknown) => error instanceof CliError && error.code === 'AUTH_REQUIRED',
    );
    const saved = await readConfig(env);
    assert.equal(saved.auth.x, undefined);
    assert.equal(mock.tokenCalls(), 0);
});

test('残留的过期锁（>30s）会被清掉并重试刷新', async () => {
    const { env, dir } = await makeTempEnv();
    const config = await writeCredentials(env, expiredCredentials);
    const mock = makeMock({});

    // 手工造一个 31s 前的残留锁
    const staleTime = new Date(Date.now() - 31_000);
    const lockFile = path.join(dir, 'refresh.lock');
    await writeFile(lockFile, 'stale');
    await utimes(lockFile, staleTime, staleTime);

    const result = await ensureFreshCredentials({
        site,
        credentials: expiredCredentials,
        config,
        env,
        fetchFn: mock.fetchFn,
    });
    assert.ok(result.mode === 'oauth');
    assert.equal(mock.tokenCalls(), 1);
    await assert.rejects(() => stat(path.join(dir, 'refresh.lock')));
});

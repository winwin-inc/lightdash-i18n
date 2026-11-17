import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import { defaultConfig, readConfig, writeConfig } from '../config/store';
import { openBrowser } from '../lib/openBrowser';
import { loginWithOAuth } from '../auth/oauth';
import type {
    CommandContext,
    GlobalOptions,
    SiteProfile,
} from '../types';
import { runAuthCommand } from './auth';

/**
 * 契约命令（设计稿 §5.3）+ OAuth 全链路（本地 http mock，绝不出网）。
 * 测试环境一律 mkdtemp + process.env.MSY_X_CONFIG，结束恢复原值。
 */

const baseOptions: GlobalOptions = {
    site: null,
    projectUuid: null,
    format: null,
    envelope: false,
    out: null,
    timeoutMs: 60_000,
    mcpUrl: null,
    authHeader: null,
    configPath: null,
    dryRun: false,
    raw: false,
    verbose: false,
    quiet: false,
};

const makeCtx = (siteProfile: SiteProfile): CommandContext => ({
    options: baseOptions,
    site: siteProfile,
    credentials: null,
    format: 'json',
    startedAt: performance.now(),
});

/** 把 process.env.MSY_X_CONFIG 指到临时目录，返回恢复函数 */
const withTempConfig = async (): Promise<() => Promise<void>> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'msy-x-auth-'));
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = path.join(dir, 'config.yaml');
    return async () => {
        if (previous === undefined) delete process.env.MSY_X_CONFIG;
        else process.env.MSY_X_CONFIG = previous;
    };
};

const xSite: SiteProfile = {
    name: 'x',
    mcpUrl: 'https://x.brandct.com/api/v1/mcp',
    authMode: 'oauth',
    authHeader: 'authorization',
};

// ---------------------------------------------------------------------------
// OAuth 全链路 mock 站点：DCR → authorize（302 回回调）→ token → revoke
// ---------------------------------------------------------------------------

type MockCapture = {
    registerBody: Record<string, unknown> | null;
    authorizeQuery: URLSearchParams | null;
    tokenBody: URLSearchParams | null;
    tokenHeaders: IncomingHttpHeaders | null;
    revokeBody: URLSearchParams | null;
};

type MockSite = {
    baseUrl: string;
    capture: MockCapture;
    close: () => Promise<void>;
};

const startMockSite = async (): Promise<MockSite> => {
    const capture: MockCapture = {
        registerBody: null,
        authorizeQuery: null,
        tokenBody: null,
        tokenHeaders: null,
        revokeBody: null,
    };
    // 先声明后赋值：请求处理里要用，但端口要等 listen 回调才知道
    let mockBase = '';

    const readBody = (req: IncomingMessage): Promise<string> =>
        new Promise((resolve) => {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

    const handleRequest = async (
        req: IncomingMessage,
        res: ServerResponse,
    ): Promise<void> => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const send = (status: number, body: unknown): void => {
            res.writeHead(status, {
                'Content-Type':
                    typeof body === 'string'
                        ? 'text/html; charset=utf-8'
                        : 'application/json',
            });
            res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };

        // RFC9728 受保护资源元数据（SDK 先探测带路径的 well-known）
        if (
            req.method === 'GET' &&
            url.pathname === '/.well-known/oauth-protected-resource/api/v1/mcp'
        ) {
            send(200, {
                resource: `${mockBase}/api/v1/mcp`,
                authorization_servers: [mockBase],
            });
            return;
        }
                // RFC8414 授权服务器元数据
                if (
                    req.method === 'GET' &&
                    url.pathname === '/.well-known/oauth-authorization-server'
                ) {
                    send(200, {
                        issuer: mockBase,
                        authorization_endpoint: `${mockBase}/api/v1/oauth/authorize`,
                        token_endpoint: `${mockBase}/api/v1/oauth/token`,
                        registration_endpoint: `${mockBase}/api/v1/oauth/register`,
                        revocation_endpoint: `${mockBase}/api/v1/oauth/revoke`,
                        response_types_supported: ['code'],
                        grant_types_supported: [
                            'authorization_code',
                            'refresh_token',
                        ],
                        token_endpoint_auth_methods_supported: [
                            'client_secret_basic',
                            'client_secret_post',
                        ],
                        code_challenge_methods_supported: ['S256', 'plain'],
                        scopes_supported: ['mcp:read', 'mcp:write'],
                    });
                    return;
                }
                // DCR（后端实际行为：返回 client_secret，见 oauthRouter.ts /register）
                if (req.method === 'POST' && url.pathname === '/api/v1/oauth/register') {
                    capture.registerBody = JSON.parse(await readBody(req));
                    send(201, {
                        client_id: 'mock-client-id',
                        client_secret: 'mock-client-secret',
                        client_name: 'msy-x-cli',
                        redirect_uris: ['http://127.0.0.1:1/callback'],
                        grant_types: ['authorization_code', 'refresh_token'],
                        scope: 'mcp:read',
                        client_id_issued_at: Math.floor(Date.now() / 1000),
                    });
                    return;
                }
                // authorize：校验入参后 302 回真正的本机回调监听
                if (req.method === 'GET' && url.pathname === '/api/v1/oauth/authorize') {
                    capture.authorizeQuery = url.searchParams;
                    const redirectUri = url.searchParams.get('redirect_uri');
                    const state = url.searchParams.get('state') ?? '';
                    if (redirectUri === null) {
                        send(400, { error: 'invalid_request' });
                        return;
                    }
                    res.writeHead(302, {
                        Location: `${redirectUri}?code=mock-auth-code&state=${encodeURIComponent(state)}`,
                    });
                    res.end();
                    return;
                }
                // token：grant_type=authorization_code + PKCE + client_secret_post
                if (req.method === 'POST' && url.pathname === '/api/v1/oauth/token') {
                    capture.tokenBody = new URLSearchParams(await readBody(req));
                    capture.tokenHeaders = req.headers;
                    send(200, {
                        access_token: 'mock-access-token',
                        token_type: 'Bearer',
                        expires_in: 3600,
                        refresh_token: 'mock-refresh-token',
                        scope: 'mcp:read',
                    });
                    return;
                }
                // revoke：后端固定 200（尽力语义）
                if (req.method === 'POST' && url.pathname === '/api/v1/oauth/revoke') {
                    capture.revokeBody = new URLSearchParams(await readBody(req));
                    send(200, '');
                    return;
                }
        send(404, { error: 'not_found' });
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        handleRequest(req, res).catch(() => {
            res.writeHead(500);
            res.end();
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    mockBase = `http://127.0.0.1:${port}`;

    return {
        baseUrl: mockBase,
        capture,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeIdleConnections?.();
                server.close(() => resolve());
            }),
    };
};

test('OAuth 全链路（本地 http mock）：DCR → authorize code → token 交换，PKCE S256 + client_secret_post', async () => {
    const restore = await withTempConfig();
    const mock = await startMockSite();
    try {
        const site: SiteProfile = {
            name: 'mock',
            mcpUrl: `${mock.baseUrl}/api/v1/mcp`,
            authMode: 'oauth',
            authHeader: 'authorization',
        };

        const credentials = await loginWithOAuth({
            site,
            timeoutMs: 5_000,
            noBrowser: true, // 测试里用 onAuthorizationUrl 模拟浏览器
            onAuthorizationUrl: async (authorizationUrl) => {
                // 断言授权 URL 关键参数
                const q = authorizationUrl.searchParams;
                assert.equal(q.get('response_type'), 'code');
                assert.equal(q.get('scope'), 'mcp:read');
                assert.equal(q.get('code_challenge_method'), 'S256');
                assert.ok(q.get('code_challenge'));
                assert.ok(q.get('redirect_uri')?.startsWith('http://127.0.0.1:'));

                // 模拟浏览器：GET authorize → 302 → GET 回调
                const authorizeRes = await fetch(authorizationUrl, {
                    redirect: 'manual',
                });
                assert.equal(authorizeRes.status, 302);
                const location = authorizeRes.headers.get('location');
                assert.ok(location !== null);
                const callbackRes = await fetch(location);
                assert.equal(callbackRes.status, 200);
            },
        });

        // DCR 请求体：client_name / scope / 回环 redirect_uris
        assert.equal(mock.capture.registerBody?.client_name, 'msy-x-cli');
        assert.equal(mock.capture.registerBody?.scope, 'mcp:read');
        const redirectUris = mock.capture.registerBody?.redirect_uris;
        assert.ok(Array.isArray(redirectUris));
        assert.match(String(redirectUris?.[0]), /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

        // PKCE：token 请求的 code_verifier 与 authorize 的 S256 challenge 对得上
        const verifier = mock.capture.tokenBody?.get('code_verifier');
        assert.ok(verifier !== undefined && verifier.length >= 43);
        const expectedChallenge = createHash('sha256')
            .update(verifier as string)
            .digest('base64url');
        assert.equal(
            mock.capture.authorizeQuery?.get('code_challenge'),
            expectedChallenge,
            'code_challenge 必须是 S256(verifier)',
        );
        assert.equal(
            mock.capture.authorizeQuery?.get('code_challenge_method'),
            'S256',
        );

        // client_secret_post：client_id/secret 在请求体，不走 Basic 头
        assert.equal(mock.capture.tokenBody?.get('grant_type'), 'authorization_code');
        assert.equal(mock.capture.tokenBody?.get('code'), 'mock-auth-code');
        assert.equal(mock.capture.tokenBody?.get('client_id'), 'mock-client-id');
        assert.equal(mock.capture.tokenBody?.get('client_secret'), 'mock-client-secret');
        assert.equal(
            mock.capture.tokenHeaders?.authorization,
            undefined,
            '不得用 Authorization: Basic',
        );
        const redirectUriUsed = mock.capture.tokenBody?.get('redirect_uri');
        assert.equal(redirectUriUsed, mock.capture.authorizeQuery?.get('redirect_uri'));

        // 返回的凭证形态（未落盘——本测试没经过命令层）
        assert.equal(credentials.mode, 'oauth');
        if (credentials.mode === 'oauth') {
            assert.equal(credentials.accessToken, 'mock-access-token');
            assert.equal(credentials.clientId, 'mock-client-id');
            assert.equal(credentials.clientSecret, 'mock-client-secret');
            assert.equal(credentials.refreshToken, 'mock-refresh-token');
            assert.equal(credentials.scope, 'mcp:read');
            assert.ok(Date.parse(credentials.accessExpiresAt) > Date.now());
        }
        // loginWithOAuth 本身不写盘
        const config = await readConfig();
        assert.equal(config.auth.mock, undefined);
    } finally {
        await mock.close();
        await restore();
    }
});

test('OAuth 登录成功后：status logged_in=true（首键）→ logout（revoke + 删凭证）→ status logged_in=false', async () => {
    const restore = await withTempConfig();
    const mock = await startMockSite();
    try {
        const site: SiteProfile = {
            name: 'mock',
            mcpUrl: `${mock.baseUrl}/api/v1/mcp`,
            authMode: 'oauth',
            authHeader: 'authorization',
        };
        const credentials = await loginWithOAuth({
            site,
            timeoutMs: 5_000,
            noBrowser: true,
            onAuthorizationUrl: async (authorizationUrl) => {
                const authorizeRes = await fetch(authorizationUrl, {
                    redirect: 'manual',
                });
                await fetch(authorizeRes.headers.get('location') as string);
            },
        });
        // 命令层落盘（与 runAuthCommand login 相同的写法）
        const config = await readConfig();
        config.auth[site.name] = credentials;
        await writeConfig(config);

        // status：已登录（首键 + 豆包正则）
        const statusIn = await runAuthCommand('status', {}, makeCtx(site));
        assert.equal(statusIn.exitCode, ExitCode.OK);
        const parsedIn = JSON.parse(statusIn.stdout);
        assert.equal(Object.keys(parsedIn)[0], 'logged_in');
        assert.match(statusIn.stdout, /"logged_in"\s*:\s*true/);
        assert.equal(parsedIn.site, 'mock');
        assert.equal(parsedIn.authMode, 'oauth');
        assert.equal(parsedIn.expiresAt, credentials.accessExpiresAt);
        assert.equal(parsedIn.scope, 'mcp:read');

        // logout：revoke（尽力）+ 删凭证
        const logoutRes = await runAuthCommand('logout', {}, makeCtx(site));
        assert.equal(logoutRes.exitCode, ExitCode.OK);
        const parsedOut = JSON.parse(logoutRes.stdout);
        assert.equal(Object.keys(parsedOut)[0], 'logged_out');
        assert.equal(parsedOut.logged_out, true);
        assert.equal(mock.capture.revokeBody?.get('token'), 'mock-refresh-token');

        // status：未登录（退 0，靠 logged_in 区分）
        const statusOut = await runAuthCommand('status', {}, makeCtx(site));
        assert.equal(statusOut.exitCode, ExitCode.OK, '未登录也退 0');
        const parsedOutStatus = JSON.parse(statusOut.stdout);
        assert.equal(Object.keys(parsedOutStatus)[0], 'logged_in');
        assert.match(statusOut.stdout, /"logged_in"\s*:\s*false/);
    } finally {
        await mock.close();
        await restore();
    }
});

// ---------------------------------------------------------------------------
// auth login --token（PAT 路径）与本地错误
// ---------------------------------------------------------------------------

test('auth login --token：落盘 mode: pat，输出契约 JSON，退 0', async () => {
    const restore = await withTempConfig();
    try {
        const pat = `ldpat_${'a'.repeat(38)}`;
        const result = await runAuthCommand(
            'login',
            { token: pat },
            makeCtx(xSite),
        );
        assert.equal(result.exitCode, ExitCode.OK);
        const parsed = JSON.parse(result.stdout);
        assert.equal(Object.keys(parsed)[0], 'logged_in');
        assert.deepEqual(parsed, {
            logged_in: true,
            site: 'x',
            authMode: 'pat',
            mode: 'login',
        });
        // 落盘校验
        const config = await readConfig();
        assert.deepEqual(config.auth.x, { mode: 'pat', pat });
        // status 跟着变
        const status = await runAuthCommand('status', {}, makeCtx(xSite));
        assert.match(status.stdout, /"logged_in"\s*:\s*true/);
        assert.equal(JSON.parse(status.stdout).authMode, 'pat');
    } finally {
        await restore();
    }
});

test('auth login --token 空串：USAGE（退 2），不写盘', async () => {
    const restore = await withTempConfig();
    try {
        await assert.rejects(
            () => runAuthCommand('login', { token: '  ' }, makeCtx(xSite)),
            (error: unknown) =>
                error instanceof CliError && error.exitCode === ExitCode.USAGE,
        );
        const config = await readConfig();
        assert.equal(config.auth.x, undefined);
    } finally {
        await restore();
    }
});

test('auth logout 幂等：无凭证也成功输出 {logged_out:true}', async () => {
    const restore = await withTempConfig();
    try {
        const result = await runAuthCommand('logout', {}, makeCtx(xSite));
        assert.equal(result.exitCode, ExitCode.OK);
        assert.deepEqual(JSON.parse(result.stdout), {
            logged_out: true,
            site: 'x',
        });
        // 再来一次同样成功
        const again = await runAuthCommand('logout', {}, makeCtx(xSite));
        assert.equal(again.exitCode, ExitCode.OK);
    } finally {
        await restore();
    }
});

test('auth status 本地读失败（坏 YAML）：CliError CONFIG，退 2', async () => {
    const restore = await withTempConfig();
    try {
        assert.ok(process.env.MSY_X_CONFIG !== undefined);
        await writeFile(process.env.MSY_X_CONFIG, 'sites: [unclosed', 'utf8');
        await assert.rejects(
            () => runAuthCommand('status', {}, makeCtx(xSite)),
            (error: unknown) =>
                error instanceof CliError &&
                error.code === 'CONFIG' &&
                error.exitCode === ExitCode.USAGE,
        );
    } finally {
        await restore();
    }
});

test('auth login --timeout 非法：USAGE（退 2）', async () => {
    const restore = await withTempConfig();
    try {
        await assert.rejects(
            () =>
                runAuthCommand(
                    'login',
                    { timeoutMs: -1 },
                    makeCtx(xSite),
                ),
            (error: unknown) =>
                error instanceof CliError && error.exitCode === ExitCode.USAGE,
        );
    } finally {
        await restore();
    }
});

test('默认配置（未登录）：auth status 退 0 且 logged_in=false 是首键', async () => {
    const restore = await withTempConfig();
    try {
        const config = await readConfig();
        assert.deepEqual(config, defaultConfig());
        const result = await runAuthCommand('status', {}, makeCtx(xSite));
        assert.equal(result.exitCode, ExitCode.OK);
        const parsed = JSON.parse(result.stdout);
        assert.equal(Object.keys(parsed)[0], 'logged_in');
        assert.equal(parsed.logged_in, false);
        assert.equal(parsed.site, 'x');
        assert.equal(parsed.authMode, 'oauth');
    } finally {
        await restore();
    }
});

// ---------------------------------------------------------------------------
// openBrowser 契约
// ---------------------------------------------------------------------------

test('openBrowser：MSY_X_NO_BROWSER=1 时返回 false（不拉浏览器）', async () => {
    assert.equal(
        await openBrowser('https://example.com/auth', { MSY_X_NO_BROWSER: '1' }),
        false,
    );
});

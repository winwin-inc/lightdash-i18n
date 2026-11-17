import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm as rmDir } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import { runToolCommand } from '../cli/run';
import { defaultConfig, writeConfig } from '../config/store';
import type {
    CommandContext,
    GlobalOptions,
    McpClient,
    OAuthCredentials,
    ToolCall,
    ToolResult,
} from '../types';
import { executeToolCall } from './callTool';

type CallImpl = (
    call: ToolCall,
    options?: { timeoutMs?: number },
) => Promise<ToolResult>;

const makeClient = (impl: CallImpl): McpClient => ({
    listTools: async () => [],
    callTool: impl,
    close: async () => {},
});

const call: ToolCall = { tool: 'list_explores', args: { pageSize: 10 } };

test('成功调用原样返回，content 缺失时填 []', async () => {
    const result: ToolResult = {
        structuredContent: { explores: [] },
        content: [],
        isError: false,
    };
    const output = await executeToolCall({
        client: makeClient(async () => result),
        call,
        timeoutMs: 1000,
    });
    assert.deepEqual(output, result);

    const missingContent = await executeToolCall({
        client: makeClient(async () => ({ isError: false }) as ToolResult),
        call,
        timeoutMs: 1000,
    });
    assert.deepEqual(missingContent.content, []);
    assert.equal(missingContent.isError, false);
});

test('超时 → NETWORK(6)，hint 提示查询可能仍在服务端执行', { timeout: 3000 }, async () => {
    const never = makeClient(
        () =>
            new Promise<ToolResult>(() => {
                // 永不 resolve，模拟服务端无响应
            }),
    );
    await assert.rejects(
        executeToolCall({ client: never, call, timeoutMs: 30 }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            const cliError = error as Error & {
                code?: string;
                exitCode?: number;
                hint?: string | null;
            };
            assert.equal(cliError.code, 'NETWORK');
            assert.equal(cliError.exitCode, ExitCode.NETWORK);
            assert.ok(cliError.hint?.includes('查询可能仍在服务端执行'));
            return true;
        },
    );
});

test('MCP 返回 isError:true → SERVER_ERROR(5)，首条 text 作为 message', async () => {
    const failing = makeClient(async () => ({
        content: [{ type: 'text', text: '服务端报错：项目不存在' }],
        isError: true,
    }));
    await assert.rejects(
        executeToolCall({ client: failing, call, timeoutMs: 1000 }),
        (error: unknown) => {
            const cliError = error as Error & { code?: string; exitCode?: number };
            assert.equal(cliError.code, 'SERVER_ERROR');
            assert.equal(cliError.exitCode, ExitCode.SERVER_ERROR);
            assert.equal((error as Error).message, '服务端报错：项目不存在');
            return true;
        },
    );
});

test('isError:true 且属于五类 dashboard_* → code 原样用服务端 status，退 4', async () => {
    const gated = makeClient(async () => ({
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    status: 'dashboard_selection_required',
                    message: '关联了多个看板，需要显式选择',
                    hint: '下一步：把选中看板的 dashboardUuid 传回来。',
                }),
            },
        ],
        structuredContent: {
            status: 'dashboard_selection_required',
            message: '关联了多个看板，需要显式选择',
            hint: '下一步：把选中看板的 dashboardUuid 传回来。',
        },
        isError: true,
    }));
    await assert.rejects(
        executeToolCall({ client: gated, call, timeoutMs: 1000 }),
        (error: unknown) => {
            const cliError = error as Error & {
                code?: string;
                exitCode?: number;
                message?: string;
            };
            assert.equal(cliError.code, 'dashboard_selection_required');
            assert.equal(cliError.exitCode, 4);
            assert.equal(cliError.message, '关联了多个看板，需要显式选择');
            return true;
        },
    );
});

test('客户端抛 UnauthorizedError → AUTH_REQUIRED(3)', async () => {
    const unauthorized = makeClient(async () => {
        throw new UnauthorizedError();
    });
    await assert.rejects(
        executeToolCall({ client: unauthorized, call, timeoutMs: 1000 }),
        (error: unknown) => {
            const cliError = error as Error & { code?: string; exitCode?: number };
            assert.equal(cliError.code, 'AUTH_REQUIRED');
            assert.equal(cliError.exitCode, ExitCode.AUTH_REQUIRED);
            return true;
        },
    );
});

test('客户端抛 AbortError → NETWORK(6)', async () => {
    const aborted = makeClient(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
    });
    await assert.rejects(
        executeToolCall({ client: aborted, call, timeoutMs: 1000 }),
        (error: unknown) => {
            const cliError = error as Error & { code?: string; exitCode?: number };
            assert.equal(cliError.code, 'NETWORK');
            assert.equal(cliError.exitCode, ExitCode.NETWORK);
            return true;
        },
    );
});

/* ------------------------------------------------------------------
 * D1：确保 cli/run.ts 的 refreshOnAuthError 真实可达
 * （SDK 普通 Error 带的 401 必须先被映射成 AUTH_REQUIRED，刷新链路才会走）
 *
 * 不改 run.ts：用假 createClient + 本地 mock token 端点 + 临时配置文件
 * （MSY_X_CONFIG）跑真实 runToolCommand，覆盖「401 → 刷新一次 → 重试成功」
 * 与「刷新后仍 401 → 退 3」两条路径。
 * ------------------------------------------------------------------ */

type RefreshFixture = {
    /** 临时 MSY_X_CONFIG 文件（写入过期 OAuth 凭证） */
    configFile: string;
    /** 本地 token 端点（http://127.0.0.1:<port>/api/v1/oauth/token） */
    baseUrl: string;
    tokenCalls: () => number;
    closeServer: () => Promise<void>;
};

const startRefreshFixture = async (): Promise<RefreshFixture> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'msy-x-refresh-e2e-'));
    const configFile = path.join(dir, 'config.yaml');
    let tokenCalls = 0;
    const server = http.createServer((req, res) => {
        // SDK refreshAuthorization 用 new URL('/token', authServer)，解析后是站点根的 /token
        if (req.method === 'POST' && (req.url === '/token' || req.url === '/api/v1/oauth/token')) {
            tokenCalls += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    access_token: 'new-access',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_token: 'rt-new',
                    scope: 'mcp:read',
                }),
            );
            return;
        }
        res.writeHead(404);
        res.end();
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    assert.ok(address !== null && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return {
        configFile,
        baseUrl,
        tokenCalls: () => tokenCalls,
        closeServer: async () => {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
            await rmDir(dir, { recursive: true, force: true }).catch(
                () => undefined,
            );
        },
    };
};

const expiredOAuth: OAuthCredentials = {
    mode: 'oauth',
    clientId: 'client-id-1',
    clientSecret: 'client-secret-1',
    redirectUri: 'http://127.0.0.1:53721/callback',
    accessToken: 'old-access',
    accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    refreshToken: 'rt-old',
    scope: 'mcp:read',
};

const makeRunCtx = (
    mcpUrl: string,
    credentials: OAuthCredentials,
): CommandContext => ({
    options: {
        site: null,
        projectUuid: null,
        format: null,
        envelope: false,
        out: null,
        timeoutMs: 5000,
        mcpUrl: null,
        authHeader: null,
        configPath: null,
        dryRun: false,
        raw: false,
        verbose: false,
        quiet: true,
    } satisfies GlobalOptions,
    site: {
        name: 'x',
        mcpUrl,
        authMode: 'oauth',
        authHeader: 'authorization',
    },
    credentials,
    format: 'json',
    startedAt: performance.now(),
});

const captureStdout = async (fn: () => Promise<void>): Promise<string> => {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    const write = ((chunk: unknown): boolean => {
        if (typeof chunk === 'string') chunks.push(chunk);
        return original(chunk as Parameters<typeof original>[0]);
    }) as typeof process.stdout.write;
    process.stdout.write = write;
    try {
        await fn();
    } finally {
        process.stdout.write = original;
    }
    return chunks.join('');
};

test('runToolCommand：SDK 普通 Error 401 → 刷新一次 → 新客户端重试成功', { timeout: 15_000 }, async () => {
    const fixture = await startRefreshFixture();
    const previousConfig = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = fixture.configFile;
    try {
        await writeConfig(
            { ...defaultConfig(), auth: { x: expiredOAuth } },
            { MSY_X_CONFIG: fixture.configFile },
        );
        const seenTokens: string[] = [];
        let callToolCalls = 0;
        const client: McpClient = {
            listTools: async () => [],
            callTool: async () => {
                callToolCalls += 1;
                const token = seenTokens[seenTokens.length - 1] ?? '';
                if (token === 'old-access') {
                    // SDK streamableHttp 的真实形态：普通 Error，状态码只在 message 里
                    throw new Error(
                        'Error POSTing to endpoint (HTTP 401): Unauthorized',
                    );
                }
                return {
                    structuredContent: undefined,
                    content: [
                        { type: 'text', text: JSON.stringify({ rows: [{ a: 1 }] }) },
                    ],
                    isError: false,
                } satisfies ToolResult;
            },
            close: async () => {},
        };
        const ctx = makeRunCtx(
            `${fixture.baseUrl}/api/v1/mcp`,
            expiredOAuth,
        );
        const stdout = await captureStdout(() =>
            runToolCommand(
                { tool: 'get_site_info', args: {} },
                ctx,
                {
                    createClient: async ({ credentials }) => {
                        assert.ok(credentials !== null);
                        assert.equal(credentials.mode, 'oauth');
                        seenTokens.push(credentials.accessToken);
                        return client;
                    },
                },
            ),
        );
        // 刷新链路真实走通：token 端点被调一次，客户端用新令牌重建并重试成功
        assert.equal(fixture.tokenCalls(), 1);
        assert.deepEqual(seenTokens, ['old-access', 'new-access']);
        assert.equal(callToolCalls, 2);
        const parsed = JSON.parse(stdout) as { rows: Array<{ a: number }> };
        assert.deepEqual(parsed, { rows: [{ a: 1 }] });
    } finally {
        if (previousConfig === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previousConfig;
        }
        await fixture.closeServer();
    }
});

test('runToolCommand：刷新后仍 401 → 退 3（AUTH_REQUIRED，不再二次刷新）', { timeout: 15_000 }, async () => {
    const fixture = await startRefreshFixture();
    const previousConfig = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = fixture.configFile;
    try {
        await writeConfig(
            { ...defaultConfig(), auth: { x: expiredOAuth } },
            { MSY_X_CONFIG: fixture.configFile },
        );
        const seenTokens: string[] = [];
        let callToolCalls = 0;
        const client: McpClient = {
            listTools: async () => [],
            callTool: async () => {
                callToolCalls += 1;
                // 无论新旧令牌一律 401
                throw new Error('Error POSTing to endpoint (HTTP 401): Unauthorized');
            },
            close: async () => {},
        };
        const ctx = makeRunCtx(
            `${fixture.baseUrl}/api/v1/mcp`,
            expiredOAuth,
        );
        await assert.rejects(
            runToolCommand({ tool: 'get_site_info', args: {} }, ctx, {
                createClient: async ({ credentials }) => {
                    assert.ok(credentials !== null);
                    assert.equal(credentials.mode, 'oauth');
                    seenTokens.push(credentials.accessToken);
                    return client;
                },
            }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.equal(error.code, 'AUTH_REQUIRED');
                assert.equal(error.exitCode, ExitCode.AUTH_REQUIRED);
                return true;
            },
        );
        // 只刷新一次；重试失败直接退 3
        assert.equal(fixture.tokenCalls(), 1);
        assert.deepEqual(seenTokens, ['old-access', 'new-access']);
        assert.equal(callToolCalls, 2);
    } finally {
        if (previousConfig === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previousConfig;
        }
        await fixture.closeServer();
    }
});

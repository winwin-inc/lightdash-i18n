import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm as rmDir } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import { setVerbose } from '../lib/logger';
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
import { executeToolCall, summarizeArgs } from './callTool';

/** 捕获 stderr 写入（verbose 日志断言用，不透传到真实 stderr） */
const captureStderr = (): { lines: string[]; restore: () => void } => {
    const original = process.stderr.write.bind(process.stderr);
    const lines: string[] = [];
    const write = ((chunk: Uint8Array | string): boolean => {
        lines.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
        return true;
    }) as typeof process.stderr.write;
    process.stderr.write = write;
    return {
        lines,
        restore: () => {
            process.stderr.write = original;
        },
    };
};

/** MSY_X_DEBUG 环境变量快照/还原 */
const envDebug = {
    backup: (): string | undefined => process.env.MSY_X_DEBUG,
    restore: (previous: string | undefined): void => {
        if (previous === undefined) {
            delete process.env.MSY_X_DEBUG;
        } else {
            process.env.MSY_X_DEBUG = previous;
        }
    },
};

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

/* ------------------------------------------------------------------
 * D10：--verbose / MSY_X_DEBUG=1 的请求/响应摘要日志
 * ------------------------------------------------------------------ */

const okClient = (rows: Array<Record<string, unknown>>): McpClient =>
    makeClient(async () => ({
        structuredContent: { rows },
        content: [],
        isError: false,
    }));

test('verbose 未开启：executeToolCall 不打 [verbose]，stdout 不被污染', async () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(false);
        await executeToolCall({
            client: okClient([{ a: 1 }]),
            call,
            timeoutMs: 1000,
        });
        assert.ok(
            capture.lines.every((line) => !line.includes('[verbose]')),
            '未开启 verbose 时不得有 [verbose] 行',
        );
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('--verbose：请求/响应两行（→ 与 ← ok rows=N <ms>ms source=…）', async () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(true);
        await executeToolCall({
            client: okClient([{ a: 1 }, { a: 2 }]),
            call,
            timeoutMs: 1000,
        });
        assert.equal(capture.lines.length, 2);
        assert.match(capture.lines[0], /^\[verbose\] → list_explores \{"pageSize":10\}\n$/);
        assert.match(
            capture.lines[1],
            /^\[verbose\] ← list_explores ok rows=2 \d+ms source=structured\n$/,
        );
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('--verbose：失败时 ← <tool> error <code> <ms>ms', async () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(true);
        await assert.rejects(
            executeToolCall({
                client: makeClient(async () => {
                    throw new Error(
                        'Error POSTing to endpoint (HTTP 401): Unauthorized',
                    );
                }),
                call,
                timeoutMs: 1000,
            }),
            (error: unknown) => {
                const cliError = error as Error & { code?: string };
                assert.equal(cliError.code, 'AUTH_REQUIRED');
                return true;
            },
        );
        assert.equal(capture.lines.length, 2);
        assert.match(capture.lines[0], /^\[verbose\] → list_explores /);
        assert.match(
            capture.lines[1],
            /^\[verbose\] ← list_explores error AUTH_REQUIRED \d+ms\n$/,
        );
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('summarizeArgs：恰好 500 字符不截断，超出截为 500 + …', () => {
    // {"q":"…"} 共 8 个固定字符，n 个 x → 总长 8+n
    const exact = summarizeArgs({ q: 'x'.repeat(492) });
    assert.equal(exact.length, 500);
    assert.ok(!exact.includes('…'));
    const over = summarizeArgs({ q: 'x'.repeat(493) });
    assert.equal(over.length, 501);
    assert.ok(over.endsWith('…'));
    assert.ok(over.startsWith('{"q":"xxxx'));
});

test('--verbose：参数摘要脱敏（apiKey/Authorization/嵌套 token 全 ***）', async () => {
    const previous = envDebug.backup();
    const pat = `ldpat_${'a'.repeat(38)}`;
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(true);
        const secretCall: ToolCall = {
            tool: 'get_site_info',
            args: {
                apiKey: pat,
                Authorization: 'ApiKey x',
                nested: { token: 't', keep: 1 },
            },
        };
        await executeToolCall({
            client: okClient([]),
            call: secretCall,
            timeoutMs: 1000,
        });
        const request = capture.lines[0];
        assert.ok(request !== undefined);
        assert.ok(!request.includes(pat), 'PAT 绝不能出现在请求日志里');
        assert.ok(!request.includes('ApiKey x'), 'Authorization 值必须脱敏');
        assert.ok(request.includes('"apiKey":"***"'));
        assert.ok(request.includes('"Authorization":"***"'));
        assert.ok(request.includes('"nested":{"token":"***","keep":1}'));
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('runToolCommand：dry-run + --verbose → stderr 有 → …(dry-run)，stdout 只有 JSON', async () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        const ctx: CommandContext = {
            options: {
                site: null,
                projectUuid: null,
                format: null,
                envelope: false,
                out: null,
                timeoutMs: 1000,
                mcpUrl: null,
                authHeader: null,
                configPath: null,
                dryRun: true,
                raw: false,
                verbose: true,
                quiet: true,
            } satisfies GlobalOptions,
            site: {
                name: 'x',
                mcpUrl: 'http://127.0.0.1:1/api/v1/mcp',
                authMode: 'oauth',
                authHeader: 'authorization',
            },
            credentials: null,
            format: 'json',
            startedAt: performance.now(),
        };
        const stdout = await captureStdout(() =>
            runToolCommand({ tool: 'get_site_info', args: {} }, ctx),
        );
        assert.equal(capture.lines.length, 1);
        assert.match(
            capture.lines[0],
            /^\[verbose\] → get_site_info \{\} \(dry-run\)\n$/,
        );
        assert.equal(stdout, '{"tool":"get_site_info","args":{}}\n');
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('runToolCommand：MSY_X_DEBUG=1 等价（未传 --verbose 也打摘要）', async () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        process.env.MSY_X_DEBUG = '1';
        const ctx: CommandContext = {
            options: {
                site: null,
                projectUuid: null,
                format: null,
                envelope: false,
                out: null,
                timeoutMs: 1000,
                mcpUrl: null,
                authHeader: null,
                configPath: null,
                dryRun: true,
                raw: false,
                verbose: false,
                quiet: true,
            } satisfies GlobalOptions,
            site: {
                name: 'x',
                mcpUrl: 'http://127.0.0.1:1/api/v1/mcp',
                authMode: 'oauth',
                authHeader: 'authorization',
            },
            credentials: null,
            format: 'json',
            startedAt: performance.now(),
        };
        const stdout = await captureStdout(() =>
            runToolCommand({ tool: 'get_site_info', args: { a: 1 } }, ctx),
        );
        assert.match(capture.lines[0], /^\[verbose\] → get_site_info \{"a":1\} \(dry-run\)\n$/);
        assert.equal(stdout, '{"tool":"get_site_info","args":{"a":1}}\n');
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

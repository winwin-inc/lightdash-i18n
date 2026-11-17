import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError } from '../cli/errors';
import type {
    CommandBuildInput,
    CommandContext,
    GlobalOptions,
    McpClient,
    ToolCall,
    ToolResult,
} from '../types';
import {
    VERIFIED_UNSUPPORTED_NOTICE,
    findUnsupportedContentNotice,
    runVerifiedCommand,
    verifiedCommands,
} from './verified';

/**
 * `msy-x verified` 单测（设计稿 §6.2）：
 * - build 纯映射：page/pageSize/full/projectUuid；pageSize 1..100 截断与非法值；
 * - supported:false 判定：structuredContent 与 content 文本两种来源；
 * - runVerifiedCommand：unsupported 按成功退 0（stdout 原样 JSON + stderr 提示）、
 *   正常结果走常规渲染、--dry-run 不建连、401 无凭证不重试
 *   （全部注入假 client，不联网）。
 */

const UUID = '3f5d1b0e-1111-4222-8333-444455556666';

const spec = verifiedCommands[0];
assert.ok(spec !== undefined, 'verifiedCommands 应包含 verified 命令');

const input = (partial: Partial<CommandBuildInput>): CommandBuildInput => ({
    args: {},
    options: {},
    projectUuid: null,
    ...partial,
});

const buildOne = (partial: Partial<CommandBuildInput> = {}): ToolCall => {
    const calls = spec.build(input(partial));
    assert.equal(calls.length, 1, 'verified 应只产出 1 条 ToolCall');
    return calls[0] as ToolCall;
};

const assertUsage = (fn: () => unknown): void => {
    assert.throws(fn, (error: unknown) => {
        assert.ok(error instanceof CliError, '应抛出 CliError');
        assert.equal(error.code, 'USAGE');
        return true;
    });
};

/* ------------------------------------------------------------------ */
/* build：纯映射                                                       */
/* ------------------------------------------------------------------ */

test('verified build：默认无参 → list_verified_content + 空入参', () => {
    assert.deepEqual(buildOne(), { tool: 'list_verified_content', args: {} });
});

test('verified build：page/pageSize/full 映射 + projectUuid 注入', () => {
    const call = buildOne({
        options: { page: '2', pageSize: '50', full: true },
        projectUuid: UUID,
    });
    assert.equal(call.tool, 'list_verified_content');
    assert.deepEqual(call.args, {
        page: 2,
        pageSize: 50,
        full: true,
        projectUuid: UUID,
    });
});

test('verified build：pageSize 超过 100 截断到 100；非法值退 USAGE', () => {
    assert.equal(buildOne({ options: { pageSize: '999' } }).args.pageSize, 100);
    assertUsage(() => buildOne({ options: { pageSize: '0' } }));
    assertUsage(() => buildOne({ options: { pageSize: 'abc' } }));
    assertUsage(() => buildOne({ options: { page: '0' } }));
});

/* ------------------------------------------------------------------ */
/* supported:false 判定（纯函数）                                       */
/* ------------------------------------------------------------------ */

const UNSUPPORTED_PAYLOAD = {
    error: 'Content verification is not available on this Lightdash deployment',
    supported: false,
    hint: 'The content-verification feature is not deployed on this site.',
};

const textResult = (payload: unknown): ToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: false,
});

test('findUnsupportedContentNotice：content 文本 JSON 命中，rawText 为服务端原文', () => {
    const notice = findUnsupportedContentNotice(textResult(UNSUPPORTED_PAYLOAD));
    assert.ok(notice !== null, '应识别 supported:false');
    assert.equal(notice.payload.supported, false);
    assert.equal(notice.payload.error, UNSUPPORTED_PAYLOAD.error);
    // 原样输出：rawText 是服务端返回的文本块本身
    assert.equal(notice.rawText, JSON.stringify(UNSUPPORTED_PAYLOAD, null, 2));
});

test('findUnsupportedContentNotice：structuredContent 命中', () => {
    const notice = findUnsupportedContentNotice({
        structuredContent: UNSUPPORTED_PAYLOAD,
        content: [],
        isError: false,
    });
    assert.ok(notice !== null);
    assert.deepEqual(JSON.parse(notice.rawText), UNSUPPORTED_PAYLOAD);
});

test('findUnsupportedContentNotice：正常结果返回 null', () => {
    assert.equal(
        findUnsupportedContentNotice(
            textResult({ results: [{ uuid: 'a', name: '已认证看板' }] }),
        ),
        null,
    );
    assert.equal(findUnsupportedContentNotice(textResult('plain text')), null);
    // supported 键存在但非 false（行数据里恰好带 supported 字段）不算
    assert.equal(
        findUnsupportedContentNotice(textResult({ supported: true })),
        null,
    );
    // supported:false 但没有 error/hint 文案（不像部署不支持提示）不算
    assert.equal(
        findUnsupportedContentNotice(textResult({ supported: false })),
        null,
    );
});

/* ------------------------------------------------------------------ */
/* runVerifiedCommand（注入假 client，不联网）                          */
/* ------------------------------------------------------------------ */

const baseOptions: GlobalOptions = {
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
};

const makeCtx = (overrides: Partial<GlobalOptions> = {}): CommandContext => ({
    options: { ...baseOptions, ...overrides },
    site: {
        name: 'test-site',
        mcpUrl: 'https://mcp.invalid.test/api/v1/mcp',
        authMode: 'oauth',
        authHeader: 'authorization',
    },
    credentials: null,
    format: 'json',
    startedAt: performance.now(),
});

type FakeClient = { client: McpClient; calls: ToolCall[]; closeCount: () => number };

const makeFakeClient = (result: ToolResult): FakeClient => {
    const calls: ToolCall[] = [];
    let closes = 0;
    const client: McpClient = {
        listTools: async () => [],
        callTool: async (call: ToolCall) => {
            calls.push(call);
            return result;
        },
        close: async () => {
            closes += 1;
        },
    };
    return { client, calls, closeCount: () => closes };
};

/** 同时捕获 stdout / stderr（tee，不吞掉 node:test 自身的事件流） */
const captureStreams = async (
    fn: () => Promise<void>,
): Promise<{ stdout: string; stderr: string }> => {
    const outChunks: string[] = [];
    const errChunks: string[] = [];
    const outOriginal = process.stdout.write.bind(process.stdout);
    const errOriginal = process.stderr.write.bind(process.stderr);
    const outWrite = ((chunk: unknown): boolean => {
        if (typeof chunk === 'string') outChunks.push(chunk);
        return outOriginal(chunk as Parameters<typeof outOriginal>[0]);
    }) as typeof process.stdout.write;
    const errWrite = ((chunk: unknown): boolean => {
        if (typeof chunk === 'string') errChunks.push(chunk);
        return errOriginal(chunk as Parameters<typeof errOriginal>[0]);
    }) as typeof process.stderr.write;
    process.stdout.write = outWrite;
    process.stderr.write = errWrite;
    try {
        await fn();
    } finally {
        process.stdout.write = outOriginal;
        process.stderr.write = errOriginal;
    }
    return { stdout: outChunks.join(''), stderr: errChunks.join('') };
};

test('runVerifiedCommand：unsupported 响应按成功返回（不抛错），stdout 原样 JSON + stderr 提示', async () => {
    const fake = makeFakeClient(textResult(UNSUPPORTED_PAYLOAD));
    const { stdout, stderr } = await captureStreams(() =>
        runVerifiedCommand(
            [{ tool: 'list_verified_content', args: {} }],
            makeCtx(),
            { createClient: async () => fake.client },
        ),
    );
    assert.equal(fake.calls.length, 1, '应恰好调用一次工具');
    assert.equal(fake.closeCount(), 1, '应关闭客户端');
    assert.deepEqual(JSON.parse(stdout), UNSUPPORTED_PAYLOAD);
    assert.ok(stderr.includes(VERIFIED_UNSUPPORTED_NOTICE), `stderr 应含提示：${stderr}`);
    assert.ok(stderr.includes('charts find'));
    assert.ok(stderr.includes('dashboards find'));
});

test('runVerifiedCommand：正常响应走常规渲染（writeResult 管道）', async () => {
    const fake = makeFakeClient(
        textResult({ results: [{ uuid: 'a', name: '品类洞察' }] }),
    );
    const { stdout } = await captureStreams(() =>
        runVerifiedCommand(
            [{ tool: 'list_verified_content', args: {} }],
            makeCtx(),
            { createClient: async () => fake.client },
        ),
    );
    assert.equal(fake.calls.length, 1);
    assert.ok(stdout.includes('品类洞察'), `stdout 应含结果：${stdout}`);
});

test('runVerifiedCommand：--dry-run 打印 {tool,args} 且不建连', async () => {
    const { stdout } = await captureStreams(() =>
        runVerifiedCommand(
            [{ tool: 'list_verified_content', args: { pageSize: 50 } }],
            makeCtx({ dryRun: true }),
            {
                createClient: async () => {
                    throw new Error('dry-run 不应创建客户端');
                },
            },
        ),
    );
    assert.deepEqual(JSON.parse(stdout), {
        tool: 'list_verified_content',
        args: { pageSize: 50 },
    });
});

test('runVerifiedCommand：401 且无凭证不重试，CliError 原样上抛（退 3）', async () => {
    const client: McpClient = {
        listTools: async () => [],
        callTool: async () => {
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: '未登录或凭证已失效',
            });
        },
        close: async () => undefined,
    };
    await assert.rejects(
        runVerifiedCommand(
            [{ tool: 'list_verified_content', args: {} }],
            makeCtx(), // credentials: null
            { createClient: async () => client },
        ),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'AUTH_REQUIRED');
            assert.equal(error.exitCode, 3);
            return true;
        },
    );
});

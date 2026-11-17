import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { ExitCode } from '../cli/exitCodes';
import type { McpClient, ToolCall, ToolResult } from '../types';
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

test('isError:true 且属于五类 dashboard_* → DASHBOARD_STRICT(4)', async () => {
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
            assert.equal(cliError.code, 'DASHBOARD_STRICT');
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

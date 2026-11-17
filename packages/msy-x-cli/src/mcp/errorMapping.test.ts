import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { getDashboardStrictStatuses } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import { mapMcpError, mapToolResultError } from './errorMapping';

const makeAbortError = (): Error => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
};

const makeCodeError = (code: string, message: string): Error => {
    const error = new Error(message);
    (error as Error & { code?: unknown }).code = code;
    return error;
};

test('CliError 原样返回（幂等）', () => {
    const original = mapMcpError(new Error('x'));
    assert.equal(mapMcpError(original), original);
});

test('401 / UnauthorizedError → AUTH_REQUIRED(3)', () => {
    const fromSdk = mapMcpError(new UnauthorizedError());
    assert.equal(fromSdk.code, 'AUTH_REQUIRED');
    assert.equal(fromSdk.exitCode, ExitCode.AUTH_REQUIRED);
    assert.ok(fromSdk.hint?.includes('auth login'));

    const fromHttp = mapMcpError(new StreamableHTTPError(401, 'Unauthorized'));
    assert.equal(fromHttp.code, 'AUTH_REQUIRED');
    assert.equal(fromHttp.exitCode, ExitCode.AUTH_REQUIRED);
});

test('403 → FORBIDDEN(4)', () => {
    const error = mapMcpError(new StreamableHTTPError(403, 'Forbidden'));
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.exitCode, ExitCode.FORBIDDEN);
});

test('五类 dashboard_* 工具结果 → DASHBOARD_STRICT(4)，文案用服务端的', () => {
    for (const status of getDashboardStrictStatuses()) {
        const error = mapToolResultError({
            content: [
                { type: 'text', text: JSON.stringify({ status, message: `服务端文案 ${status}`, hint: '服务端提示' }) },
            ],
            structuredContent: { status, message: `服务端文案 ${status}`, hint: '服务端提示' },
            isError: true,
        });
        assert.equal(error.code, 'DASHBOARD_STRICT', status);
        assert.equal(error.exitCode, ExitCode.FORBIDDEN, status);
        assert.equal(error.message, `服务端文案 ${status}`);
        assert.equal(error.hint, '服务端提示');
    }
});

test('dashboard_* 只有 content JSON、没有 structuredContent 时也能识别', () => {
    const error = mapToolResultError({
        content: [
            { type: 'text', text: JSON.stringify({ status: 'dashboard_selection_required', message: '请选择看板' }) },
        ],
        isError: true,
    });
    assert.equal(error.code, 'DASHBOARD_STRICT');
    assert.equal(error.exitCode, 4);
    assert.equal(error.message, '请选择看板');
});

test('McpError data 里带 dashboard status → DASHBOARD_STRICT(4)', () => {
    const error = mapMcpError(
        new McpError(-32603, 'Tool execution failed', {
            status: 'dashboard_not_found',
            message: '没有找到这个看板',
            hint: '下一步：先 dashboards find',
        }),
    );
    assert.equal(error.code, 'DASHBOARD_STRICT');
    assert.equal(error.exitCode, 4);
    assert.equal(error.message, '没有找到这个看板');
});

test('isError 无 dashboard status → SERVER_ERROR(5)，首条 text 作为 message', () => {
    const error = mapToolResultError({
        content: [
            { type: 'text', text: '查询失败：字段不存在' },
            { type: 'text', text: '第二条不该用' },
        ],
        isError: true,
    });
    assert.equal(error.code, 'SERVER_ERROR');
    assert.equal(error.exitCode, ExitCode.SERVER_ERROR);
    assert.equal(error.message, '查询失败：字段不存在');
});

test('isError 且无文本 → SERVER_ERROR(5) 带兜底文案', () => {
    const error = mapToolResultError({ content: [], isError: true });
    assert.equal(error.code, 'SERVER_ERROR');
    assert.equal(error.exitCode, 5);
    assert.ok(error.message.length > 0);
});

test('缺少 type 判别的服务端错误 → 5 且给出替代路径 hint', () => {
    const error = mapToolResultError({
        content: [
            {
                type: 'text',
                text: 'Invalid literal value, expected "run_metric_query"',
            },
        ],
        isError: true,
    });
    assert.equal(error.code, 'SERVER_ERROR');
    assert.equal(error.exitCode, ExitCode.SERVER_ERROR);
    assert.match(error.message, /Invalid literal value/);
    assert.ok(error.hint !== null);
    assert.match(error.hint ?? '', /msy-x query/);
});

test('普通服务端错误不带判别键 hint', () => {
    const error = mapToolResultError({
        content: [{ type: 'text', text: 'boom' }],
        isError: true,
    });
    assert.equal(error.hint, null);
});

test('5xx → SERVER_ERROR(5)', () => {
    for (const status of [500, 502, 503]) {
        const error = mapMcpError(new StreamableHTTPError(status, 'oops'));
        assert.equal(error.code, 'SERVER_ERROR', String(status));
        assert.equal(error.exitCode, ExitCode.SERVER_ERROR, String(status));
    }
});

test('JSON-RPC -32xxx → SERVER_ERROR(5)', () => {
    const error = mapMcpError(new McpError(-32603, 'boom'));
    assert.equal(error.code, 'SERVER_ERROR');
    assert.equal(error.exitCode, ExitCode.SERVER_ERROR);
    assert.match(error.message, /-32603/);
});

test('AbortError / 超时类错误 → NETWORK(6)', () => {
    const abort = mapMcpError(makeAbortError());
    assert.equal(abort.code, 'NETWORK');
    assert.equal(abort.exitCode, ExitCode.NETWORK);

    const requestTimeout = mapMcpError(
        new McpError(ErrorCode.RequestTimeout, 'Request timed out'),
    );
    assert.equal(requestTimeout.code, 'NETWORK');
    assert.equal(requestTimeout.exitCode, ExitCode.NETWORK);
});

test('ETIMEDOUT / ECONNREFUSED / ENOTFOUND / UND_ERR_* → NETWORK(6)', () => {
    for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'UND_ERR_SOCKET']) {
        const error = mapMcpError(makeCodeError(code, `fail ${code}`));
        assert.equal(error.code, 'NETWORK', code);
        assert.equal(error.exitCode, ExitCode.NETWORK, code);
    }
});

test('fetch 失败包在 cause 里也能识别为 NETWORK(6)', () => {
    const outer = makeCodeError('UND_ERR_CONNECT_TIMEOUT', 'fetch failed');
    const wrapped = new Error('fetch failed');
    (wrapped as Error & { cause?: unknown }).cause = makeCodeError(
        'ECONNREFUSED',
        'connect ECONNREFUSED 127.0.0.1:3333',
    );
    assert.equal(mapMcpError(outer).code, 'NETWORK');
    assert.equal(mapMcpError(wrapped).code, 'NETWORK');
});

test('未知异常 → SERVER_ERROR(5) 保留原始信息', () => {
    const error = mapMcpError(new Error('weird failure'));
    assert.equal(error.code, 'SERVER_ERROR');
    assert.equal(error.message, 'weird failure');
});

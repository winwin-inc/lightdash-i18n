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

test('D1：SDK transport 的普通 Error（message 带 HTTP 401）→ AUTH_REQUIRED(3)', () => {
    // SDK 1.17 streamableHttp.js:288 对非 2xx 抛普通 Error，只有 message 可用
    const error = mapMcpError(
        new Error('Error POSTing to endpoint (HTTP 401): Unauthorized'),
    );
    assert.equal(error.code, 'AUTH_REQUIRED');
    assert.equal(error.exitCode, ExitCode.AUTH_REQUIRED);
    assert.ok(error.hint?.includes('auth login'));
});

test('D1：message 带 HTTP 403（普通 Error）→ FORBIDDEN(4)', () => {
    const error = mapMcpError(
        new Error('Error POSTing to endpoint (HTTP 403): Forbidden'),
    );
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.exitCode, ExitCode.FORBIDDEN);
});

test('D1：message 带其它 4xx / 5xx → SERVER_ERROR(5)', () => {
    for (const status of [404, 500, 503]) {
        const error = mapMcpError(
            new Error(`Error POSTing to endpoint (HTTP ${status}): oops`),
        );
        assert.equal(error.code, 'SERVER_ERROR', String(status));
        assert.equal(error.exitCode, ExitCode.SERVER_ERROR, String(status));
    }
});

test('D1：数字字段优先于 message（StreamableHTTPError(401) 不受 message 干扰）', () => {
    const withBoth = new StreamableHTTPError(401, 'mentions HTTP 500 too');
    const error = mapMcpError(withBoth);
    assert.equal(error.code, 'AUTH_REQUIRED');
});

test('D1：TypeError fetch failed 且 cause 有 errno → NETWORK(6)', () => {
    const fetchFailed = new TypeError('fetch failed');
    (fetchFailed as Error & { cause?: unknown }).cause = {
        errno: -4078,
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
    };
    assert.equal(mapMcpError(fetchFailed).code, 'NETWORK');

    // cause 只有 errno、没有 code 字符串时也要能识别
    const errnoOnly = new TypeError('fetch failed');
    (errnoOnly as Error & { cause?: unknown }).cause = { errno: -111 };
    const mapped = mapMcpError(errnoOnly);
    assert.equal(mapped.code, 'NETWORK');
    assert.equal(mapped.exitCode, ExitCode.NETWORK);
});

test('403 → FORBIDDEN(4)', () => {
    const error = mapMcpError(new StreamableHTTPError(403, 'Forbidden'));
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.exitCode, ExitCode.FORBIDDEN);
});

test('D2：McpError 文本带权限语义 → FORBIDDEN(4)', () => {
    const error = mapMcpError(
        new McpError(-32603, 'You do not have access to this project'),
    );
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.exitCode, ExitCode.FORBIDDEN);
    assert.match(error.message, /do not have access/);
});

test('D2：McpError 文本 Forbidden / not authorized for / Missing required OAuth scope → FORBIDDEN(4)', () => {
    for (const message of [
        'Forbidden: MCP is not enabled for this project',
        'User is not authorized for this resource',
        'Missing required OAuth scope: mcp:read',
    ]) {
        const error = mapMcpError(new McpError(-32603, message));
        assert.equal(error.code, 'FORBIDDEN', message);
        assert.equal(error.exitCode, ExitCode.FORBIDDEN, message);
    }
});

test('D2：isError 首条 text 带权限语义 → FORBIDDEN(4)', () => {
    const error = mapToolResultError({
        content: [
            { type: 'text', text: 'You do not have permission to view this dashboard' },
        ],
        isError: true,
    });
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.exitCode, ExitCode.FORBIDDEN);
    assert.match(error.message, /You do not have permission to view this dashboard/);
});

/** backend requiredDashboardContext 的真实 payload 形状（selection_required） */
const SELECTION_PAYLOAD = {
    status: 'dashboard_selection_required',
    action: 'select_dashboard',
    message: '「cls_insight_list」关联了多个看板，请选一个后重试。',
    source: 'exploreName',
    exploreName: 'cls_insight_list',
    chartUuid: null,
    candidateCount: 2,
    candidates: [
        {
            dashboardUuid: '11111111-1111-4111-8111-111111111111',
            dashboardSlug: 'pinlei-weekly',
            dashboardName: '品类周报',
            dashboardUrl: 'https://x.brandct.com/projects/p/dashboards/11111111',
        },
        {
            dashboardUuid: '22222222-2222-4222-8222-222222222222',
            dashboardSlug: 'pinlei-monthly',
            dashboardName: '品类月报',
        },
    ],
    hint: '下一步：把选中看板的 dashboardUuid 传回来。',
};

test('D3/D4：五类 dashboard_* 工具结果 → code 原样用服务端 status，退 4，detail 透传', () => {
    for (const status of getDashboardStrictStatuses()) {
        const error = mapToolResultError({
            content: [
                { type: 'text', text: JSON.stringify({ status, message: `服务端文案 ${status}`, hint: '服务端提示' }) },
            ],
            structuredContent: { status, message: `服务端文案 ${status}`, hint: '服务端提示' },
            isError: true,
        });
        assert.equal(error.code, status, status);
        assert.equal(error.exitCode, ExitCode.FORBIDDEN, status);
        assert.equal(error.message, `服务端文案 ${status}`);
        assert.equal(error.hint, '服务端提示');
        // 只有 status/message/hint，无附加字段 → detail 为 null，toJSON 省略
        assert.equal(error.detail, null);
        assert.ok(!('detail' in error.toJSON().error), status);
    }
});

test('D4：selection_required 的 detail 携带 candidates，hint 拼候选并提示 --dashboard', () => {
    const error = mapToolResultError({
        content: [{ type: 'text', text: JSON.stringify(SELECTION_PAYLOAD) }],
        isError: true,
    });
    assert.equal(error.code, 'dashboard_selection_required');
    assert.equal(error.exitCode, 4);
    assert.equal(error.message, SELECTION_PAYLOAD.message);
    const detail = error.detail as {
        action: string;
        candidates: Array<{ dashboardUuid: string; dashboardName: string }>;
    };
    assert.equal(detail.action, 'select_dashboard');
    assert.equal(detail.candidates.length, 2);
    assert.equal(detail.candidates[0].dashboardUuid, '11111111-1111-4111-8111-111111111111');
    assert.equal(detail.candidates[0].dashboardName, '品类周报');
    // toJSON 输出 error.detail
    assert.deepEqual(error.toJSON().error.detail, detail);
    // hint 拼候选（uuid+名称）并提示 --dashboard
    assert.ok(error.hint?.includes('11111111-1111-4111-8111-111111111111 品类周报'), error.hint ?? '');
    assert.ok(error.hint?.includes('22222222-2222-4222-8222-222222222222 品类月报'), error.hint ?? '');
    assert.ok(error.hint?.includes('--dashboard'), error.hint ?? '');
});

test('D4：permission_required 的 hint 用服务端 contact，detail 携带 action/contact/dashboardUrl', () => {
    const error = mapToolResultError({
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    status: 'dashboard_permission_required',
                    action: 'request_dashboard_access',
                    message: '没有该看板的访问权限，本次查询已停止。',
                    dashboardUuid: '33333333-3333-4333-8333-333333333333',
                    dashboardUrl: 'https://x.brandct.com/projects/p/dashboards/33333333',
                    contact: '请联系客服开通看板访问权限。',
                    hint: '下一步：联系客服开通权限。',
                }),
            },
        ],
        isError: true,
    });
    assert.equal(error.code, 'dashboard_permission_required');
    assert.equal(error.exitCode, 4);
    assert.ok(error.hint?.includes('请联系客服开通看板访问权限。'), error.hint ?? '');
    const detail = error.detail as Record<string, unknown>;
    assert.equal(detail.action, 'request_dashboard_access');
    assert.equal(detail.contact, '请联系客服开通看板访问权限。');
    assert.equal(
        detail.dashboardUrl,
        'https://x.brandct.com/projects/p/dashboards/33333333',
    );
});

test('D4：permission_required 缺 contact 时保留服务端 hint（默认文案）', () => {
    const error = mapToolResultError({
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    status: 'dashboard_permission_required',
                    message: '没有该看板的访问权限。',
                    hint: '下一步：联系客服开通权限。',
                }),
            },
        ],
        isError: true,
    });
    assert.equal(error.hint, '下一步：联系客服开通权限。');
    assert.equal(error.detail, null);
});

test('dashboard_* 只有 content JSON、没有 structuredContent 时也能识别', () => {
    const error = mapToolResultError({
        content: [
            { type: 'text', text: JSON.stringify({ status: 'dashboard_selection_required', message: '请选择看板' }) },
        ],
        isError: true,
    });
    assert.equal(error.code, 'dashboard_selection_required');
    assert.equal(error.exitCode, 4);
    assert.equal(error.message, '请选择看板');
});

test('McpError data 里带 dashboard status → code 原样用服务端 status，退 4', () => {
    const error = mapMcpError(
        new McpError(-32603, 'Tool execution failed', {
            status: 'dashboard_not_found',
            message: '没有找到这个看板',
            hint: '下一步：先 dashboards find',
        }),
    );
    assert.equal(error.code, 'dashboard_not_found');
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

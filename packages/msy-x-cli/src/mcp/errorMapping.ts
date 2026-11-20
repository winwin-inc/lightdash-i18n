import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { CliError, getDashboardStrictStatuses } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import type { ToolResult } from '../types';

/**
 * MCP 层错误 → CliError 的唯一映射点（设计稿 §8）。
 *
 * - 401 / UnauthorizedError → AUTH_REQUIRED（3）
 * - 403 → FORBIDDEN（4）；工具内权限文案（Forbidden / do not have access 等）同样归 4
 * - 服务端 status 属于五类 `dashboard_*` → code 原样用服务端 status（退 4），
 *   detail 携带 action / candidates / contact / dashboardUrl / detail
 * - 其它 4xx / 5xx / JSON-RPC -32xxx → SERVER_ERROR（5）；RequestTimeout(-32001) 例外归 NETWORK
 * - AbortError / ETIMEDOUT / ECONNREFUSED / ENOTFOUND / UND_ERR_* / errno → NETWORK（6）
 *
 * 除此之外不做猜测：未知异常一律 SERVER_ERROR 并保留原始信息（cause）。
 */

const DASHBOARD_STATUSES = new Set<string>(getDashboardStrictStatuses());

const NETWORK_ERROR_CODES = new Set([
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ECONNRESET',
]);

const NETWORK_MESSAGE_PATTERN =
    /\b(ETIMEDOUT|ECONNREFUSED|ENOTFOUND|UND_ERR_[A-Z_]+)\b/;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const readNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const messageOf = (error: unknown): string | null => {
    if (isRecord(error)) {
        const message = readString(error.message);
        if (message !== null) return message;
    }
    if (typeof error === 'string') return error;
    return null;
};

const AUTH_HINT = '运行 msy-x auth login 重新登录';

/** SDK transport 对非 2xx 抛普通 Error，状态码只能从 message 里拆（如 `(HTTP 401): …`） */
const HTTP_STATUS_IN_MESSAGE = /\bHTTP (\d{3})\b/;

/** 工具内 / JSON-RPC 错误文本里的权限语义 → FORBIDDEN（设计稿 §8.2） */
const FORBIDDEN_MESSAGE_PATTERN =
    /Forbidden|do not have access|do not have permission|not authorized for|Missing required OAuth scope/i;

const authRequiredError = (error: unknown): CliError =>
    new CliError({
        code: 'AUTH_REQUIRED',
        message: '未登录或凭证已失效',
        hint: AUTH_HINT,
        cause: error,
    });

const forbiddenError = (error: unknown, message: string): CliError =>
    new CliError({
        code: 'FORBIDDEN',
        message: `没有权限执行该操作：${message}`,
        hint: '确认账号权限，或联系管理员开通',
        cause: error,
    });

/**
 * 从异常对象上找 HTTP 状态码：
 * 1. 数字字段（StreamableHTTPError.code / status / statusCode）优先；
 * 2. 字段没有时解析 message 里的 `HTTP <3位>`（SDK 1.17 streamableHttp 对
 *    非 2xx 抛的正是普通 `Error('Error POSTing to endpoint (HTTP 401): …')`）。
 */
const httpStatusOf = (error: unknown): number | null => {
    if (!isRecord(error)) return null;
    const fromField =
        readNumber(error.code) ??
        readNumber(error.status) ??
        readNumber(error.statusCode);
    if (fromField !== null) return fromField;
    const message = readString(error.message);
    if (message === null) return null;
    const match = HTTP_STATUS_IN_MESSAGE.exec(message);
    if (match === null) return null;
    const parsed = readNumber(Number(match[1]));
    if (parsed === null || parsed < 100 || parsed > 599) return null;
    return parsed;
};

/** 在嵌套结构里找带五类 status 的那层 payload（McpError.data、error.data 等） */
const findDashboardPayload = (
    value: unknown,
    depth = 0,
): UnknownRecord | null => {
    if (depth > 3 || !isRecord(value)) return null;
    if (typeof value.status === 'string' && DASHBOARD_STATUSES.has(value.status)) {
        return value;
    }
    for (const key of ['data', 'error']) {
        const found = findDashboardPayload(value[key], depth + 1);
        if (found !== null) return found;
    }
    return null;
};

/** 门控 detail 只携带服务端 payload 里实际存在的字段（§8.3：candidates / contact / dashboardUrl / action / detail） */
const DASHBOARD_DETAIL_KEYS = [
    'action',
    'candidates',
    'contact',
    'dashboardUrl',
    'detail',
] as const;

/** 候选看板 → `dashboardUuid 名称` 一行（对应 backend DashboardCandidate） */
const candidateLine = (candidate: unknown): string | null => {
    if (!isRecord(candidate)) return null;
    const uuid = readString(candidate.dashboardUuid);
    const name =
        readString(candidate.dashboardName) ??
        readString(candidate.dashboardSlug) ??
        '';
    if (uuid === null) return null;
    return `${uuid} ${name}`.trim();
};

/**
 * 门控 hint（§8.3）：
 * - `dashboard_selection_required`：服务端 hint 后拼候选看板（uuid+名称）并提示 `--dashboard`；
 * - `dashboard_permission_required`：带服务端 contact（缺失时保留服务端/默认文案）；
 * - 其余三类：原样用服务端 hint。
 */
const dashboardGateHint = (
    payload: UnknownRecord,
    status: string,
): string | null => {
    const serverHint = readString(payload.hint);
    if (status === 'dashboard_selection_required') {
        const lines: string[] = [];
        if (serverHint !== null) lines.push(serverHint);
        const candidates = Array.isArray(payload.candidates)
            ? payload.candidates
            : [];
        for (const candidate of candidates) {
            const line = candidateLine(candidate);
            if (line !== null) lines.push(`- ${line}`);
        }
        if (candidates.length > 0) {
            lines.push('重试时用 --dashboard <dashboardUuid> 从上面候选中指定一个');
        }
        return lines.length > 0 ? lines.join('\n') : null;
    }
    if (status === 'dashboard_permission_required') {
        const contact = readString(payload.contact);
        if (contact !== null) {
            return serverHint !== null
                ? `${serverHint}\n${contact}`
                : contact;
        }
        return serverHint ?? '确认账号权限，或联系管理员开通';
    }
    return serverHint;
};

/**
 * 五类门控 → CliError：code 原样用服务端 status（agent 按它分支），
 * exitCode 固定 4，detail 透传服务端附加字段（存在才带）。
 */
const dashboardGateError = (
    payload: UnknownRecord,
    cause: unknown,
): CliError => {
    const status = readString(payload.status) ?? 'dashboard_context_unavailable';
    const message = readString(payload.message) ?? status;
    const detail: Record<string, unknown> = {};
    for (const key of DASHBOARD_DETAIL_KEYS) {
        const value = payload[key];
        if (value !== undefined && value !== null) {
            detail[key] = value;
        }
    }
    return new CliError({
        code: status,
        message,
        hint: dashboardGateHint(payload, status),
        exitCode: ExitCode.FORBIDDEN,
        detail: Object.keys(detail).length > 0 ? detail : null,
        cause,
    });
};

const isNetworkErrorCode = (code: unknown): boolean =>
    typeof code === 'string' &&
    (NETWORK_ERROR_CODES.has(code) || code.startsWith('UND_ERR_'));

/** fetch 失败常把 errno / code 包在 cause 里，沿 cause 链找（含 TypeError('fetch failed')） */
const looksLikeNetworkError = (error: unknown, depth = 0): boolean => {
    if (depth > 4 || !isRecord(error)) return false;
    const name = readString(error.name);
    if (name === 'AbortError' || name === 'TimeoutError') return true;
    if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
        return true;
    }
    if (isNetworkErrorCode(error.code)) return true;
    // TypeError('fetch failed') 的 cause 常只有 errno 没有 code 字符串
    if (readNumber(error.errno) !== null) return true;
    const message = readString(error.message);
    if (message !== null && NETWORK_MESSAGE_PATTERN.test(message)) return true;
    // 仅有 'fetch failed'（cause 无 errno 时，如端口非法）也归网络层
    if (message === 'fetch failed') return true;
    if (isRecord(error.cause)) return looksLikeNetworkError(error.cause, depth + 1);
    return false;
};

const networkError = (error: unknown): CliError =>
    new CliError({
        code: 'NETWORK',
        message: `网络错误或连接失败：${messageOf(error) ?? '无法连接 MCP 服务'}`,
        hint: '检查网络与站点地址；慢查询可用 --timeout <ms> 调大超时',
        cause: error,
    });

/**
 * 把 MCP 调用抛出的任意异常归一为 CliError（幂等：CliError 原样返回）。
 */
export const mapMcpError = (error: unknown): CliError => {
    if (error instanceof CliError) return error;
    if (error instanceof UnauthorizedError) return authRequiredError(error);

    const status = httpStatusOf(error);
    if (status === 401) return authRequiredError(error);
    if (status === 403) {
        return forbiddenError(error, messageOf(error) ?? '403 Forbidden');
    }

    // 看板门控优先于 5xx / 网络判断：status 是服务端语义，更具体
    const source = error instanceof McpError ? error.data : error;
    const dashboardPayload =
        findDashboardPayload(source) ??
        (error instanceof McpError ? findDashboardPayload(error) : null);
    if (dashboardPayload !== null) {
        return dashboardGateError(dashboardPayload, error);
    }

    // 工具内权限错误经 MCP SDK 变成 McpError(-32603, "<message>")，
    // 名字已丢，只能按文案识别权限语义（Forbidden / do not have access 等）
    const message = messageOf(error);
    if (message !== null && FORBIDDEN_MESSAGE_PATTERN.test(message)) {
        return forbiddenError(error, message);
    }

    if (looksLikeNetworkError(error)) return networkError(error);

    if (status !== null && status >= 500 && status <= 599) {
        return new CliError({
            code: 'SERVER_ERROR',
            message: `服务端错误（HTTP ${status}）：${messageOf(error) ?? ''}`.trim(),
            hint: null,
            cause: error,
        });
    }

    // 其余（含 JSON-RPC -32xxx 与未知异常）→ SERVER_ERROR，保留原始信息
    return new CliError({
        code: 'SERVER_ERROR',
        message:
            error instanceof McpError
                ? `MCP error ${error.code}：${messageOf(error) ?? error.message}`
                : messageOf(error) ?? String(error),
        hint: null,
        cause: error,
    });
};

/** 解析 content 里的 JSON 文本块（structuredContent 缺失时的兜底） */
const parseTextPayloads = (content: ToolResult['content']): unknown[] => {
    const payloads: unknown[] = [];
    for (const block of content) {
        if (typeof block.text !== 'string') continue;
        try {
            payloads.push(JSON.parse(block.text));
        } catch {
            // 非 JSON 文本，跳过
        }
    }
    return payloads;
};

/**
 * 服务端把 `type` 判别键剥掉后，共享实现（`runRunMetricQuery` /
 * `runSearchFieldValues`）会二次 parse 失败。带该修复的镜像之前，
 * 这两个工具必然报这个错——给出可执行的替代路径，而不是裸 zod 文案。
 */
const MISSING_DISCRIMINATOR_RE =
    /Invalid literal value, expected "(run_metric_query|search_field_values)"/;

const missingDiscriminatorHint = (): string =>
    '服务端镜像缺少 MCP 判别键修复（需升级主站到包含该修复的版本）；' +
    '临时替代：取数改用 msy-x query（run_semantic_metric_query），' +
    '查维度取值改用 msy-x query --dimensions <fieldId>';

/**
 * 工具返回 `isError: true` 时的映射（此时调用本身成功，异常映射不适用）：
 * - structuredContent / content JSON 里带五类 `dashboard_*` status → code 原样用
 *   服务端 status（退 4），detail 携带服务端附加字段；
 * - 首条 text 是权限文案（Forbidden / do not have access 等）→ FORBIDDEN（4）；
 * - 服务端缺 `type` 判别键修复（见设计稿 §10.4）→ SERVER_ERROR（5）+ 可执行 hint；
 * - 其余 → SERVER_ERROR（5），首条 text 作为 message。
 */
export const mapToolResultError = (result: ToolResult): CliError => {
    const dashboardPayload =
        findDashboardPayload(result.structuredContent) ??
        parseTextPayloads(result.content)
            .map((payload) => findDashboardPayload(payload))
            .find((payload) => payload !== null) ??
        null;
    if (dashboardPayload !== null) {
        return dashboardGateError(dashboardPayload, result);
    }
    const firstText = result.content.find(
        (block) => typeof block.text === 'string',
    )?.text;
    if (typeof firstText === 'string' && FORBIDDEN_MESSAGE_PATTERN.test(firstText)) {
        return forbiddenError(result, firstText);
    }
    const missingDiscriminator =
        typeof firstText === 'string' &&
        MISSING_DISCRIMINATOR_RE.test(firstText);
    return new CliError({
        code: 'SERVER_ERROR',
        message: firstText ?? '工具执行失败（服务端返回 isError）',
        hint: missingDiscriminator ? missingDiscriminatorHint() : null,
        cause: result,
    });
};

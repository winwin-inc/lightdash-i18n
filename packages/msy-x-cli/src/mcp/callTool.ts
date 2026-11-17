import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { CliError } from '../cli/errors';
import { verboseLog } from '../lib/logger';
import { redact } from '../lib/redact';
import type { RowSource } from '../render/detect';
import { pickRows } from '../render/detect';
import type { McpClient, ToolCall, ToolResult } from '../types';
import { mapMcpError, mapToolResultError } from './errorMapping';

/**
 * 执行一次工具调用：整体超时 + isError 映射 + 异常归一（设计稿 §10.2 / §8）。
 *
 * 超时退 NETWORK(6)，hint 提示查询可能仍在服务端执行；`isError: true` 时
 * 五类 dashboard_* → DASHBOARD_STRICT(4)，其余 → SERVER_ERROR(5)。
 *
 * `--verbose` / `MSY_X_DEBUG=1`（D10）：调用前后在 stderr 打摘要
 * `→ <tool> <argsJson>` / `← <tool> ok rows=<n> <ms>ms source=<…>`（失败为
 * `← <tool> error <code> <ms>ms`）；verboseLog 自带开关，未开启时零成本。
 */

/** 兜底整体超时（SDK 内部 timeout 之外的保险丝，reject 到这里说明调用未在期限内返回） */
class OverallTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`工具调用超过 ${timeoutMs}ms 未返回`);
        this.name = 'OverallTimeoutError';
    }
}

const isTimeoutError = (error: unknown): boolean => {
    if (error instanceof OverallTimeoutError) return true;
    if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
        return true;
    }
    if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
        return true;
    }
    return false;
};

const withOverallTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new OverallTimeoutError(timeoutMs)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
};

/** 请求参数摘要上限：超出截断加省略号（凭证先过 redact，截断只影响展示） */
const ARGS_SUMMARY_MAX_LENGTH = 500;

/**
 * 请求参数摘要（--verbose 日志用，D10）：redact 后 JSON 序列化，
 * 超过 500 字符截断加 `…`。Authorization / token / PAT 绝不出现。
 */
export const summarizeArgs = (args: Record<string, unknown>): string => {
    const json = JSON.stringify(redact(args)) ?? '{}';
    return json.length > ARGS_SUMMARY_MAX_LENGTH
        ? `${json.slice(0, ARGS_SUMMARY_MAX_LENGTH)}…`
        : json;
};

/**
 * 响应摘要的渲染源与行数：复用 render/detect.pickRows（轻量纯函数）。
 * 解析抛错（如坏 CSV）时退化为 none / null——日志绝不能让已成功的调用
 * 失败，渲染层随后自会报 PARSE_ERROR。
 */
const responseSummary = (
    result: ToolResult,
): { source: RowSource; rows: number | null } => {
    try {
        const picked = pickRows(result);
        return {
            source: picked.source,
            rows: picked.rows === null ? null : picked.rows.length,
        };
    } catch {
        return { source: 'none', rows: null };
    }
};

export const executeToolCall = async (input: {
    client: McpClient;
    call: ToolCall;
    timeoutMs: number;
}): Promise<ToolResult> => {
    const { client, call, timeoutMs } = input;
    const startedAt = performance.now();
    const elapsedMs = (): number =>
        Math.max(0, Math.round(performance.now() - startedAt));
    verboseLog(`→ ${call.tool} ${summarizeArgs(call.args)}`);
    try {
        const result = await withOverallTimeout(
            client.callTool(call, { timeoutMs }),
            timeoutMs,
        );
        if (result.isError) {
            throw mapToolResultError(result);
        }
        const normalized: ToolResult = {
            ...result,
            content: Array.isArray(result.content) ? result.content : [],
        };
        const summary = responseSummary(normalized);
        verboseLog(
            `← ${call.tool} ok rows=${summary.rows} ${elapsedMs()}ms source=${summary.source}`,
        );
        return normalized;
    } catch (error) {
        let mapped: CliError;
        if (error instanceof CliError) {
            mapped = error;
        } else if (isTimeoutError(error)) {
            mapped = new CliError({
                code: 'NETWORK',
                message: `调用工具 ${call.tool} 超时（${timeoutMs}ms）`,
                hint: '查询可能仍在服务端执行；如需等待更久可用 --timeout <ms> 调大',
                cause: error,
            });
        } else {
            mapped = mapMcpError(error);
        }
        verboseLog(`← ${call.tool} error ${mapped.code} ${elapsedMs()}ms`);
        throw mapped;
    }
};

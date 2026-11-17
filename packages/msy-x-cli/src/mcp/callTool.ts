import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { CliError } from '../cli/errors';
import type { McpClient, ToolCall, ToolResult } from '../types';
import { mapMcpError, mapToolResultError } from './errorMapping';

/**
 * 执行一次工具调用：整体超时 + isError 映射 + 异常归一（设计稿 §10.2 / §8）。
 *
 * 超时退 NETWORK(6)，hint 提示查询可能仍在服务端执行；`isError: true` 时
 * 五类 dashboard_* → DASHBOARD_STRICT(4)，其余 → SERVER_ERROR(5)。
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

export const executeToolCall = async (input: {
    client: McpClient;
    call: ToolCall;
    timeoutMs: number;
}): Promise<ToolResult> => {
    const { client, call, timeoutMs } = input;
    try {
        const result = await withOverallTimeout(
            client.callTool(call, { timeoutMs }),
            timeoutMs,
        );
        if (result.isError) {
            throw mapToolResultError(result);
        }
        return {
            ...result,
            content: Array.isArray(result.content) ? result.content : [],
        };
    } catch (error) {
        if (error instanceof CliError) throw error;
        if (isTimeoutError(error)) {
            throw new CliError({
                code: 'NETWORK',
                message: `调用工具 ${call.tool} 超时（${timeoutMs}ms）`,
                hint: '查询可能仍在服务端执行；如需等待更久可用 --timeout <ms> 调大',
                cause: error,
            });
        }
        throw mapMcpError(error);
    }
};

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import {
    getHttpRequestMaskedKey,
    getHttpRequestUserEmail,
} from '../lib/requestContext';

export type ToolCallLogKind = 'tool-call' | 'core-tool';

const LOG_PREFIX: Record<ToolCallLogKind, string> = {
    'tool-call': '[ToolCall]',
    'core-tool': '[OfficialTool]',
};

/**
 * MCP SDK 的 `server.tool` 会对 `z.objectOutputType<Args>` 做深层推导，易触发 TS2589。
 * 这里用窄化后的 handler 类型注册，运行时仍由 SDK 用 Zod 校验入参。
 * 须使用四参数 tool(name, desc, params, cb)：勿传第五参 `{}` 作 annotations——SDK 将空对象判为 ZodRawShape，会把回调错位成非函数（cb is not a function）。
 */
export function registerToolTyped(
    server: McpServer,
    logKind: ToolCallLogKind,
    name: string,
    description: string,
    params: ZodRawShape,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
): void {
    const register = server.tool.bind(server) as (
        n: string,
        desc: string,
        schema: ZodRawShape,
        cb: (args: Record<string, unknown>) => Promise<CallToolResult>,
    ) => void;
    const prefix = LOG_PREFIX[logKind];
    const wrapped = async (
        args: Record<string, unknown>,
    ): Promise<CallToolResult> => {
        const userEmail = getHttpRequestUserEmail() ?? 'unknown';
        const maskedKey = getHttpRequestMaskedKey() ?? '***';
        process.stderr.write(
            `${prefix} ${name} | key: ${maskedKey} | ${userEmail}\n`,
        );
        return handler(args);
    };
    register(name, description, params, wrapped);
}

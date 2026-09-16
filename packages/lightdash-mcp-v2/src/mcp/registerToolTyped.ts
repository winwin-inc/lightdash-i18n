import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z, type ZodRawShape } from 'zod';
import {
    getHttpRequestMaskedKey,
    getHttpRequestUserEmail,
} from '../lib/requestContext';
import { writeStderrLog } from '../lib/stderrLog';

export type ToolCallLogKind = 'tool-call' | 'core-tool';

const LOG_PREFIX: Record<ToolCallLogKind, string> = {
    'tool-call': '[ToolCall]',
    'core-tool': '[OfficialTool]',
};

/**
 * 用 registerTool + z.object 包装，避免 Zod 深层推导触发 TS2589。
 */
export function registerToolTyped(
    server: McpServer,
    logKind: ToolCallLogKind,
    name: string,
    description: string,
    params: ZodRawShape,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
): void {
    const prefix = LOG_PREFIX[logKind];
    const wrapped = async (
        args: Record<string, unknown>,
    ): Promise<CallToolResult> => {
        const userEmail = getHttpRequestUserEmail() ?? 'unknown';
        const maskedKey = getHttpRequestMaskedKey() ?? '***';
        writeStderrLog(
            `${prefix} ${name} | key: ${maskedKey} | ${userEmail}`,
            'info',
        );
        return handler(args);
    };
    server.registerTool(
        name,
        {
            description,
            inputSchema: z.object(params),
        },
        wrapped as never,
    );
}

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CLI_VERSION } from '../lib/version';
import type {
    AuthCredentials,
    AuthHeader,
    McpClient,
    SiteProfile,
    ToolCall,
    ToolContentBlock,
    ToolResult,
} from '../types';
import { mapMcpError } from './errorMapping';

/**
 * Streamable HTTP MCP 客户端（v2 `/api/v1/mcp`，无状态、无 Mcp-Session-Id，
 * 见 docs/mcp/mcp-v2-guide.md §2.3 / §3.1）。
 *
 * - `Accept: application/json, text/event-stream` 由 SDK transport 自动携带；
 * - 鉴权头按 site.authHeader + credentials.mode 选择（见 buildAuthHeaders）；
 * - credentials 为 null 时不带鉴权头，让服务端返回 401 → mapMcpError → 退 3。
 */

/** 出站鉴权头选择（纯函数，供单测）：oauth 固定 Bearer，pat 才看 authHeader */
export const buildAuthHeaders = (input: {
    authHeader: AuthHeader;
    credentials: AuthCredentials | null;
}): Record<string, string> => {
    if (input.credentials === null) return {};
    if (input.credentials.mode === 'oauth') {
        return { Authorization: `Bearer ${input.credentials.accessToken}` };
    }
    return input.authHeader === 'x-api-key'
        ? { 'x-api-key': input.credentials.pat }
        : { Authorization: `ApiKey ${input.credentials.pat}` };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** MCP content 块 → ToolContentBlock（只保留 type + text，缺失时填 []） */
const normalizeContent = (content: unknown): ToolContentBlock[] => {
    if (!Array.isArray(content)) return [];
    return content.map((block) => {
        if (typeof block === 'string') {
            return { type: 'text', text: block };
        }
        if (!isRecord(block)) return { type: 'unknown' };
        return {
            type: typeof block.type === 'string' ? block.type : 'unknown',
            ...(typeof block.text === 'string' ? { text: block.text } : {}),
        };
    });
};

/** SDK 原始返回 → 契约层 ToolResult（content 缺失填 []） */
export const normalizeToolResult = (result: unknown): ToolResult => {
    const record = isRecord(result) ? result : {};
    return {
        ...(record.structuredContent !== undefined
            ? { structuredContent: record.structuredContent }
            : {}),
        content: normalizeContent(record.content),
        isError: record.isError === true,
    };
};

export const createMcpClient = async (input: {
    site: SiteProfile;
    credentials: AuthCredentials | null;
    timeoutMs: number;
}): Promise<McpClient> => {
    const { site, credentials, timeoutMs } = input;
    const headers = buildAuthHeaders({
        authHeader: site.authHeader,
        credentials,
    });
    const transport = new StreamableHTTPClientTransport(new URL(site.mcpUrl), {
        requestInit: { headers },
    });
    const client = new Client({ name: 'msy-x-cli', version: CLI_VERSION });
    try {
        // initialize 请求同样受 timeoutMs 约束（设计稿 §10.2）
        await client.connect(transport, { timeout: timeoutMs });
    } catch (error) {
        await transport.close().catch(() => undefined);
        throw mapMcpError(error);
    }
    return {
        // 透传：不做 v1 的 Mcp-Session-Id 逻辑；错误由调用方经 mapMcpError 归一
        listTools: async () => {
            const result = await client.listTools(undefined, {
                timeout: timeoutMs,
            });
            const tools = isRecord(result) && Array.isArray(result.tools)
                ? result.tools
                : [];
            return tools.map((tool) => {
                const record: Record<string, unknown> = isRecord(tool)
                    ? tool
                    : {};
                return {
                    name: typeof record.name === 'string' ? record.name : '',
                    description:
                        typeof record.description === 'string'
                            ? record.description
                            : null,
                    inputSchema: record.inputSchema,
                };
            });
        },
        callTool: async (call: ToolCall, options?: { timeoutMs?: number }) => {
            const result = await client.callTool(
                { name: call.tool, arguments: call.args },
                undefined,
                { timeout: options?.timeoutMs ?? timeoutMs },
            );
            return normalizeToolResult(result);
        },
        close: async () => {
            // Protocol.close() 会一并关闭 transport
            await client.close();
        },
    };
};

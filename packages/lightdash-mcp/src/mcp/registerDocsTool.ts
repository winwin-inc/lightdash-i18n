import { z } from 'zod';
import type { ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    getMcpDocsText,
    MCP_DOCS_TOPICS,
    type McpDocsTopic,
} from './mcpDocsContent';
import { registerToolTyped } from './registerToolTyped';

const getMcpDocsParams = {
    topic: z
        .enum(MCP_DOCS_TOPICS)
        .optional()
        .describe(
            '文档主题：overview | query_workflow | session_lifecycle | security；默认 overview',
        ),
} satisfies ZodRawShape;

export function registerDocsTool(server: McpServer): void {
    registerToolTyped(
        server,
        'core-tool',
        'get_mcp_docs',
        '返回 Lightdash MCP 内置精简使用说明（静态文本）。可选 topic：overview、query_workflow、session_lifecycle、security。不读本地文件、不访问远程 URL、不接受密钥。',
        getMcpDocsParams,
        async (args) => {
            const topic = (args.topic as McpDocsTopic | undefined) ?? 'overview';
            const text = getMcpDocsText(topic);
            return {
                content: [
                    {
                        type: 'text',
                        text,
                    },
                ],
            };
        },
    );
}

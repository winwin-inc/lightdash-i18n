import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { LIGHTDASH_ANALYST_PROMPT_STATIC } from './mcpAnalystPrompt';

/** 注册 lightdash-analyst 提示词。 */
export function registerAnalystPrompt(server: McpServer): void {
    server.registerPrompt(
        'lightdash-analyst',
        {
            title: 'Lightdash analyst',
            description:
                '面向通过 MCP 使用 Lightdash 的分析师说明（标准工具与本服务扩展工具）。',
            argsSchema: {},
        },
        async (): Promise<GetPromptResult> => {
            const text = LIGHTDASH_ANALYST_PROMPT_STATIC;
            return {
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text },
                    },
                ],
            };
        },
    );
}

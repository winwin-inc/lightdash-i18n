import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../config';
import { getMcpSession } from '../lib/mcpSessionStore';
import { getHttpRequestApiKey } from '../lib/requestContext';
import { LIGHTDASH_ANALYST_PROMPT_STATIC } from './mcpAnalystPrompt';

function resolveApiKeyForPrompt(
    config: LightdashMcpEnvConfig,
    fromArgs: string | undefined,
): string | null {
    const key = fromArgs ?? getHttpRequestApiKey() ?? config.apiKey;
    return key && key.length > 0 ? key : null;
}

/**
 * 注册 lightdash-analyst 提示词；若会话中有 set_agent 快照则附加到正文。
 */
export function registerAnalystPrompt(
    server: McpServer,
    config: LightdashMcpEnvConfig,
): void {
    server.registerPrompt(
        'lightdash-analyst',
        {
            title: 'Lightdash analyst',
            description:
                '面向通过 MCP 使用 Lightdash 的分析师说明（标准工具与本服务扩展工具）。',
            argsSchema: {
                apiKey: z
                    .string()
                    .optional()
                    .describe(
                        'Optional PAT; defaults from HTTP x-api-key or LIGHTDASH_API_KEY',
                    ),
            },
        },
        async (args: { apiKey?: string }): Promise<GetPromptResult> => {
            const apiKey = resolveApiKeyForPrompt(config, args.apiKey);
            const session = apiKey ? getMcpSession(apiKey) : null;
            const parts: string[] = [LIGHTDASH_ANALYST_PROMPT_STATIC];
            if (session?.agentSnapshot) {
                parts.push(
                    `\n\n## Current agent (from set_agent)\n\n\`\`\`json\n${JSON.stringify(
                        session.agentSnapshot,
                        null,
                        2,
                    )}\n\`\`\``,
                );
            }
            const text = parts.join('');
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

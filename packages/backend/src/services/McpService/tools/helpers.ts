// eslint-disable-next-line import/extensions
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Builds a MCP tool result with a single JSON encoded text block.
 */
export const jsonToolResult = (data: unknown): CallToolResult => ({
    content: [
        {
            type: 'text',
            text: JSON.stringify(data, null, 2),
        },
    ],
});

/**
 * Builds a MCP tool result with a single plain text block.
 */
export const textToolResult = (text: string): CallToolResult => ({
    content: [
        {
            type: 'text',
            text,
        },
    ],
});

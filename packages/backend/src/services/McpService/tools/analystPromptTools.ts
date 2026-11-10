import { z } from 'zod';
import {
    LIGHTDASH_ANALYST_PROMPT_NAME,
    LIGHTDASH_ANALYST_PROMPT_STATIC,
} from './analystPrompt';
import { McpToolRegistry } from './registry';

/**
 * Registers the analyst prompt, it gives MCP clients a ready to use system
 * prompt for querying Lightdash.
 */
export const registerAnalystPrompt = (registry: McpToolRegistry): void => {
    registry.registerPrompt(
        LIGHTDASH_ANALYST_PROMPT_NAME,
        {
            description:
                'Guidance for an agent that analyses data with Lightdash: which tools to use and in which order.',
            argsSchema: {
                projectUuid: z
                    .string()
                    .optional()
                    .describe(
                        'Optional project the agent should work on. The agent still has to select it with set_project. Prefer passing this explicitly over relying on the stored default.',
                    ),
            },
        },
        async (args) => {
            const projectUuid =
                args && typeof args.projectUuid === 'string'
                    ? args.projectUuid
                    : null;

            const text =
                projectUuid === null
                    ? LIGHTDASH_ANALYST_PROMPT_STATIC
                    : `${LIGHTDASH_ANALYST_PROMPT_STATIC}\n\nThe agent should start with project ${projectUuid}.`;

            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text,
                        },
                    },
                ],
            };
        },
    );
};

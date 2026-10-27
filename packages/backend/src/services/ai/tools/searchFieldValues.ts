import {
    toolSearchFieldValuesArgsSchema,
    toolSearchFieldValuesArgsSchemaTransformed,
    toolSearchFieldValuesOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
};

/**
 * Native implementation of the search field values tool.
 *
 * It is shared between the AI agent (through the AI SDK wrapper below) and
 * the MCP server, which calls it directly so that errors are not swallowed.
 */
export const runSearchFieldValues = async (
    { searchFieldValues }: Dependencies,
    toolArgs: unknown,
): Promise<string> => {
    const args = toolSearchFieldValuesArgsSchemaTransformed.parse(toolArgs);

    const results = await searchFieldValues(args);

    return serializeData(results, 'json');
};

export const getSearchFieldValues = ({ searchFieldValues }: Dependencies) =>
    tool({
        description: toolSearchFieldValuesArgsSchema.description,
        inputSchema: toolSearchFieldValuesArgsSchema,
        outputSchema: toolSearchFieldValuesOutputSchema,
        execute: async (toolArgs) => {
            try {
                return {
                    result: await runSearchFieldValues(
                        { searchFieldValues },
                        toolArgs,
                    ),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error searching field values.',
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });

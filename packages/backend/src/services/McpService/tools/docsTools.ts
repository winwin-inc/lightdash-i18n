import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { jsonToolResult, textToolResult } from './helpers';
import {
    findMcpDocsSections,
    MCP_DOCS_FULL_DOCUMENT,
    MCP_DOCS_TOPICS,
    toPlainText,
} from './mcpDocsContent';
import { McpToolRegistry } from './registry';

const docsArgsSchema = z.object({
    topic: z
        .string()
        .optional()
        .describe(
            `Optional topic filter (case insensitive). Returns the documentation sections that mention the topic plus the full documentation. Known topics: ${MCP_DOCS_TOPICS.join(
                ', ',
            )}.`,
        ),
    format: z
        .enum(['markdown', 'text'])
        .optional()
        .describe(
            'Output format of the documentation. Defaults to "markdown". Use "text" for a plain text version without markdown syntax.',
        ),
});

/**
 * Registers the tool that returns the built-in Lightdash MCP documentation.
 */
export const registerDocsTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.GET_MCP_DOCS,
        {
            description:
                'Get the Lightdash MCP documentation: how to connect to the Lightdash MCP server, how to browse content and run metric queries, and the list of the available MCP tools. Optionally pass a topic (for example overview, query_workflow, content_fields, request_lifecycle or security) to get the documentation sections that mention it together with the full documentation.',
            inputSchema: {
                topic: z
                    .string()
                    .optional()
                    .describe(
                        `Optional topic filter (case insensitive). Returns the documentation sections that mention the topic plus the full documentation. Known topics: ${MCP_DOCS_TOPICS.join(
                            ', ',
                        )}.`,
                    ),
                format: z
                    .enum(['markdown', 'text'])
                    .optional()
                    .describe(
                        'Output format of the documentation. Defaults to "markdown". Use "text" for a plain text version without markdown syntax.',
                    ),
            },
        },
        async (args, _context) => {
            const { topic, format } = docsArgsSchema.parse(args ?? {});
            const outputFormat = format ?? 'markdown';

            const formatDocumentation = (documentation: string): string =>
                outputFormat === 'text'
                    ? toPlainText(documentation)
                    : documentation;

            if (!topic) {
                return textToolResult(
                    formatDocumentation(MCP_DOCS_FULL_DOCUMENT),
                );
            }

            const { found, sections } = findMcpDocsSections(topic);

            const matchedDocumentation = sections
                .map((section) => section.body)
                .join('\n---\n\n');

            const header = found
                ? `Documentation sections mentioning "${topic}":`
                : `Topic "${topic}" was not found in the Lightdash MCP documentation. The full documentation is returned below.`;

            const documentation = [
                header,
                matchedDocumentation,
                '---',
                MCP_DOCS_FULL_DOCUMENT,
            ]
                .filter((part) => part.length > 0)
                .join('\n\n');

            return jsonToolResult({
                topic,
                found,
                documentation: formatDocumentation(documentation),
            });
        },
    );
};

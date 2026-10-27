import { z } from 'zod';
import { getFieldIdSchema } from './fieldId';
import sortFieldSchema from './sortField';

/**
 * Configuration of a table visualization, used by the metric query tools.
 *
 * It lives outside of the AI agent because it is shared with the MCP server,
 * which is not an enterprise feature.
 */
export const tableVizConfigSchema = z
    .object({
        exploreName: z
            .string()
            .describe(
                'The name of the explore containing the metrics and dimensions used for table query',
            ),
        metrics: z
            .array(getFieldIdSchema({ additionalDescription: null }))
            .describe(
                'The field ids of the metrics to be calculated for the table. They will be grouped by the dimensions.',
            ),
        dimensions: z
            .array(getFieldIdSchema({ additionalDescription: null }))
            .describe(
                'The field id for the dimensions to group the metrics by',
            ),
        sorts: z
            .array(sortFieldSchema)
            .describe(
                'Sort configuration for the query, it can use a combination of metrics and dimensions.',
            ),

        limit: z
            .number()
            .nullable()
            .describe('The maximum number of rows in the table.'),
    })
    .describe(
        'Configuration file for generating a table from a query with metrics and dimensions',
    );

export type TableVizConfigSchemaType = z.infer<typeof tableVizConfigSchema>;

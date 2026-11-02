import { z } from 'zod';
import { getFieldIdSchema } from './fieldId';

const sortFieldSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    descending: z
        .boolean()
        .describe(
            'If true sorts in descending order, if false sorts in ascending order',
        ),
    nullsFirst: z
        .boolean()
        .describe(
            'If true sorts nulls first, if false sorts nulls last, otherwise sorts by warehouse default',
        )
        .nullable(),
    valueOrder: z
        .array(z.string())
        .nullable()
        .optional()
        .transform((value) => value ?? undefined)
        .describe(
            'Custom order of values for a dimension. The array order is the expected order (from first to last). Only applies to dimensions - when empty or not set, values are sorted A-Z / Z-A',
        ),
});

export type ToolSortField = z.infer<typeof sortFieldSchema>;

export default sortFieldSchema;

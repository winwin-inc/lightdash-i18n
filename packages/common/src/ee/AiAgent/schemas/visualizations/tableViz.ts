import { type TableCalculation } from '../../../../types/field';
import type { Filters } from '../../../../types/filter';
import type { AiMetricQueryWithFilters } from '../../types';
import { getValidAiQueryLimit } from '../../validators';
import type { ToolTableVizArgsTransformed } from '../tools';
import { type TableVizConfigSchemaType } from '../../../../schemas/mcp/tableVizConfig';

export const metricQueryTableViz = ({
    vizConfig,
    filters,
    maxLimit,
    customMetrics,
    tableCalculations,
}: {
    vizConfig: TableVizConfigSchemaType;
    filters: Filters;
    maxLimit: number;
    customMetrics: ToolTableVizArgsTransformed['customMetrics'] | null;
    tableCalculations: TableCalculation[];
}): AiMetricQueryWithFilters => ({
    exploreName: vizConfig.exploreName,
    metrics: vizConfig.metrics,
    dimensions: vizConfig.dimensions || [],
    sorts: vizConfig.sorts.map((sort) => ({
        ...sort,
        nullsFirst: sort.nullsFirst ?? undefined,
    })),
    limit: getValidAiQueryLimit(vizConfig.limit, maxLimit),
    filters,
    additionalMetrics: customMetrics ?? [],
    tableCalculations,
});

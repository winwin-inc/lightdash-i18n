import { type MetricQuery } from '@lightdash/common';

export type ChartTablePagination = {
    pageIndex: number;
    pageSize: number;
};

/**
 * When warehouse table pagination is active, replace chart/explore limit
 * with the current page size and offset (same as chart execute path).
 */
export const applyChartTablePaginationToMetricQuery = (
    metricQuery: MetricQuery,
    pagination: ChartTablePagination | null | undefined,
): MetricQuery => {
    if (!pagination) {
        return metricQuery;
    }
    return {
        ...metricQuery,
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
    };
};

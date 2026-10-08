import { MAX_SAFE_INTEGER } from '../constants/sqlRunner';
import { type MetricQuery } from '../types/metricQuery';

/** Default page size when offset is set but request omits limit. */
const DEFAULT_WAREHOUSE_PAGE_SIZE = 500;

/**
 * Apply optional limit/offset overrides onto a metric query.
 *
 * When `offset` is set (warehouse table pagination), never keep the
 * chart/explore `metricQuery.limit`. That value is a one-shot row cap;
 * pagination must use the request page size only. Otherwise SQL can become
 * `LIMIT <chartLimit> OFFSET <pageOffset>` while COUNT (which clears limit)
 * still reports the full total — pages beyond the chart cap look empty.
 */
export const applyMetricQueryLimitOffset = (
    metricQuery: MetricQuery,
    limit: number | null | undefined,
    offset: number | undefined,
): MetricQuery => {
    if (offset !== undefined) {
        let pageLimit = DEFAULT_WAREHOUSE_PAGE_SIZE;
        if (limit === null) {
            pageLimit = MAX_SAFE_INTEGER;
        } else if (limit !== undefined) {
            pageLimit = limit;
        }
        return {
            ...metricQuery,
            limit: pageLimit,
            offset,
        };
    }

    if (limit !== undefined) {
        return {
            ...metricQuery,
            limit: limit ?? MAX_SAFE_INTEGER,
            offset: undefined,
        };
    }

    return metricQuery;
};

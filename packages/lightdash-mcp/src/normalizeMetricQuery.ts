import type { MetricQueryRequest } from '@lightdash/common';

/** 与 packages/backend QueryController v2 中 metric query 默认值对齐 */
export function normalizeMetricQueryRequest(
    raw: Record<string, unknown>,
): Omit<MetricQueryRequest, 'csvLimit'> {
    const exploreName = raw.exploreName;
    if (typeof exploreName !== 'string' || exploreName.length === 0) {
        throw new Error('query.exploreName must be a non-empty string');
    }

    const dimensions = Array.isArray(raw.dimensions)
        ? (raw.dimensions as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
    const metrics = Array.isArray(raw.metrics)
        ? (raw.metrics as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
    const filters =
        Array.isArray(raw.filters)
            ? (() => {
                  throw new Error(
                      'query.filters must be an object (not an array)',
                  );
              })()
            : raw.filters &&
        raw.filters &&
        typeof raw.filters === 'object' &&
        raw.filters !== null &&
        !Array.isArray(raw.filters)
            ? (raw.filters as MetricQueryRequest['filters'])
            : {};
    const sorts = Array.isArray(raw.sorts) ? raw.sorts : [];
    const limitRaw = raw.limit;
    const limit =
        typeof limitRaw === 'number' &&
        Number.isFinite(limitRaw) &&
        limitRaw > 0
            ? limitRaw
            : 500;
    const tableCalculations = Array.isArray(raw.tableCalculations)
        ? raw.tableCalculations
        : [];

    return {
        exploreName,
        dimensions,
        metrics,
        filters,
        sorts: sorts as MetricQueryRequest['sorts'],
        limit,
        tableCalculations: tableCalculations as MetricQueryRequest['tableCalculations'],
        additionalMetrics: raw.additionalMetrics as MetricQueryRequest['additionalMetrics'],
        customDimensions: raw.customDimensions as MetricQueryRequest['customDimensions'],
        dateZoom: raw.dateZoom as MetricQueryRequest['dateZoom'],
        metadata: raw.metadata as MetricQueryRequest['metadata'],
        timezone: raw.timezone as MetricQueryRequest['timezone'],
        metricOverrides: raw.metricOverrides as MetricQueryRequest['metricOverrides'],
    };
}

export function clampLimit(limit: number, maxLimit: number): number {
    return Math.min(Math.max(1, Math.floor(limit)), maxLimit);
}

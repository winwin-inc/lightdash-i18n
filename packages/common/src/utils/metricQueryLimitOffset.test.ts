import { MAX_SAFE_INTEGER } from '../constants/sqlRunner';
import { type MetricQuery } from '../types/metricQuery';
import { applyMetricQueryLimitOffset } from './metricQueryLimitOffset';

describe('applyMetricQueryLimitOffset', () => {
    const baseQuery = {
        exploreName: 'test',
        dimensions: ['dim'],
        metrics: ['met'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    } satisfies MetricQuery;

    it('when offset is set, ignores chart limit and uses request page size', () => {
        const result = applyMetricQueryLimitOffset(baseQuery, 10, 20);
        expect(result.limit).toBe(10);
        expect(result.offset).toBe(20);
    });

    it('when offset is set without limit, uses default page size not chart limit', () => {
        const result = applyMetricQueryLimitOffset(
            { ...baseQuery, limit: 50 },
            undefined,
            100,
        );
        expect(result.limit).toBe(500);
        expect(result.offset).toBe(100);
        expect(result.limit).not.toBe(50);
    });

    it('when offset is set and limit is null, uses MAX_SAFE_INTEGER', () => {
        const result = applyMetricQueryLimitOffset(baseQuery, null, 0);
        expect(result.limit).toBe(MAX_SAFE_INTEGER);
        expect(result.offset).toBe(0);
    });

    it('when only limit is set, overrides limit and clears offset', () => {
        const result = applyMetricQueryLimitOffset(
            { ...baseQuery, offset: 99 },
            25,
            undefined,
        );
        expect(result.limit).toBe(25);
        expect(result.offset).toBeUndefined();
    });

    it('when neither override is set, returns the original query', () => {
        const result = applyMetricQueryLimitOffset(
            baseQuery,
            undefined,
            undefined,
        );
        expect(result).toBe(baseQuery);
    });
});

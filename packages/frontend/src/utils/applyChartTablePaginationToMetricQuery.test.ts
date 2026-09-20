import { type MetricQuery } from '@lightdash/common';
import { applyChartTablePaginationToMetricQuery } from './applyChartTablePaginationToMetricQuery';

describe('applyChartTablePaginationToMetricQuery', () => {
    const baseQuery = {
        exploreName: 'orders',
        dimensions: ['orders_id'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    } satisfies MetricQuery;

    it('returns original query when pagination is null', () => {
        expect(
            applyChartTablePaginationToMetricQuery(baseQuery, null),
        ).toBe(baseQuery);
    });

    it('replaces limit with pageSize and sets offset for current page', () => {
        const result = applyChartTablePaginationToMetricQuery(baseQuery, {
            pageIndex: 4,
            pageSize: 500,
        });
        expect(result.limit).toBe(500);
        expect(result.offset).toBe(2000);
    });

    it('uses pageSize even when chart limit differs', () => {
        const result = applyChartTablePaginationToMetricQuery(
            { ...baseQuery, limit: 50 },
            { pageIndex: 0, pageSize: 100 },
        );
        expect(result.limit).toBe(100);
        expect(result.offset).toBe(0);
    });
});

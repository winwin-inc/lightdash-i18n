import { type CompiledTable } from '../types/explore';
import { CustomFormatType, MetricType } from '../types/field';
import { buildPopAdditionalMetric } from '../types/periodOverPeriodComparison';
import { TimeFrames } from '../types/timeFrames';
import { convertAdditionalMetric } from './additionalMetrics';

const baseTable: CompiledTable = {
    name: 'orders',
    label: 'Orders',
    database: 'db',
    schema: 'schema',
    sqlTable: 'orders',
    dimensions: {},
    metrics: {},
    lineageGraph: {},
} as unknown as CompiledTable;

describe('convertAdditionalMetric — PoP metadata', () => {
    it('preserves formatOptions and PoP fields when converting', () => {
        const baseMetric = {
            table: 'orders',
            name: 'total_revenue',
            label: 'Revenue',
            description: 'Total revenue',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            formatOptions: {
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
            },
        };

        const { additionalMetric: pop } = buildPopAdditionalMetric({
            metric: baseMetric,
            timeDimensionId: 'orders_order_date_week',
            granularity: TimeFrames.WEEK,
            periodOffset: 1,
        });

        expect(pop.formatOptions).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
        });

        const result = convertAdditionalMetric({
            additionalMetric: pop,
            table: baseTable,
        });

        expect(result.formatOptions).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
        });
        expect(result.generationType).toEqual('periodOverPeriod');
        expect(result.baseMetricId).toEqual('orders_total_revenue');
        expect(result.timeDimensionId).toEqual('orders_order_date_week');
        expect(result.granularity).toEqual(TimeFrames.WEEK);
        expect(result.periodOffset).toEqual(1);
    });
});

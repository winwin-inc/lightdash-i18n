import { CartesianSeriesType, type Series } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getExpectedSeriesMap,
    applyStackFromLayout,
} from './utils';
import type { InfiniteQueryResults } from '../useQueryResults';

const PIVOT_RESULTS = {
    rows: [
        {
            dim_month: { value: { raw: 'M1', formatted: 'M1' } },
            'metric_target.__baseline_merged__': {
                value: { raw: 100, formatted: '100%' },
            },
        },
    ],
    pivotDetails: {
        indexColumn: { reference: 'dim_month' },
        groupByColumns: [{ reference: 'pro_name' }],
        valuesColumns: [
            {
                referenceField: 'metric_target',
                pivotColumnName: 'metric_target.__baseline_merged__',
                aggregation: 'any',
                pivotValues: [
                    { referenceField: 'pro_name', value: '__lightdash_baseline_merged__' },
                ],
            },
        ],
    },
} as unknown as InfiniteQueryResults;

describe('getExpectedSeriesMap: 基准线合并系列', () => {
    it('基准线只生成一条合并系列（跳过逐 pivot 值条目）', () => {
        const seriesMap = getExpectedSeriesMap({
            defaultSmooth: undefined,
            defaultShowSymbol: undefined,
            defaultFilledSymbol: undefined,
            defaultCartesianType: CartesianSeriesType.LINE,
            defaultAreaStyle: undefined,
            isStacked: false,
            pivotKeys: ['pro_name'],
            resultsData: PIVOT_RESULTS,
            xField: 'dim_month',
            yFields: ['metric_target'],
            availableDimensions: ['dim_month'],
            itemsMap: undefined,
            baselineFieldIds: ['metric_target'],
        });

        const series = Object.values(seriesMap);
        expect(series).toHaveLength(1);
        expect(series[0].encode.yRef.field).toBe('metric_target');
        expect(series[0].encode.yRef.pivotValues?.every(
            (pv) => pv.value === '__lightdash_baseline_merged__',
        )).toBe(true);
    });

    it('无 baselineFieldIds 时逐 pivot 值条目照常生成（回归）', () => {
        const seriesMap = getExpectedSeriesMap({
            defaultSmooth: undefined,
            defaultShowSymbol: undefined,
            defaultFilledSymbol: undefined,
            defaultCartesianType: CartesianSeriesType.LINE,
            defaultAreaStyle: undefined,
            isStacked: false,
            pivotKeys: ['pro_name'],
            resultsData: PIVOT_RESULTS,
            xField: 'dim_month',
            yFields: ['metric_target'],
            availableDimensions: ['dim_month'],
            itemsMap: undefined,
        });

        expect(Object.values(seriesMap)).toHaveLength(1);
    });
});

describe('applyStackFromLayout: 基准线不参与堆叠', () => {
    const makeSeries = (field: string): Series => ({
        encode: { xRef: { field: 'dim_month' }, yRef: { field } },
        type: CartesianSeriesType.LINE,
    });

    it('堆叠开启时基准线系列不加 stack', () => {
        const result = applyStackFromLayout(
            [makeSeries('metric_actual'), makeSeries('metric_target')],
            {
                yField: ['metric_actual', 'metric_target'],
                stack: 'stack',
                baselineFieldIds: ['metric_target'],
            },
            ['pro_name'],
        );
        expect(result[0].stack).toBe('metric_actual');
        expect(result[1].stack).toBeUndefined();
    });

    it('堆叠关闭时基准线系列同样无 stack', () => {
        const result = applyStackFromLayout(
            [
                { ...makeSeries('metric_target'), stack: 'metric_target' },
            ],
            {
                yField: ['metric_target'],
                baselineFieldIds: ['metric_target'],
            },
            ['pro_name'],
        );
        expect(result[0].stack).toBeUndefined();
    });
});

import {
    CartesianSeriesType,
    getSeriesId,
    type CartesianChart,
    type ItemsMap,
    type Series,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { InfiniteQueryResults } from '../useQueryResults';
import { getPivotSeries } from '../echarts/useEchartsCartesianConfig';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from './utils';

vi.mock('./../../providers/TrackingProvider');

const BASELINE_MERGED_PIVOT_VALUE = '__lightdash_baseline_merged__';

/** 看板过滤器收窄后只剩「产品C」分组值的结果（legacy 客户端 pivot 路径） */
const DASHBOARD_FILTERED_RESULTS = {
    rows: [
        {
            dim_month: { value: { raw: 'M1', formatted: 'M1' } },
            pro_name: { value: { raw: '产品C', formatted: '产品C' } },
            metric_actual: { value: { raw: 30, formatted: '30' } },
        },
    ],
} as unknown as InfiniteQueryResults;

/** SQL pivot（pivotDetails）结果：基准线指标按产品展开成两列 */
const PIVOT_DETAILS_RESULTS = {
    rows: [
        {
            dim_month: { value: { raw: 'M1', formatted: 'M1' } },
            'metric_target.pro_name.产品A': {
                value: { raw: 100, formatted: '100' },
            },
            'metric_target.pro_name.产品B': {
                value: { raw: 100, formatted: '100' },
            },
        },
    ],
    pivotDetails: {
        indexColumn: { reference: 'dim_month' },
        groupByColumns: [{ reference: 'pro_name' }],
        valuesColumns: [
            {
                referenceField: 'metric_target',
                pivotColumnName: 'metric_target.pro_name.产品A',
                aggregation: 'any',
                pivotValues: [{ referenceField: 'pro_name', value: '产品A' }],
            },
            {
                referenceField: 'metric_target',
                pivotColumnName: 'metric_target.pro_name.产品B',
                aggregation: 'any',
                pivotValues: [{ referenceField: 'pro_name', value: '产品B' }],
            },
        ],
    },
} as unknown as InfiniteQueryResults;

const makePivotSeriesConfig = (
    field: string,
    pivotValue: string,
    extra: Partial<Series> = {},
): Series => ({
    encode: {
        xRef: { field: 'dim_month' },
        yRef: {
            field,
            pivotValues: [{ field: 'pro_name', value: pivotValue }],
        },
    },
    type: CartesianSeriesType.LINE,
    ...extra,
});

const getExpectedMap = (args: {
    resultsData: InfiniteQueryResults;
    yFields: string[];
    baselineFieldIds?: string[];
}) =>
    getExpectedSeriesMap({
        defaultSmooth: undefined,
        defaultShowSymbol: undefined,
        defaultFilledSymbol: undefined,
        defaultCartesianType: CartesianSeriesType.LINE,
        defaultAreaStyle: undefined,
        isStacked: false,
        pivotKeys: ['pro_name'],
        resultsData: args.resultsData,
        xField: 'dim_month',
        yFields: args.yFields,
        availableDimensions: ['dim_month', 'pro_name'],
        itemsMap: undefined,
        baselineFieldIds: args.baselineFieldIds,
    });

describe('mergeExistingAndExpectedSeries：看板链路用户属性不丢失', () => {
    it('看板过滤器产生新分组值时，重建系列继承 hideMetricName', () => {
        // 编辑页保存的系列：产品A/产品B，组级勾选了隐藏指标名
        const existingSeries = [
            makePivotSeriesConfig('metric_actual', '产品A', {
                hideMetricName: true,
            }),
            makePivotSeriesConfig('metric_actual', '产品B', {
                hideMetricName: true,
            }),
        ];
        // 看板查询（过滤后）只返回产品C
        const expectedSeriesMap = getExpectedMap({
            resultsData: DASHBOARD_FILTERED_RESULTS,
            yFields: ['metric_actual'],
        });

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const rebuilt = merged.find(
            (serie) => serie.encode.yRef.pivotValues?.[0]?.value === '产品C',
        );
        expect(rebuilt).toBeDefined();
        expect(rebuilt?.hideMetricName).toBe(true);
    });

    it('重建的非哨兵系列不继承逐值自定义 color（颜色是系列级意图）', () => {
        const existingSeries = [
            makePivotSeriesConfig('metric_actual', '产品A', {
                hideMetricName: true,
                color: '#ff0000',
            }),
        ];
        const expectedSeriesMap = getExpectedMap({
            resultsData: DASHBOARD_FILTERED_RESULTS,
            yFields: ['metric_actual'],
        });

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const rebuilt = merged.find(
            (serie) => serie.encode.yRef.pivotValues?.[0]?.value === '产品C',
        );
        expect(rebuilt?.hideMetricName).toBe(true);
        expect(rebuilt?.color).toBeUndefined();
    });

    it('基准线合并哨兵替换逐值存量系列时，携带 hideMetricName 与用户色', () => {
        // 合并特性上线前保存的基准线逐值系列（组级隐藏指标名 + 用户色）
        const existingSeries = [
            makePivotSeriesConfig('metric_target', '产品A', {
                hideMetricName: true,
                color: '#9a60b4',
            }),
            makePivotSeriesConfig('metric_target', '产品B', {
                hideMetricName: true,
                color: '#9a60b4',
            }),
        ];
        const expectedSeriesMap = getExpectedMap({
            resultsData: PIVOT_DETAILS_RESULTS,
            yFields: ['metric_target'],
            baselineFieldIds: ['metric_target'],
        });

        // expected 只剩哨兵系列
        expect(Object.keys(expectedSeriesMap)).toHaveLength(1);

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const sentinel = merged.find((serie) =>
            serie.encode.yRef.pivotValues?.every(
                (pv) => pv.value === BASELINE_MERGED_PIVOT_VALUE,
            ),
        );
        expect(sentinel).toBeDefined();
        expect(sentinel?.hideMetricName).toBe(true);
        expect(sentinel?.color).toBe('#9a60b4');
    });

    it('回归：id 匹配的存量系列原样保留（属性不被改写）', () => {
        const existingSeries = [
            makePivotSeriesConfig('metric_actual', '产品A', {
                hideMetricName: true,
                color: '#123456',
            }),
        ];
        const expectedSeriesMap = getExpectedMap({
            resultsData: {
                rows: [
                    {
                        dim_month: {
                            value: { raw: 'M1', formatted: 'M1' },
                        },
                        pro_name: {
                            value: { raw: '产品A', formatted: '产品A' },
                        },
                        metric_actual: {
                            value: { raw: 10, formatted: '10' },
                        },
                    },
                ],
            } as unknown as InfiniteQueryResults,
            yFields: ['metric_actual'],
        });

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const kept = merged.find(
            (serie) => getSeriesId(serie) === getSeriesId(existingSeries[0]),
        );
        expect(kept?.hideMetricName).toBe(true);
        expect(kept?.color).toBe('#123456');
    });

    it('渲染链路：重建系列经 getPivotSeries 后 displayName 不带指标名', () => {
        const existingSeries = [
            makePivotSeriesConfig('metric_actual', '产品A', {
                hideMetricName: true,
            }),
        ];
        const expectedSeriesMap = getExpectedMap({
            resultsData: DASHBOARD_FILTERED_RESULTS,
            yFields: ['metric_actual'],
        });
        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });
        const rebuilt = merged.find(
            (serie) => serie.encode.yRef.pivotValues?.[0]?.value === '产品C',
        );
        expect(rebuilt).toBeDefined();

        const echartSerie = getPivotSeries({
            series: rebuilt!,
            itemsMap: {} as ItemsMap,
            cartesianChart: {
                layout: {
                    xField: 'dim_month',
                    yField: ['metric_actual'],
                },
            } as unknown as CartesianChart,
            pivotReference: rebuilt!.encode.yRef,
            flipAxes: false,
            xFieldHash: 'dim_month',
            yFieldHash: 'metric_actual.pro_name.产品C',
        });

        expect(echartSerie.dimensions?.[1]?.displayName).toBe('产品C');
    });
});

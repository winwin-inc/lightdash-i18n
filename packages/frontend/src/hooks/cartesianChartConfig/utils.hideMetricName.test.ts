import {
    CartesianSeriesType,
    getSeriesId,
    type CartesianChart,
    type ItemsMap,
    type PivotReference,
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

    it('基准线合并哨兵替换逐值存量系列时，携带用户改名', () => {
        // 勾基准线前改过名：改名落在逐值系列上，哨兵重建时必须携带，
        // 否则看板重建后基准线名称回落为指标名
        const existingSeries = [
            makePivotSeriesConfig('metric_target', '产品A', {
                name: '门店数量基准',
            }),
            makePivotSeriesConfig('metric_target', '产品B'),
        ];
        const expectedSeriesMap = getExpectedMap({
            resultsData: PIVOT_DETAILS_RESULTS,
            yFields: ['metric_target'],
            baselineFieldIds: ['metric_target'],
        });

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const sentinel = merged.find((serie) =>
            serie.encode.yRef.pivotValues?.every(
                (pv) => pv.value === BASELINE_MERGED_PIVOT_VALUE,
            ),
        );
        expect(sentinel?.name).toBe('门店数量基准');
    });

    it('重建的非哨兵系列不继承逐值改名（改名是系列级意图）', () => {
        const existingSeries = [
            makePivotSeriesConfig('metric_actual', '产品A', {
                name: '产品A改名',
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
        expect(rebuilt?.name).toBeUndefined();
    });

    it('哨兵 id 漂移（pivot 维度变化）时，改名从哨兵残留而非逐值残留携带', () => {
        // 看板/重进场景：期望哨兵带两个 pivot 维度，存量哨兵只有一个（id 不同），
        // 走重建路径；改名存在存量哨兵上，且逐值残留排在数组前面 ——
        // donor 必须优先取哨兵残留，否则从无改名的逐值残留取属性，改名丢失
        const TWO_DIM_RESULTS = {
            rows: [
                {
                    dim_month: { value: { raw: 'M1', formatted: 'M1' } },
                    'metric_target.pro_name.region.产品A.华东': {
                        value: { raw: 100, formatted: '100' },
                    },
                },
            ],
            pivotDetails: {
                indexColumn: { reference: 'dim_month' },
                groupByColumns: [
                    { reference: 'pro_name' },
                    { reference: 'region' },
                ],
                valuesColumns: [
                    {
                        referenceField: 'metric_target',
                        pivotColumnName:
                            'metric_target.pro_name.region.产品A.华东',
                        aggregation: 'any',
                        pivotValues: [
                            { referenceField: 'pro_name', value: '产品A' },
                            { referenceField: 'region', value: '华东' },
                        ],
                    },
                ],
            },
        } as unknown as InfiniteQueryResults;

        const existingSeries = [
            makePivotSeriesConfig('metric_target', '产品A'),
            {
                ...makePivotSeriesConfig('metric_target', '产品B'),
                encode: {
                    xRef: { field: 'dim_month' },
                    yRef: {
                        field: 'metric_target',
                        pivotValues: [
                            {
                                field: 'pro_name',
                                value: BASELINE_MERGED_PIVOT_VALUE,
                            },
                        ],
                    },
                },
                name: '单店马力®APSM基准线',
            },
        ];
        const expectedSeriesMap = getExpectedMap({
            resultsData: TWO_DIM_RESULTS,
            yFields: ['metric_target'],
            baselineFieldIds: ['metric_target'],
        });

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const rebuilt = merged.find((serie) =>
            serie.encode.yRef.pivotValues?.every(
                (pv) =>
                    pv.value === BASELINE_MERGED_PIVOT_VALUE &&
                    serie.encode.yRef.pivotValues?.length === 2,
            ),
        );
        expect(rebuilt).toBeDefined();
        expect(rebuilt?.name).toBe('单店马力®APSM基准线');
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
            // 上面按 pivotValues[0].value === '产品C' 查找，pivotValues 必有值
            pivotReference: rebuilt!.encode.yRef as Required<PivotReference>,
            flipAxes: false,
            xFieldHash: 'dim_month',
            yFieldHash: 'metric_actual.pro_name.产品C',
        });

        expect(echartSerie.dimensions?.[1]?.displayName).toBe('产品C');
    });
});

describe('基准线改名：看板重建形态与编辑页不一致时不丢失', () => {
    const BASELINE_FIELD = 'numerical_market_rate_jizhun';
    const RENAMED = '数值铺市率基准线';

    /** 编辑页保存的真实形态：合并哨兵系列 + 用户改名 */
    const savedSentinel = (field: string): Series => ({
        encode: {
            xRef: { field: 'dim_month' },
            yRef: {
                field,
                pivotValues: [
                    { field: 'pro_name', value: BASELINE_MERGED_PIVOT_VALUE },
                ],
            },
        },
        type: CartesianSeriesType.LINE,
        name: RENAMED,
    });

    it('看板无 pivotDetails 且有 pivotKeys：合并哨兵系列保留改名', () => {
        // PIVOT_DETAILS_RESULTS 里的基准线指标是 metric_target
        const field = 'metric_target';
        const expectedSeriesMap = getExpectedMap({
            resultsData: PIVOT_DETAILS_RESULTS,
            yFields: [field],
            baselineFieldIds: [field],
        });

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: [savedSentinel(field)],
        });

        const sentinel = merged.find((serie) =>
            serie.encode.yRef.pivotValues?.every(
                (pv) => pv.value === BASELINE_MERGED_PIVOT_VALUE,
            ),
        );
        expect(sentinel?.name).toBe(RENAMED);
    });

    it('看板 pivot 维度丢失（重建为无 pivotValues 的简单系列）时改名仍从哨兵携带', () => {
        // 回归：此时 expected 不再是哨兵（yRef 无 pivotValues），按“只有
        // 哨兵替换才携带改名”的旧规则会丢失改名，看板 tooltip 回落原始指标名
        const expectedSeriesMap = getExpectedSeriesMap({
            defaultSmooth: undefined,
            defaultShowSymbol: undefined,
            defaultFilledSymbol: undefined,
            defaultCartesianType: CartesianSeriesType.LINE,
            defaultAreaStyle: undefined,
            isStacked: false,
            pivotKeys: [],
            resultsData: {
                rows: [
                    {
                        dim_month: { value: { raw: 'M1', formatted: 'M1' } },
                        [BASELINE_FIELD]: { value: { raw: 1, formatted: '1' } },
                    },
                ],
            } as unknown as InfiniteQueryResults,
            xField: 'dim_month',
            yFields: [BASELINE_FIELD],
            availableDimensions: ['dim_month'],
            itemsMap: undefined,
            baselineFieldIds: [BASELINE_FIELD],
        });

        const expected = Object.values(expectedSeriesMap)[0];
        expect(expected.encode.yRef.pivotValues).toBeUndefined();

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: [savedSentinel(BASELINE_FIELD)],
        });

        const rebuilt = merged.find(
            (serie) => serie.encode.yRef.field === BASELINE_FIELD,
        );
        expect(rebuilt?.name).toBe(RENAMED);
    });
});

import {
    CartesianSeriesType,
    type CartesianChart,
    type ItemsMap,
    type PivotValuesColumn,
    type Series,
} from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import { type InfiniteQueryResults } from '../useQueryResults';
import {
    getPivotedData,
    getPivotedDataFromPivotDetails,
    getBaselineMergedColumnKey,
    BASELINE_MERGED_PIVOT_VALUE,
    type RowKeyMap,
} from '../plottedData/getPlottedData';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from '../cartesianChartConfig/utils';
import {
    getEchartsSeries,
    getEchartsSeriesFromPivotedData,
    getEchartsSeriesLegendName,
    sortTooltipParamsByAxisValue,
    type EChartSeries,
} from './useEchartsCartesianConfig';

vi.mock('./../../providers/TrackingProvider');

/**
 * 基准线渲染形态矩阵（分支 fix/bugs，任务 p3）。
 *
 * 核心不变量：layout.baselineFieldIds 声明的指标，无论存量系列是「逐分组值」
 * （yRef.pivotValues 为真实值）还是「哨兵合并」（value=__lightdash_baseline_merged__），
 * 渲染层必须坍缩成一条读合并列（__baseline_merged__:<field>）的基准线，并携带
 * 用户属性（hideMetricName、color——color 取该 field 第一个非隐藏系列）。
 */

const METRIC_ACTUAL = 'metric_actual';
const METRIC_TARGET = 'metric_target';
const METRIC_TARGET_2 = 'metric_target2';
const DIM_MONTH = 'dim_month';
const DIM_PRODUCT = 'pro_name';

const itemsMap: ItemsMap = {};

const LINE = CartesianSeriesType.LINE;

const makePivotSerie = (
    field: string,
    pivotValue: unknown,
    extra: Partial<Series> = {},
): Series => ({
    type: LINE,
    yAxisIndex: 0,
    encode: {
        xRef: { field: DIM_MONTH },
        yRef: {
            field,
            pivotValues: [{ field: DIM_PRODUCT, value: pivotValue }],
        },
    },
    ...extra,
});

const makeSentinelSerie = (
    field: string,
    extra: Partial<Series> = {},
): Series => ({
    type: LINE,
    yAxisIndex: 0,
    encode: {
        xRef: { field: DIM_MONTH },
        yRef: {
            field,
            pivotValues: [
                { field: DIM_PRODUCT, value: BASELINE_MERGED_PIVOT_VALUE },
            ],
        },
    },
    ...extra,
});

const makeSimpleSerie = (
    field: string,
    extra: Partial<Series> = {},
): Series => ({
    type: LINE,
    yAxisIndex: 0,
    encode: {
        xRef: { field: DIM_MONTH },
        yRef: { field },
    },
    ...extra,
});

const makeCartesianChart = (
    series: Series[],
    layout: Partial<CartesianChart['layout']> = {},
): CartesianChart => ({
    layout: {
        xField: DIM_MONTH,
        yField: [METRIC_ACTUAL, METRIC_TARGET],
        ...layout,
    },
    eChartsConfig: { series },
    metadata: {},
});

/** pivotDetails 数据：metric_actual 两个分组值，metric_target 基准线两个分组值。 */
const makePivotDetailsResults = (
    withSecondBaseline: boolean,
): InfiniteQueryResults =>
    ({
        rows: [
            {
                [DIM_MONTH]: { value: { raw: 'M1', formatted: 'M1' } },
                [`${METRIC_ACTUAL}.${DIM_PRODUCT}.产品A`]: {
                    value: { raw: 10, formatted: '10' },
                },
                [`${METRIC_ACTUAL}.${DIM_PRODUCT}.产品B`]: {
                    value: { raw: 20, formatted: '20' },
                },
                [`${METRIC_TARGET}.${DIM_PRODUCT}.产品A`]: {
                    value: { raw: 100, formatted: '100' },
                },
                [`${METRIC_TARGET}.${DIM_PRODUCT}.产品B`]: {
                    value: { raw: 100, formatted: '100' },
                },
                ...(withSecondBaseline
                    ? {
                          [`${METRIC_TARGET_2}.${DIM_PRODUCT}.产品A`]: {
                              value: { raw: 50, formatted: '50' },
                          },
                          [`${METRIC_TARGET_2}.${DIM_PRODUCT}.产品B`]: {
                              value: { raw: 50, formatted: '50' },
                          },
                      }
                    : {}),
            },
        ],
        pivotDetails: {
            indexColumn: { reference: DIM_MONTH },
            groupByColumns: [{ reference: DIM_PRODUCT }],
            valuesColumns: [
                {
                    referenceField: METRIC_ACTUAL,
                    pivotColumnName: `${METRIC_ACTUAL}.${DIM_PRODUCT}.产品A`,
                    aggregation: 'any',
                    pivotValues: [
                        { referenceField: DIM_PRODUCT, value: '产品A' },
                    ],
                    columnIndex: 0,
                },
                {
                    referenceField: METRIC_ACTUAL,
                    pivotColumnName: `${METRIC_ACTUAL}.${DIM_PRODUCT}.产品B`,
                    aggregation: 'any',
                    pivotValues: [
                        { referenceField: DIM_PRODUCT, value: '产品B' },
                    ],
                    columnIndex: 1,
                },
                {
                    referenceField: METRIC_TARGET,
                    pivotColumnName: `${METRIC_TARGET}.${DIM_PRODUCT}.产品A`,
                    aggregation: 'any',
                    pivotValues: [
                        { referenceField: DIM_PRODUCT, value: '产品A' },
                    ],
                    columnIndex: 2,
                },
                {
                    referenceField: METRIC_TARGET,
                    pivotColumnName: `${METRIC_TARGET}.${DIM_PRODUCT}.产品B`,
                    aggregation: 'any',
                    pivotValues: [
                        { referenceField: DIM_PRODUCT, value: '产品B' },
                    ],
                    columnIndex: 3,
                },
                ...(withSecondBaseline
                    ? [
                          {
                              referenceField: METRIC_TARGET_2,
                              pivotColumnName: `${METRIC_TARGET_2}.${DIM_PRODUCT}.产品A`,
                              aggregation: 'any',
                              pivotValues: [
                                  {
                                      referenceField: DIM_PRODUCT,
                                      value: '产品A',
                                  },
                              ],
                              columnIndex: 4,
                          },
                          {
                              referenceField: METRIC_TARGET_2,
                              pivotColumnName: `${METRIC_TARGET_2}.${DIM_PRODUCT}.产品B`,
                              aggregation: 'any',
                              pivotValues: [
                                  {
                                      referenceField: DIM_PRODUCT,
                                      value: '产品B',
                                  },
                              ],
                              columnIndex: 5,
                          },
                      ]
                    : []),
            ],
        },
    }) as unknown as InfiniteQueryResults;

/** legacy（前端 pivot）数据：长表行。 */
const makeLegacyRows = () => [
    {
        [DIM_MONTH]: { value: { raw: 'M1', formatted: 'M1' } },
        [DIM_PRODUCT]: { value: { raw: '产品A', formatted: '产品A' } },
        [METRIC_ACTUAL]: { value: { raw: 10, formatted: '10' } },
        [METRIC_TARGET]: { value: { raw: 100, formatted: '100' } },
        [METRIC_TARGET_2]: { value: { raw: 50, formatted: '50' } },
    },
    {
        [DIM_MONTH]: { value: { raw: 'M1', formatted: 'M1' } },
        [DIM_PRODUCT]: { value: { raw: '产品B', formatted: '产品B' } },
        [METRIC_ACTUAL]: { value: { raw: 20, formatted: '20' } },
        [METRIC_TARGET]: { value: { raw: 100, formatted: '100' } },
        [METRIC_TARGET_2]: { value: { raw: 50, formatted: '50' } },
    },
];

const getLegacyRowKeyMap = (baselineFieldIds: string[]): RowKeyMap =>
    getPivotedData(
        makeLegacyRows(),
        [DIM_PRODUCT],
        [METRIC_ACTUAL, ...baselineFieldIds],
        [DIM_MONTH],
        baselineFieldIds,
    ).rowKeyMap;

const pivotValuesColumnsMapFromResults = (
    results: InfiniteQueryResults,
): Record<string, PivotValuesColumn> =>
    Object.fromEntries(
        results.pivotDetails!.valuesColumns.map((column) => [
            column.pivotColumnName,
            column,
        ]),
    );

const baselineSeriesOf = (series: EChartSeries[]): EChartSeries[] =>
    series.filter((serie) => serie.isBaseline === true);

const nonBaselineSeriesOf = (series: EChartSeries[]): EChartSeries[] =>
    series.filter((serie) => serie.isBaseline !== true);

describe('A. pivotDetails 路径 × 保存形态', () => {
    test('A.1 存量为逐值系列：坍缩为一条读合并列的基准线，携带用户属性', () => {
        const results = makePivotDetailsResults(false);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(
            results,
            undefined,
            [METRIC_TARGET],
        );
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_ACTUAL, '产品B'),
                makePivotSerie(METRIC_TARGET, '产品A', {
                    hideMetricName: true,
                    color: '#123456',
                }),
                makePivotSerie(METRIC_TARGET, '产品B', {
                    color: '#abcdef',
                }),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.y).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
        expect(baselines[0].encode?.x).toBe(DIM_MONTH);
        // 用户属性：hideMetricName + color（第一个非隐藏系列的颜色）
        expect(baselines[0].hideMetricName).toBe(true);
        expect(baselines[0].color).toBe('#123456');
        // 基准线样式覆盖
        expect(baselines[0].lineStyle).toEqual({ width: 3, type: 'solid' });
        expect(baselines[0].z).toBe(4);
        // 非基准线指标不受影响：仍逐分组值渲染
        const normal = nonBaselineSeriesOf(series);
        expect(normal).toHaveLength(2);
        expect(normal.map((s) => s.encode?.y).sort()).toEqual(
            [
                `${METRIC_ACTUAL}.${DIM_PRODUCT}.产品A`,
                `${METRIC_ACTUAL}.${DIM_PRODUCT}.产品B`,
            ].sort(),
        );
    });

    test('A.2 存量为哨兵系列：即使 pivotValuesColumnsMap 缺少注入的合并列也读合并列', () => {
        const results = makePivotDetailsResults(false);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(
            results,
            undefined,
            [METRIC_TARGET],
        );
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makeSentinelSerie(METRIC_TARGET, {
                    hideMetricName: true,
                    color: '#123456',
                }),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        // 故意不注入合并列（hook 里 pivotValuesColumnsMap 的注入是另一层防御）
        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.y).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
        expect(baselines[0].color).toBe('#123456');
        expect(baselines[0].hideMetricName).toBe(true);
        // 哨兵系列名 = 指标名本身
        expect(getEchartsSeriesLegendName(baselines[0])).toBe(
            'Metric target',
        );
    });
});

describe('A. legacy（前端 pivot）路径 × 保存形态', () => {
    test('A.3 存量为哨兵系列：encode 指向合并列而非哨兵 hash（空系列根因）', () => {
        const rowKeyMap = getLegacyRowKeyMap([METRIC_TARGET]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_ACTUAL, '产品B'),
                makeSentinelSerie(METRIC_TARGET, {
                    hideMetricName: true,
                    color: '#123456',
                }),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeries(
            itemsMap,
            chart,
            [DIM_PRODUCT],
            rowKeyMap,
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.y).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
        expect(baselines[0].encode?.x).toBe(DIM_MONTH);
        expect(baselines[0].color).toBe('#123456');
        expect(baselines[0].hideMetricName).toBe(true);
        expect(nonBaselineSeriesOf(series)).toHaveLength(2);
    });

    test('A.4 存量为逐值系列：坍缩为一条读合并列的基准线', () => {
        const rowKeyMap = getLegacyRowKeyMap([METRIC_TARGET]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品A', {
                    hideMetricName: true,
                    color: '#111111',
                }),
                makePivotSerie(METRIC_TARGET, '产品B'),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeries(
            itemsMap,
            chart,
            [DIM_PRODUCT],
            rowKeyMap,
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.y).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
        expect(baselines[0].color).toBe('#111111');
        expect(baselines[0].hideMetricName).toBe(true);
        expect(nonBaselineSeriesOf(series)).toHaveLength(1);
    });

    test('A.4b 该 field 全部系列被隐藏时不渲染基准线；隐藏系列不捐色', () => {
        const rowKeyMap = getLegacyRowKeyMap([METRIC_TARGET]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品A', {
                    hidden: true,
                    color: '#111111',
                }),
                makePivotSerie(METRIC_TARGET, '产品B', { hidden: true }),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeries(
            itemsMap,
            chart,
            [DIM_PRODUCT],
            rowKeyMap,
        );

        expect(baselineSeriesOf(series)).toHaveLength(0);
        expect(nonBaselineSeriesOf(series)).toHaveLength(1);
    });

    test('A.4c 首系列隐藏时颜色取第一个非隐藏系列', () => {
        const rowKeyMap = getLegacyRowKeyMap([METRIC_TARGET]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_TARGET, '产品A', {
                    hidden: true,
                    color: '#hidden',
                }),
                makePivotSerie(METRIC_TARGET, '产品B', { color: '#visible' }),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeries(
            itemsMap,
            chart,
            [DIM_PRODUCT],
            rowKeyMap,
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].color).toBe('#visible');
    });
});

describe('B. 无透视 + 单/多基准线（getSimpleSeries 路径）', () => {
    test('多基准线各自独立渲染，读各自字段列并带基准线覆盖', () => {
        const chart = makeCartesianChart(
            [
                makeSimpleSerie(METRIC_ACTUAL),
                makeSimpleSerie(METRIC_TARGET, { color: '#123456' }),
                makeSimpleSerie(METRIC_TARGET_2),
            ],
            {
                yField: [METRIC_ACTUAL, METRIC_TARGET, METRIC_TARGET_2],
                baselineFieldIds: [METRIC_TARGET, METRIC_TARGET_2],
            },
        );

        const series = getEchartsSeries(itemsMap, chart, undefined, {});

        expect(series).toHaveLength(3);
        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(2);
        expect(baselines.map((s) => s.encode?.y).sort()).toEqual(
            [METRIC_TARGET, METRIC_TARGET_2].sort(),
        );
        expect(baselines[0].z).toBe(4);
        expect(
            baselines.find((s) => s.encode?.y === METRIC_TARGET)?.color,
        ).toBe('#123456');
        // 普通指标不受影响
        expect(nonBaselineSeriesOf(series)[0].encode?.y).toBe(METRIC_ACTUAL);
        expect(nonBaselineSeriesOf(series)[0].isBaseline).toBeUndefined();
    });
});

describe('C. flipAxes=true 的透视图', () => {
    test('pivotDetails：基准线 encode.x 指向合并列，encode.y 为分类轴', () => {
        const results = makePivotDetailsResults(false);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(
            results,
            undefined,
            [METRIC_TARGET],
        );
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品A', { color: '#123456' }),
                makePivotSerie(METRIC_TARGET, '产品B'),
            ],
            { baselineFieldIds: [METRIC_TARGET], flipAxes: true },
        );

        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.x).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
        expect(baselines[0].encode?.y).toBe(DIM_MONTH);
        expect(baselines[0].color).toBe('#123456');
    });

    test('legacy：基准线 encode.x 指向合并列', () => {
        const rowKeyMap = getLegacyRowKeyMap([METRIC_TARGET]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品B'),
            ],
            { baselineFieldIds: [METRIC_TARGET], flipAxes: true },
        );

        const series = getEchartsSeries(
            itemsMap,
            chart,
            [DIM_PRODUCT],
            rowKeyMap,
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.x).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
    });
});

describe('D. 多个基准线指标 + 普通指标混合', () => {
    test('pivotDetails：两条基准线各自读各自合并列，颜色互不串扰', () => {
        const results = makePivotDetailsResults(true);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(results, undefined, [
            METRIC_TARGET,
            METRIC_TARGET_2,
        ]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_ACTUAL, '产品B'),
                makePivotSerie(METRIC_TARGET, '产品A', { color: '#target1' }),
                makePivotSerie(METRIC_TARGET, '产品B'),
                makePivotSerie(METRIC_TARGET_2, '产品A', {
                    color: '#target2',
                }),
                makePivotSerie(METRIC_TARGET_2, '产品B'),
            ],
            {
                yField: [METRIC_ACTUAL, METRIC_TARGET, METRIC_TARGET_2],
                baselineFieldIds: [METRIC_TARGET, METRIC_TARGET_2],
            },
        );

        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(2);
        const target1 = baselines.find(
            (s) => s.encode?.y === getBaselineMergedColumnKey(METRIC_TARGET),
        );
        const target2 = baselines.find(
            (s) => s.encode?.y === getBaselineMergedColumnKey(METRIC_TARGET_2),
        );
        expect(target1).toBeDefined();
        expect(target2).toBeDefined();
        expect(target1?.color).toBe('#target1');
        expect(target2?.color).toBe('#target2');
        // 普通指标逐分组值渲染不受影响
        expect(nonBaselineSeriesOf(series)).toHaveLength(2);
    });

    test('legacy：两条基准线各自读各自合并列', () => {
        const rowKeyMap = getLegacyRowKeyMap([METRIC_TARGET, METRIC_TARGET_2]);
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品A', { color: '#target1' }),
                makePivotSerie(METRIC_TARGET_2, '产品A', {
                    color: '#target2',
                }),
            ],
            {
                yField: [METRIC_ACTUAL, METRIC_TARGET, METRIC_TARGET_2],
                baselineFieldIds: [METRIC_TARGET, METRIC_TARGET_2],
            },
        );

        const series = getEchartsSeries(
            itemsMap,
            chart,
            [DIM_PRODUCT],
            rowKeyMap,
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(2);
        expect(
            baselines.map((s) => s.encode?.y).sort(),
        ).toEqual(
            [
                getBaselineMergedColumnKey(METRIC_TARGET),
                getBaselineMergedColumnKey(METRIC_TARGET_2),
            ].sort(),
        );
    });
});

describe('E. 编辑页（重建链路）与看板（仅渲染链路）', () => {
    test('编辑页重建：mergeExistingAndExpectedSeries 产出的哨兵系列渲染为一条基准线，逐值存量被丢弃', () => {
        const results = makePivotDetailsResults(false);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(
            results,
            undefined,
            [METRIC_TARGET],
        );
        // 存量：逐值系列（保存形态 A.1）
        const existingSeries = [
            makePivotSerie(METRIC_ACTUAL, '产品A'),
            makePivotSerie(METRIC_ACTUAL, '产品B'),
            makePivotSerie(METRIC_TARGET, '产品A', {
                hideMetricName: true,
                color: '#123456',
            }),
            makePivotSerie(METRIC_TARGET, '产品B'),
        ];
        // 重建产物：getExpectedSeriesMap + merge（编辑页/看板重建链路的真实逻辑）
        const expectedSeriesMap = getExpectedSeriesMap({
            defaultSmooth: undefined,
            defaultShowSymbol: undefined,
            defaultFilledSymbol: undefined,
            defaultCartesianType: LINE,
            defaultAreaStyle: undefined,
            isStacked: false,
            pivotKeys: [DIM_PRODUCT],
            resultsData: results,
            xField: DIM_MONTH,
            yFields: [METRIC_ACTUAL, METRIC_TARGET],
            availableDimensions: [DIM_MONTH],
            itemsMap: undefined,
            baselineFieldIds: [METRIC_TARGET],
        });
        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
        });

        const chart = makeCartesianChart(merged, {
            baselineFieldIds: [METRIC_TARGET],
        });
        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(baselines[0].encode?.y).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
        expect(baselines[0].hideMetricName).toBe(true);
        expect(baselines[0].color).toBe('#123456');
        expect(nonBaselineSeriesOf(series)).toHaveLength(2);
    });

    test('哨兵系列上的改名优先于遗留逐值系列（看板改名不回落指标名）', () => {
        // 编辑页改过名后保存的真实形态：逐值存量仍在（仅存时被标 isFilteredOut，
        // 保存时剥离标记）+ 哨兵携带用户改名。渲染层 donor 必须取哨兵，
        // 否则看板/编辑页的基准线名称回落为指标名（用户反馈：改名只在编辑页生效）。
        const results = makePivotDetailsResults(false);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(
            results,
            undefined,
            [METRIC_TARGET],
        );
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_ACTUAL, '产品B'),
                makePivotSerie(METRIC_TARGET, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品B'),
                makeSentinelSerie(METRIC_TARGET, { name: '门店数量基准' }),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        const baselines = baselineSeriesOf(series);
        expect(baselines).toHaveLength(1);
        expect(getEchartsSeriesLegendName(baselines[0])).toBe('门店数量基准');
    });

    test('看板不重建（hasFetchedAllRows=false）：渲染层独立坍缩（等价 A.1 输入直渲染）', () => {
        // 与 A.1 相同输入，不经过 merge 重建 —— 渲染层必须独立正确
        const results = makePivotDetailsResults(false);
        const { rowKeyMap } = getPivotedDataFromPivotDetails(
            results,
            undefined,
            [METRIC_TARGET],
        );
        const chart = makeCartesianChart(
            [
                makePivotSerie(METRIC_ACTUAL, '产品A'),
                makePivotSerie(METRIC_TARGET, '产品A', {
                    hideMetricName: true,
                    color: '#123456',
                }),
                makePivotSerie(METRIC_TARGET, '产品B'),
            ],
            { baselineFieldIds: [METRIC_TARGET] },
        );

        const series = getEchartsSeriesFromPivotedData(
            itemsMap,
            chart,
            rowKeyMap,
            pivotValuesColumnsMapFromResults(results),
        );

        expect(baselineSeriesOf(series)).toHaveLength(1);
        expect(baselineSeriesOf(series)[0].encode?.y).toBe(
            getBaselineMergedColumnKey(METRIC_TARGET),
        );
    });
});

describe('F. tooltip 按当前 x 点的值排序', () => {
    const makeTooltipParam = (seriesName: string, value: number) => ({
        seriesName,
        value: { [DIM_MONTH]: '20261019', [`${seriesName}.value`]: value },
        encode: { y: [1] },
        dimensionNames: [DIM_MONTH, `${seriesName}.value`],
    });

    test('降序：行按当前点的数值从大到小，而非按全球总和顺序', () => {
        // 该点数值 8.02 / 10.63 / 2.67 —— 总和顺序与点顺序不同
        const params = [
            makeTooltipParam('统一冰红茶', 8.02),
            makeTooltipParam('统一苹果气泡', 10.63),
            makeTooltipParam('统一绿茶', 2.67),
        ];

        const sorted = sortTooltipParamsByAxisValue(params, false, 'desc');
        expect(
            sorted.map((p) => (p as { seriesName: string }).seriesName),
        ).toEqual(['统一苹果气泡', '统一冰红茶', '统一绿茶']);
    });

    test('升序', () => {
        const params = [
            makeTooltipParam('A', 8.02),
            makeTooltipParam('B', 10.63),
            makeTooltipParam('C', 2.67),
        ];

        const sorted = sortTooltipParamsByAxisValue(params, false, 'asc');
        expect(
            sorted.map((p) => (p as { seriesName: string }).seriesName),
        ).toEqual(['C', 'A', 'B']);
    });

    test('无数值的行（如基准线缺值）排在末尾并保持相对顺序', () => {
        const params = [
            { seriesName: 'no-value' },
            makeTooltipParam('A', 5),
            { seriesName: 'no-value-2' },
            makeTooltipParam('B', 9),
        ];

        const sorted = sortTooltipParamsByAxisValue(params, false, 'desc');
        expect(
            sorted.map((p) => (p as { seriesName: string }).seriesName),
        ).toEqual(['B', 'A', 'no-value', 'no-value-2']);
    });
});

import { CartesianSeriesType, type ResultRow } from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import { type InfiniteQueryResults } from '../useQueryResults';
import {
    applyVerticalBarAxisSortSeriesData,
    applyWidePivotBarSeriesData,
    calculateStackTotal,
    getAxisDefaultMaxValue,
    getAxisDefaultMinValue,
    getLineLegendOrder,
    getMinAndMaxValues,
    getSeriesValueFromRow,
    getSinglePointTimeAxisConfig,
    getStackedBarLegendOrder,
    getTopXAxisVisualOverrides,
    getXAxisLineConfig,
    isUnusedTopXAxis,
    resolveXAxisLineOnZero,
    reverseStackedBarSeriesForPaint,
    shouldInjectSeriesCategoryAxis,
    sortFlipAxesWidePivotBarSeriesByBarTotals,
    sortLineSeriesByValue,
    sortStackedBarSeriesByValue,
    sortVerticalBarSeriesByBarTotals,
    sortWidePivotBarSeriesByBarTotals,
    type EChartSeries,
} from './useEchartsCartesianConfig';

vi.mock('./../../providers/TrackingProvider');

describe('isUnusedTopXAxis', () => {
    test('非翻转且无顶轴字段时视为未使用', () => {
        expect(isUnusedTopXAxis({ flipAxes: false })).toBe(true);
        expect(isUnusedTopXAxis({})).toBe(true);
    });

    test('翻转轴时不视为未使用，避免误伤横向双轴', () => {
        expect(isUnusedTopXAxis({ flipAxes: true })).toBe(false);
        expect(
            isUnusedTopXAxis({ flipAxes: true, topAxisXId: 'metric_a' }),
        ).toBe(false);
    });

    test('非翻转但存在顶轴字段时不视为未使用', () => {
        expect(
            isUnusedTopXAxis({ flipAxes: false, topAxisXId: 'metric_a' }),
        ).toBe(false);
    });
});

describe('getTopXAxisVisualOverrides', () => {
    test('普通折线隐藏占位顶轴轴线与刻度', () => {
        expect(
            getTopXAxisVisualOverrides({
                flipAxes: false,
                defaultSplitLineShow: true,
            }),
        ).toEqual({
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false },
        });
    });

    test('翻转轴时保留默认 splitLine，不强制关闭轴线', () => {
        expect(
            getTopXAxisVisualOverrides({
                flipAxes: true,
                topAxisXId: 'metric_a',
                defaultSplitLineShow: true,
            }),
        ).toEqual({
            splitLine: { show: true },
        });
        expect(
            getTopXAxisVisualOverrides({
                flipAxes: true,
                defaultSplitLineShow: false,
            }),
        ).toEqual({
            splitLine: { show: false },
        });
    });
});

describe('resolveXAxisLineOnZero / getXAxisLineConfig', () => {
    test('未设置时默认 onZero=true（贴 y=0）', () => {
        expect(resolveXAxisLineOnZero(undefined)).toBe(true);
        expect(getXAxisLineConfig({ axisLineOnZero: undefined })).toEqual({
            axisLine: { onZero: true },
        });
    });

    test('axisLineOnZero=true 时 onZero=true', () => {
        expect(resolveXAxisLineOnZero(true)).toBe(true);
        expect(getXAxisLineConfig({ axisLineOnZero: true })).toEqual({
            axisLine: { onZero: true },
        });
    });

    test('axisLineOnZero=false（轴线置底）时 onZero=false', () => {
        expect(resolveXAxisLineOnZero(false)).toBe(false);
        expect(getXAxisLineConfig({ axisLineOnZero: false })).toEqual({
            axisLine: { onZero: false },
        });
    });

    test('合并已有 axisLine.show，不覆盖隐藏轴配置', () => {
        expect(
            getXAxisLineConfig({
                axisLineOnZero: false,
                existingAxisLine: { show: false },
            }),
        ).toEqual({
            axisLine: { show: false, onZero: false },
        });
    });
});

describe('getAxisDefaultMinValue', () => {
    test('should return undefined', () => {
        expect(getAxisDefaultMinValue({ min: '', max: 5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 10, max: '' })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: '', max: '' })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: undefined, max: undefined }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: null, max: null }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({
                min: new Date('2021-03-10T00:00:00.000Z'),
                max: new Date('2021-03-10T00:00:00.100Z'),
            }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 0, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 0.1, max: 0.5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 10, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 100, max: 500 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: 1000, max: 5000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 0, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -5, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -50, max: -10 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -500, max: -100 }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -5000, max: -1000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -60, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -60, max: -50 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -600, max: -500 }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -6000, max: -5000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -5, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -50, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -500, max: 100 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -5000, max: 1000 }),
        ).toBeUndefined();
    });

    test('should return min value', () => {
        expect(getAxisDefaultMinValue({ min: 0.5, max: 0.6 })).toBe(0.5);
        expect(getAxisDefaultMinValue({ min: 50, max: 60 })).toBe(50);
        expect(getAxisDefaultMinValue({ min: 500, max: 600 })).toBe(500);
        expect(getAxisDefaultMinValue({ min: 5000, max: 6000 })).toBe(5000);
    });
});

describe('getAxisDefaultMaxValue', () => {
    test('should return undefined', () => {
        expect(getAxisDefaultMaxValue({ min: '', max: 5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 10, max: '' })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: '', max: '' })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: undefined, max: undefined }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: null, max: null }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({
                min: new Date('2021-03-10T00:00:00.000Z'),
                max: new Date('2021-03-10T00:00:00.100Z'),
            }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0.1, max: 0.5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 10, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 100, max: 500 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: 1000, max: 5000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0.5, max: 0.6 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 50, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 50, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 500, max: 600 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: 5000, max: 6000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -5, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -50, max: -10 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: -500, max: -100 }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: -5000, max: -1000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -60, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -5, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -50, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -500, max: 100 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: -5000, max: 1000 }),
        ).toBeUndefined();
    });

    test('should return max value', () => {
        expect(getAxisDefaultMaxValue({ min: -60, max: -50 })).toBe(-50);
        expect(getAxisDefaultMaxValue({ min: -600, max: -500 })).toBe(-500);
        expect(getAxisDefaultMaxValue({ min: -6000, max: -5000 })).toBe(-5000);
    });
});

describe('getMinAndMaxValues', () => {
    test('should return min/max values for numbers in a single series', () => {
        const axes = ['axis1'];
        const values = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, -1, -2, -3, -100, 0,
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v.toString() } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([-100, 50]);
    });

    test('should return min/max values for dates in a single series', () => {
        const axes = ['axis1'];
        const time = ':00:00.000Z';
        const values = [
            '2018-02-28',
            '2018-02-29',
            '2018-02-30',
            '2018-01-29',
            '2017-03-29',
            '2019-01-15',
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: `${v}${time}`, formatted: v } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([
            `2017-03-29${time}`,
            `2019-01-15${time}`,
        ]);
    });

    test('should return min/max values for floats in a single series', () => {
        const axes = ['axis1'];
        const values = [
            '1.000',
            '2.000',
            '5.000',
            '8.000',
            '50.000',
            '-5.000',
            '0.000',
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([-5.0, 50.0]);
    });

    test('string values should return invalid min/max in a single series', () => {
        const axes = ['axis1'];

        const values = ['a', 'b', 'c', 'z'];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([0, 0]);
    });

    test('should return min/max values for numbers in multiple series', () => {
        const axes = ['axis1', 'axis2'];
        const values = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, -1, -2, -3, -100, 0,
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v.toString() } },
        }));
        const values2 = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 70, -1, -2, -3, -10, 0,
        ];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: v, formatted: v.toString() } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([-100, 70]);
    });

    test('should return min/max values for dates in multiple series', () => {
        const axes = ['axis1', 'axis2'];
        const time = ':00:00.000Z';
        const values = [
            '2018-02-28',
            '2018-02-29',
            '2018-02-30',
            '2018-01-29',
            '2017-03-29',
            '2019-01-15', // max
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: `${v}${time}`, formatted: v } },
        }));

        const values2 = [
            '2018-02-28',
            '2018-02-29',
            '2018-02-30',
            '2018-01-29',
            '2016-03-29', // min
            '2019-01-15',
        ];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: `${v}${time}`, formatted: v } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([`2016-03-29${time}`, `2019-01-15${time}`]);
    });

    test('should return min/max values for floats in multiple series', () => {
        const axes = ['axis1', 'axis2'];
        const values = [
            '1.000',
            '2.000',
            '5.000',
            '8.000',
            '50.000', // max
            '-5.000',
            '0.000',
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));
        const values2 = [
            '1.000',
            '2.000',
            '5.000',
            '8.000',
            '50.000',
            '-10.000', // min
            '0.000',
        ];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: v, formatted: v } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([-10.0, 50.0]);
    });

    test('string values should return invalid min/max in multiple series', () => {
        const axes = ['axis1', 'axis2'];

        const values = ['a', 'b', 'c', 'z'];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));

        const values2 = ['y', 'x', 'c', 'z'];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: v, formatted: v } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([0, 0]);
    });
});

describe('sortFlipAxesWidePivotBarSeriesByBarTotals', () => {
    const layout = {
        flipAxes: true as const,
        xField: 'mengniu_type',
        yField: ['1111'],
    };

    const pivotDetails = {
        totalColumnCount: 5,
        indexColumn: { reference: 'types' },
        valuesColumns: [
            {
                pivotColumnName: '1111_any_其他',
                columnIndex: 0,
                referenceField: '1111',
                aggregation: null,
                pivotValues: [
                    {
                        value: '其他',
                        formatted: '其他',
                        referenceField: 'mengniu_type',
                    },
                ],
            },
            {
                pivotColumnName: '1111_any_豆冰',
                columnIndex: 1,
                referenceField: '1111',
                aggregation: null,
                pivotValues: [
                    {
                        value: '豆冰',
                        formatted: '豆冰',
                        referenceField: 'mengniu_type',
                    },
                ],
            },
            {
                pivotColumnName: '1111_any_水冰',
                columnIndex: 2,
                referenceField: '1111',
                aggregation: null,
                pivotValues: [
                    {
                        value: '水冰',
                        formatted: '水冰',
                        referenceField: 'mengniu_type',
                    },
                ],
            },
            {
                pivotColumnName: '1111_any_奶冰',
                columnIndex: 3,
                referenceField: '1111',
                aggregation: null,
                pivotValues: [
                    {
                        value: '奶冰',
                        formatted: '奶冰',
                        referenceField: 'mengniu_type',
                    },
                ],
            },
            {
                pivotColumnName: '1111_any_巧冰',
                columnIndex: 4,
                referenceField: '1111',
                aggregation: null,
                pivotValues: [
                    {
                        value: '巧冰',
                        formatted: '巧冰',
                        referenceField: 'mengniu_type',
                    },
                ],
            },
        ],
        groupByColumns: undefined,
        sortBy: undefined,
        originalColumns: {},
    } as unknown as InfiniteQueryResults['pivotDetails'];

    const pivotValuesColumnsMap = Object.fromEntries(
        (pivotDetails?.valuesColumns ?? []).map((column) => [
            column.pivotColumnName,
            column,
        ]),
    );

    const datasetRows = [
        {
            types: 0,
            '1111_any_其他': 0.01,
            '1111_any_豆冰': 2.49,
            '1111_any_水冰': 6.19,
            '1111_any_奶冰': 18.76,
            '1111_any_巧冰': 24.75,
        },
    ];

    const makeBarSerie = (columnKey: string, _label: string): EChartSeries => ({
        type: CartesianSeriesType.BAR,
        connectNulls: true,
        encode: {
            x: columnKey,
            y: 'mengniu_type',
            tooltip: [columnKey],
            seriesName: columnKey,
        },
    });

    const unsortedSeries: EChartSeries[] = [
        makeBarSerie('1111_any_巧冰', '巧冰'),
        makeBarSerie('1111_any_豆冰', '豆冰'),
        makeBarSerie('1111_any_其他', '其他'),
        makeBarSerie('1111_any_水冰', '水冰'),
        makeBarSerie('1111_any_奶冰', '奶冰'),
    ];

    test('should sort wide pivot bar series ascending by value for BAR_TOTALS', () => {
        const result = sortFlipAxesWidePivotBarSeriesByBarTotals({
            layout,
            series: unsortedSeries,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(result).toBeDefined();
        expect(result!.sortedCategoryLabels).toEqual([
            '其他',
            '豆冰',
            '水冰',
            '奶冰',
            '巧冰',
        ]);
        expect(result!.sortedSeries.map((serie) => serie.encode?.x)).toEqual([
            '1111_any_其他',
            '1111_any_豆冰',
            '1111_any_水冰',
            '1111_any_奶冰',
            '1111_any_巧冰',
        ]);
    });

    test('should return undefined for long-format dataset where category column exists in rows', () => {
        const longFormatRows = [
            { mengniu_type: '其他', '1111': 0.01 },
            { mengniu_type: '豆冰', '1111': 2.49 },
        ];

        const longFormatSeries: EChartSeries[] = [
            {
                type: CartesianSeriesType.BAR,
                connectNulls: true,
                encode: {
                    x: '1111',
                    y: 'mengniu_type',
                    tooltip: ['1111'],
                    seriesName: '1111',
                },
            },
        ];

        const result = sortFlipAxesWidePivotBarSeriesByBarTotals({
            layout,
            series: longFormatSeries,
            datasetRows: longFormatRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(result).toBeUndefined();
    });

    test('should sort vertical (non-flipAxes) wide pivot bar series ascending by value', () => {
        const verticalLayout = {
            flipAxes: false as const,
            xField: 'mengniu_type',
            yField: ['1111'],
        };

        const makeVerticalBarSerie = (columnKey: string): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            encode: {
                x: 'mengniu_type',
                y: columnKey,
                tooltip: [columnKey],
                seriesName: columnKey,
            },
        });

        const verticalUnsortedSeries: EChartSeries[] = [
            makeVerticalBarSerie('1111_any_巧冰'),
            makeVerticalBarSerie('1111_any_豆冰'),
            makeVerticalBarSerie('1111_any_其他'),
            makeVerticalBarSerie('1111_any_水冰'),
            makeVerticalBarSerie('1111_any_奶冰'),
        ];

        const result = sortWidePivotBarSeriesByBarTotals({
            layout: verticalLayout,
            series: verticalUnsortedSeries,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(result).toBeDefined();
        expect(result!.sortedCategoryLabels).toEqual([
            '其他',
            '豆冰',
            '水冰',
            '奶冰',
            '巧冰',
        ]);
        expect(result!.sortedSeries.map((serie) => serie.encode?.y)).toEqual([
            '1111_any_其他',
            '1111_any_豆冰',
            '1111_any_水冰',
            '1111_any_奶冰',
            '1111_any_巧冰',
        ]);
    });

    test('should return undefined for vertical long-format dataset where category column exists in rows', () => {
        const longFormatRows = [
            { mengniu_type: '其他', '1111': 0.01 },
            { mengniu_type: '豆冰', '1111': 2.49 },
        ];

        const longFormatSeries: EChartSeries[] = [
            {
                type: CartesianSeriesType.BAR,
                connectNulls: true,
                encode: {
                    x: 'mengniu_type',
                    y: '1111',
                    tooltip: ['1111'],
                    seriesName: '1111',
                },
            },
        ];

        const result = sortWidePivotBarSeriesByBarTotals({
            layout: { ...layout, flipAxes: false },
            series: longFormatSeries,
            datasetRows: longFormatRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(result).toBeUndefined();
    });
});

describe('sortLineSeriesByValue', () => {
    const makeLineSerie = (columnKey: string): EChartSeries => ({
        type: CartesianSeriesType.LINE,
        connectNulls: true,
        name: columnKey,
        encode: {
            x: 'month',
            y: columnKey,
            tooltip: [columnKey],
            seriesName: columnKey,
        },
    });

    const unsortedSeries: EChartSeries[] = [
        makeLineSerie('1111_any_其他'),
        makeLineSerie('1111_any_奶冰'),
        makeLineSerie('1111_any_巧冰'),
        makeLineSerie('1111_any_水冰'),
        makeLineSerie('1111_any_豆冰'),
    ];

    const rows: ResultRow[] = [
        {
            month: { value: { raw: '2025-07', formatted: '2025-07' } },
            '1111_any_其他': { value: { raw: 0.24, formatted: '0.24' } },
            '1111_any_奶冰': { value: { raw: 30.14, formatted: '30.14' } },
            '1111_any_巧冰': { value: { raw: 31.92, formatted: '31.92' } },
            '1111_any_水冰': { value: { raw: 9.23, formatted: '9.23' } },
            '1111_any_豆冰': { value: { raw: 3.59, formatted: '3.59' } },
        },
        {
            month: { value: { raw: '2025-08', formatted: '2025-08' } },
            '1111_any_其他': { value: { raw: 0.17, formatted: '0.17' } },
            '1111_any_奶冰': { value: { raw: 28.0, formatted: '28.0' } },
            '1111_any_巧冰': { value: { raw: 26.57, formatted: '26.57' } },
            '1111_any_水冰': { value: { raw: 8.0, formatted: '8.0' } },
            '1111_any_豆冰': { value: { raw: 3.0, formatted: '3.0' } },
        },
    ];

    test('should sort line series descending by total value', () => {
        const result = sortLineSeriesByValue({
            series: unsortedSeries,
            rows,
            sortDirection: 'desc',
            flipAxes: false,
        });

        expect(result.map((serie) => serie.encode?.y)).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);
    });

    test('should sort line series ascending by total value', () => {
        const result = sortLineSeriesByValue({
            series: unsortedSeries,
            rows,
            sortDirection: 'asc',
            flipAxes: false,
        });

        expect(result.map((serie) => serie.encode?.y)).toEqual([
            '1111_any_其他',
            '1111_any_豆冰',
            '1111_any_水冰',
            '1111_any_奶冰',
            '1111_any_巧冰',
        ]);
    });

    test('should preserve non-line series positions', () => {
        const barSerie: EChartSeries = {
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            encode: {
                x: 'month',
                y: 'total',
                tooltip: ['total'],
                seriesName: 'total',
            },
        };
        const mixedSeries = [
            unsortedSeries[0],
            barSerie,
            ...unsortedSeries.slice(1),
        ];

        const result = sortLineSeriesByValue({
            series: mixedSeries,
            rows,
            sortDirection: 'desc',
            flipAxes: false,
        });

        expect(result[1].type).toBe(CartesianSeriesType.BAR);
        expect(result.map((serie) => serie.encode?.y ?? 'total')).toEqual([
            '1111_any_巧冰',
            'total',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);
    });

    test('should sort line series descending using datasetRows when rows is empty', () => {
        const datasetRows = [
            {
                month: '2025-07',
                '1111_any_其他': 0.24,
                '1111_any_奶冰': 30.14,
                '1111_any_巧冰': 31.92,
                '1111_any_水冰': 9.23,
                '1111_any_豆冰': 3.59,
            },
            {
                month: '2025-08',
                '1111_any_其他': 0.17,
                '1111_any_奶冰': 28.0,
                '1111_any_巧冰': 26.57,
                '1111_any_水冰': 8.0,
                '1111_any_豆冰': 3.0,
            },
        ];

        const result = sortLineSeriesByValue({
            series: unsortedSeries,
            rows: [],
            datasetRows,
            sortDirection: 'desc',
            flipAxes: false,
        });

        expect(result.map((serie) => serie.encode?.y)).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);
    });
});

describe('getLineLegendOrder', () => {
    const makeLineSerie = (columnKey: string): EChartSeries => ({
        type: CartesianSeriesType.LINE,
        connectNulls: true,
        name: columnKey,
        encode: {
            x: 'month',
            y: columnKey,
            tooltip: [columnKey],
            seriesName: columnKey,
        },
    });

    test('should return legend names sorted by total from datasetRows', () => {
        const series: EChartSeries[] = [
            makeLineSerie('1111_any_其他'),
            makeLineSerie('1111_any_奶冰'),
            makeLineSerie('1111_any_巧冰'),
        ];
        const datasetRows = [
            {
                month: '2025-07',
                '1111_any_其他': 1,
                '1111_any_奶冰': 30,
                '1111_any_巧冰': 50,
            },
        ];

        const legendOrder = getLineLegendOrder({
            series,
            rows: [],
            datasetRows,
            sortDirection: 'desc',
            flipAxes: false,
        });

        expect(legendOrder).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_其他',
        ]);
    });
});

describe('sortStackedBarSeriesByValue', () => {
    const datasetRows = [
        {
            types: 0,
            '1111_any_其他': 0.01,
            '1111_any_豆冰': 2.49,
            '1111_any_水冰': 6.19,
            '1111_any_奶冰': 18.76,
            '1111_any_巧冰': 24.75,
        },
    ];

    const makeStackedBarSerie = (columnKey: string): EChartSeries => ({
        type: CartesianSeriesType.BAR,
        connectNulls: true,
        stack: 'stack1',
        encode: {
            x: columnKey,
            y: 'mengniu_type',
            tooltip: [columnKey],
            seriesName: columnKey,
        },
    });

    const unsortedWidePivotSeries: EChartSeries[] = [
        makeStackedBarSerie('1111_any_巧冰'),
        makeStackedBarSerie('1111_any_豆冰'),
        makeStackedBarSerie('1111_any_其他'),
        makeStackedBarSerie('1111_any_水冰'),
        makeStackedBarSerie('1111_any_奶冰'),
    ];

    test('should sort wide pivot stacked bar series descending by total value', () => {
        const result = sortStackedBarSeriesByValue({
            series: unsortedWidePivotSeries,
            rows: [],
            datasetRows,
            sortDirection: 'desc',
            flipAxes: true,
        });

        expect(result.map((serie) => serie.encode?.x)).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);
    });

    test('should sort wide pivot stacked bar series ascending by total value', () => {
        const result = sortStackedBarSeriesByValue({
            series: unsortedWidePivotSeries,
            rows: [],
            datasetRows,
            sortDirection: 'asc',
            flipAxes: true,
        });

        expect(result.map((serie) => serie.encode?.x)).toEqual([
            '1111_any_其他',
            '1111_any_豆冰',
            '1111_any_水冰',
            '1111_any_奶冰',
            '1111_any_巧冰',
        ]);
    });

    test('should sort long-format stacked bar series descending by total value', () => {
        const rows: ResultRow[] = [
            {
                month: { value: { raw: '2025-07', formatted: '2025-07' } },
                '1111_any_其他': { value: { raw: 0.24, formatted: '0.24' } },
                '1111_any_奶冰': { value: { raw: 30.14, formatted: '30.14' } },
                '1111_any_巧冰': { value: { raw: 31.92, formatted: '31.92' } },
                '1111_any_水冰': { value: { raw: 9.23, formatted: '9.23' } },
                '1111_any_豆冰': { value: { raw: 3.59, formatted: '3.59' } },
            },
            {
                month: { value: { raw: '2025-08', formatted: '2025-08' } },
                '1111_any_其他': { value: { raw: 0.17, formatted: '0.17' } },
                '1111_any_奶冰': { value: { raw: 28.0, formatted: '28.0' } },
                '1111_any_巧冰': { value: { raw: 26.57, formatted: '26.57' } },
                '1111_any_水冰': { value: { raw: 8.0, formatted: '8.0' } },
                '1111_any_豆冰': { value: { raw: 3.0, formatted: '3.0' } },
            },
        ];

        const makeLongFormatStackedBarSerie = (
            columnKey: string,
        ): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            stack: 'stack1',
            encode: {
                x: 'month',
                y: columnKey,
                tooltip: [columnKey],
                seriesName: columnKey,
            },
        });

        const unsortedSeries: EChartSeries[] = [
            makeLongFormatStackedBarSerie('1111_any_其他'),
            makeLongFormatStackedBarSerie('1111_any_奶冰'),
            makeLongFormatStackedBarSerie('1111_any_巧冰'),
            makeLongFormatStackedBarSerie('1111_any_水冰'),
            makeLongFormatStackedBarSerie('1111_any_豆冰'),
        ];

        const result = sortStackedBarSeriesByValue({
            series: unsortedSeries,
            rows,
            datasetRows: [],
            sortDirection: 'desc',
            flipAxes: false,
        });

        expect(result.map((serie) => serie.encode?.y)).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);
    });

    test('should sum pivot column values across multiple dashboard dataset rows', () => {
        const multiRowDataset = [
            {
                mengniu_group: '伊利',
                '1111_any_巧冰': 10,
                '1111_any_奶冰': 20,
            },
            {
                mengniu_group: '蒙牛',
                '1111_any_巧冰': 14,
                '1111_any_奶冰': 5,
            },
        ];

        const makeDashboardStackedBarSerie = (
            columnKey: string,
        ): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            stack: 'stack1',
            encode: {
                x: columnKey,
                y: 'mengniu_group',
                tooltip: [columnKey],
                seriesName: columnKey,
            },
        });

        const result = sortStackedBarSeriesByValue({
            series: [
                makeDashboardStackedBarSerie('1111_any_奶冰'),
                makeDashboardStackedBarSerie('1111_any_巧冰'),
            ],
            rows: [],
            datasetRows: multiRowDataset,
            sortDirection: 'desc',
            flipAxes: true,
        });

        expect(result.map((serie) => serie.encode?.x)).toEqual([
            '1111_any_奶冰',
            '1111_any_巧冰',
        ]);
    });

    test('getStackedBarLegendOrder returns sorted names without mutating input series', () => {
        const makeLegendStackedBarSerie = (
            columnKey: string,
            label: string,
        ): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            stack: 'stack1',
            encode: {
                x: columnKey,
                y: 'mengniu_type',
                tooltip: [columnKey],
                seriesName: columnKey,
            },
            dimensions: [
                { name: 'mengniu_type', displayName: '类型' },
                { name: columnKey, displayName: label },
            ],
        });

        const unsortedSeries: EChartSeries[] = [
            makeLegendStackedBarSerie('1111_any_其他', '其他'),
            makeLegendStackedBarSerie('1111_any_巧冰', '巧冰'),
            makeLegendStackedBarSerie('1111_any_奶冰', '奶冰'),
        ];

        const legendTestDatasetRows = [
            {
                types: 0,
                '1111_any_其他': 0.01,
                '1111_any_巧冰': 24.75,
                '1111_any_奶冰': 18.76,
            },
        ];

        const legendOrder = getStackedBarLegendOrder({
            series: unsortedSeries,
            rows: [],
            datasetRows: legendTestDatasetRows,
            sortDirection: 'desc',
            flipAxes: true,
        });

        expect(legendOrder).toEqual(['巧冰', '奶冰', '其他']);
        expect(unsortedSeries.map((s) => s.encode?.x)).toEqual([
            '1111_any_其他',
            '1111_any_巧冰',
            '1111_any_奶冰',
        ]);

        const sortedSeries = sortStackedBarSeriesByValue({
            series: unsortedSeries,
            rows: [],
            datasetRows: legendTestDatasetRows,
            sortDirection: 'desc',
            flipAxes: true,
        });
        // Config order O: legend/tooltip match sortStackedBarSeriesByValue
        expect(
            sortedSeries
                .map((serie) => serie.dimensions?.[1]?.displayName)
                .filter(Boolean),
        ).toEqual(legendOrder);

        // Paint order: reverse O so ECharts stack top matches tooltip top
        const paintSeries = reverseStackedBarSeriesForPaint(sortedSeries);
        expect(
            paintSeries
                .map((serie) => serie.dimensions?.[1]?.displayName)
                .filter(Boolean),
        ).toEqual([...legendOrder].reverse());
    });

    test('reverseStackedBarSeriesForPaint reverses each stack and keeps non-stacked last', () => {
        const lineSerie: EChartSeries = {
            type: CartesianSeriesType.LINE,
            connectNulls: true,
            encode: {
                x: 'month',
                y: 'total',
                tooltip: ['total'],
                seriesName: 'total',
            },
        };
        const sortedDesc = sortStackedBarSeriesByValue({
            series: [
                unsortedWidePivotSeries[0],
                lineSerie,
                ...unsortedWidePivotSeries.slice(1),
            ],
            rows: [],
            datasetRows,
            sortDirection: 'desc',
            flipAxes: true,
        });
        const configOrder = sortedDesc
            .slice(0, 5)
            .map((serie) => serie.encode?.x);
        expect(configOrder).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);

        const paintSeries = reverseStackedBarSeriesForPaint(sortedDesc);
        expect(paintSeries.slice(0, 5).map((serie) => serie.encode?.x)).toEqual(
            [...configOrder].reverse(),
        );
        expect(paintSeries[5]?.type).toBe(CartesianSeriesType.LINE);
    });

    test('should preserve non-stacked series at the end', () => {
        const lineSerie: EChartSeries = {
            type: CartesianSeriesType.LINE,
            connectNulls: true,
            encode: {
                x: 'month',
                y: 'total',
                tooltip: ['total'],
                seriesName: 'total',
            },
        };
        const mixedSeries = [
            unsortedWidePivotSeries[0],
            lineSerie,
            ...unsortedWidePivotSeries.slice(1),
        ];

        const result = sortStackedBarSeriesByValue({
            series: mixedSeries,
            rows: [],
            datasetRows,
            sortDirection: 'desc',
            flipAxes: true,
        });

        expect(result.slice(0, 5).map((serie) => serie.encode?.x)).toEqual([
            '1111_any_巧冰',
            '1111_any_奶冰',
            '1111_any_水冰',
            '1111_any_豆冰',
            '1111_any_其他',
        ]);
        expect(result[5]?.type).toBe(CartesianSeriesType.LINE);
    });
});

describe('getSeriesValueFromRow and calculateStackTotal long-format fallback', () => {
    const enterpriseField = '企业名称';
    const metricField = '销售额占比';

    const makeLongFormatRow = (
        enterprise: string,
        value: number,
    ): ResultRow => ({
        [enterpriseField]: {
            value: { raw: enterprise, formatted: enterprise },
        },
        [metricField]: {
            value: { raw: value, formatted: `${value}%` },
        },
    });

    const makePivotHashSerie = (enterprise: string): EChartSeries => ({
        type: CartesianSeriesType.BAR,
        connectNulls: true,
        name: enterprise,
        encode: {
            x: enterpriseField,
            y: `${metricField}.${enterpriseField}.${enterprise}`,
            tooltip: [`${metricField}.${enterpriseField}.${enterprise}`],
            seriesName: `${metricField}.${enterpriseField}.${enterprise}`,
        },
    });

    test('getSeriesValueFromRow falls back to metric.dim.category on long-format rows', () => {
        const row = makeLongFormatRow('江西赣州宏昌', 0.3534);
        const hash = `${metricField}.${enterpriseField}.江西赣州宏昌`;

        expect(getSeriesValueFromRow(row, hash)).toBe(0.3534);
        expect(
            getSeriesValueFromRow(
                row,
                `${metricField}.${enterpriseField}.河南郑州建业`,
            ),
        ).toBe(0);
    });

    test('getSeriesValueFromRow prefers pivoted hash column when present', () => {
        const hash = `${metricField}.${enterpriseField}.江西赣州宏昌`;
        const row: ResultRow = {
            ...makeLongFormatRow('江西赣州宏昌', 0.3534),
            [hash]: { value: { raw: 0.99, formatted: '99%' } },
        };

        expect(getSeriesValueFromRow(row, hash)).toBe(0.99);
    });

    test('calculateStackTotal sorts dashboard long-format rows by bar value for BAR_TOTALS', () => {
        const rows = [
            makeLongFormatRow('河南商丘森义', 0.0699),
            makeLongFormatRow('江西赣州宏昌', 0.3534),
            makeLongFormatRow('河南郑州建业', 0.1259),
            makeLongFormatRow('河南新乡万德隆', 0.0112),
        ];

        const series = rows.map((row) =>
            makePivotHashSerie(String(row[enterpriseField]?.value.raw)),
        );

        const sorted = [...rows].sort((a, b) => {
            const totalA = calculateStackTotal(a, series, false, undefined);
            const totalB = calculateStackTotal(b, series, false, undefined);
            return totalA - totalB;
        });

        expect(sorted.map((row) => row[enterpriseField]?.value.raw)).toEqual([
            '河南新乡万德隆',
            '河南商丘森义',
            '河南郑州建业',
            '江西赣州宏昌',
        ]);
        expect(
            sorted.map((row) =>
                calculateStackTotal(row, series, false, undefined),
            ),
        ).toEqual([0.0112, 0.0699, 0.1259, 0.3534]);
    });

    test('calculateStackTotal ignores hidden legend series', () => {
        const row = makeLongFormatRow('江西赣州宏昌', 0.3534);
        const series = [
            makePivotHashSerie('江西赣州宏昌'),
            makePivotHashSerie('河南郑州建业'),
        ];

        expect(
            calculateStackTotal(row, series, false, {
                江西赣州宏昌: false,
            }),
        ).toBe(0);
    });
});

describe('sortVerticalBarSeriesByBarTotals', () => {
    const enterpriseField = '企业名称';
    const metricField = '销售额占比';

    const makeLongFormatRow = (
        enterprise: string,
        value: number,
    ): ResultRow => ({
        [enterpriseField]: {
            value: { raw: enterprise, formatted: enterprise },
        },
        [metricField]: {
            value: { raw: value, formatted: `${value}%` },
        },
    });

    const makePivotHashSerie = (enterprise: string): EChartSeries => ({
        type: CartesianSeriesType.BAR,
        connectNulls: true,
        name: enterprise,
        encode: {
            x: enterpriseField,
            y: `${metricField}.${enterpriseField}.${enterprise}`,
            tooltip: [`${metricField}.${enterpriseField}.${enterprise}`],
            seriesName: `${metricField}.${enterpriseField}.${enterprise}`,
        },
        pivotReference: {
            field: metricField,
            pivotValues: [{ field: enterpriseField, value: enterprise }],
        },
        dimensions: [
            { name: enterpriseField, displayName: enterpriseField },
            { name: metricField, displayName: enterprise },
        ],
    });

    test('sorts without pivotDetails using long-format metric.dim.category fallback', () => {
        const rows = [
            makeLongFormatRow('河南商丘森义', 0.0699),
            makeLongFormatRow('江西赣州宏昌', 0.3534),
            makeLongFormatRow('河南郑州建业', 0.1259),
            makeLongFormatRow('河南新乡万德隆', 0.0112),
        ];
        const series = [
            makePivotHashSerie('河南商丘森义'),
            makePivotHashSerie('江西赣州宏昌'),
            makePivotHashSerie('河南郑州建业'),
            makePivotHashSerie('河南新乡万德隆'),
        ];

        const result = sortVerticalBarSeriesByBarTotals({
            series,
            rows,
            datasetRows: [],
            itemsMap: {},
        });

        expect(result).toBeDefined();
        expect(result!.sortedCategoryLabels).toEqual([
            '河南新乡万德隆',
            '河南商丘森义',
            '河南郑州建业',
            '江西赣州宏昌',
        ]);
        expect(result!.sortedSeries.map((serie) => serie.name)).toEqual([
            '河南新乡万德隆',
            '河南商丘森义',
            '河南郑州建业',
            '江西赣州宏昌',
        ]);
    });

    test('descending sorts high to low for LTR visual order', () => {
        const rows = [
            makeLongFormatRow('河南商丘森义', 0.0699),
            makeLongFormatRow('江西赣州宏昌', 0.3534),
            makeLongFormatRow('河南郑州建业', 0.1259),
            makeLongFormatRow('河南新乡万德隆', 0.0112),
        ];
        const series = [
            makePivotHashSerie('河南商丘森义'),
            makePivotHashSerie('江西赣州宏昌'),
            makePivotHashSerie('河南郑州建业'),
            makePivotHashSerie('河南新乡万德隆'),
        ];

        const result = sortVerticalBarSeriesByBarTotals({
            series,
            rows,
            datasetRows: [],
            itemsMap: {},
            descending: true,
        });

        expect(result).toBeDefined();
        expect(result!.sortedCategoryLabels).toEqual([
            '江西赣州宏昌',
            '河南郑州建业',
            '河南商丘森义',
            '河南新乡万德隆',
        ]);
        expect(result!.sortedSeries.map((serie) => serie.name)).toEqual([
            '江西赣州宏昌',
            '河南郑州建业',
            '河南商丘森义',
            '河南新乡万德隆',
        ]);
    });

    test('applyVerticalBarAxisSortSeriesData keeps one point per series on long-format rows', () => {
        const rows = [
            makeLongFormatRow('河南商丘森义', 0.0699),
            makeLongFormatRow('江西赣州宏昌', 0.3534),
            makeLongFormatRow('河南郑州建业', 0.1259),
        ];
        // Long-format dataset: each hash column only present on some rows
        const datasetRows = rows.map((row) => {
            const enterprise = String(
                (row[enterpriseField] as { value: { raw: string } }).value.raw,
            );
            const value = (row[metricField] as { value: { raw: number } }).value
                .raw;
            return {
                [enterpriseField]: enterprise,
                [`${metricField}.${enterpriseField}.${enterprise}`]: value,
            };
        });

        const series = [
            makePivotHashSerie('河南商丘森义'),
            makePivotHashSerie('江西赣州宏昌'),
            makePivotHashSerie('河南郑州建业'),
        ];

        const applied = applyVerticalBarAxisSortSeriesData({
            layout: {
                flipAxes: false,
                xField: enterpriseField,
                yField: [metricField],
            },
            series,
            rows,
            datasetRows,
            itemsMap: {},
        });

        for (const serie of applied) {
            expect(Array.isArray(serie.data)).toBe(true);
            expect(serie.data).toHaveLength(1);
            const point = serie.data![0] as [unknown, unknown];
            expect(point[0]).toBe(serie.name);
            expect(typeof point[1]).toBe('number');
        }

        expect(
            applied.map((s) => (s.data![0] as [unknown, unknown])[1]),
        ).toEqual([0.0699, 0.3534, 0.1259]);
    });

    test('returns undefined when all series totals are zero', () => {
        const series = [makePivotHashSerie('江西赣州宏昌')];
        const rows = [makeLongFormatRow('河南郑州建业', 0.1259)];

        const result = sortVerticalBarSeriesByBarTotals({
            series,
            rows,
            datasetRows: [],
            itemsMap: {},
        });

        expect(result).toBeUndefined();
    });

    test('wide pivot vertical BAR_TOTALS still sorts by column values', () => {
        const layout = {
            flipAxes: false as const,
            xField: 'mengniu_type',
            yField: ['1111'],
        };
        const pivotDetails = {
            totalColumnCount: 3,
            indexColumn: { reference: 'types' },
            valuesColumns: [
                {
                    pivotColumnName: '1111_any_其他',
                    columnIndex: 0,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '其他',
                            formatted: '其他',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
                {
                    pivotColumnName: '1111_any_豆冰',
                    columnIndex: 1,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '豆冰',
                            formatted: '豆冰',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
                {
                    pivotColumnName: '1111_any_巧冰',
                    columnIndex: 2,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '巧冰',
                            formatted: '巧冰',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
            ],
            groupByColumns: undefined,
            sortBy: undefined,
            originalColumns: {},
        } as unknown as InfiniteQueryResults['pivotDetails'];

        const pivotValuesColumnsMap = Object.fromEntries(
            (pivotDetails?.valuesColumns ?? []).map((column) => [
                column.pivotColumnName,
                column,
            ]),
        );

        const datasetRows = [
            {
                types: 0,
                '1111_any_其他': 0.01,
                '1111_any_豆冰': 2.49,
                '1111_any_巧冰': 24.75,
            },
        ];

        const makeVerticalBarSerie = (columnKey: string): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            encode: {
                x: 'mengniu_type',
                y: columnKey,
                tooltip: [columnKey],
                seriesName: columnKey,
            },
        });

        const unsortedSeries: EChartSeries[] = [
            makeVerticalBarSerie('1111_any_巧冰'),
            makeVerticalBarSerie('1111_any_其他'),
            makeVerticalBarSerie('1111_any_豆冰'),
        ];

        const wideResult = sortWidePivotBarSeriesByBarTotals({
            layout,
            series: unsortedSeries,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(wideResult).toBeDefined();
        expect(wideResult!.sortedCategoryLabels).toEqual([
            '其他',
            '豆冰',
            '巧冰',
        ]);

        const wideDescending = sortWidePivotBarSeriesByBarTotals({
            layout,
            series: unsortedSeries,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
            descending: true,
        });

        expect(wideDescending!.sortedCategoryLabels).toEqual([
            '巧冰',
            '豆冰',
            '其他',
        ]);

        // Vertical fallback also works when dataset columns are present
        const verticalResult = sortVerticalBarSeriesByBarTotals({
            series: unsortedSeries,
            rows: [],
            datasetRows,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(verticalResult).toBeDefined();
        expect(verticalResult!.sortedSeries.map((s) => s.encode?.y)).toEqual([
            '1111_any_其他',
            '1111_any_豆冰',
            '1111_any_巧冰',
        ]);

        // Single-row wide table: apply keeps one point using column value
        const applied = applyVerticalBarAxisSortSeriesData({
            layout,
            series: unsortedSeries,
            rows: [],
            datasetRows,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(applied.map((s) => s.data)).toEqual([
            [['巧冰', 24.75]],
            [['其他', 0.01]],
            [['豆冰', 2.49]],
        ]);
    });

    test('dashboard path: overwrites wide multi-point data with one point per series', () => {
        const layout = {
            flipAxes: false as const,
            xField: 'mengniu_type',
            yField: ['1111'],
        };
        const pivotDetails = {
            totalColumnCount: 3,
            indexColumn: { reference: 'types' },
            valuesColumns: [
                {
                    pivotColumnName: '1111_any_其他',
                    columnIndex: 0,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '其他',
                            formatted: '其他',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
                {
                    pivotColumnName: '1111_any_豆冰',
                    columnIndex: 1,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '豆冰',
                            formatted: '豆冰',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
                {
                    pivotColumnName: '1111_any_巧冰',
                    columnIndex: 2,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '巧冰',
                            formatted: '巧冰',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
            ],
            groupByColumns: undefined,
            sortBy: undefined,
            originalColumns: {},
        } as unknown as InfiniteQueryResults['pivotDetails'];

        const pivotValuesColumnsMap = Object.fromEntries(
            (pivotDetails?.valuesColumns ?? []).map((column) => [
                column.pivotColumnName,
                column,
            ]),
        );

        // Multi-row wide dataset (dashboard scramble trigger for wide inject)
        const datasetRows = [
            {
                types: 0,
                '1111_any_其他': 0.01,
                '1111_any_豆冰': 2.0,
                '1111_any_巧冰': 10.0,
            },
            {
                types: 1,
                '1111_any_其他': 0.02,
                '1111_any_豆冰': 0.49,
                '1111_any_巧冰': 14.75,
            },
        ];

        const makeVerticalBarSerie = (columnKey: string): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            encode: {
                x: 'mengniu_type',
                y: columnKey,
                tooltip: [columnKey],
                seriesName: columnKey,
            },
        });

        const unsortedSeries: EChartSeries[] = [
            makeVerticalBarSerie('1111_any_巧冰'),
            makeVerticalBarSerie('1111_any_其他'),
            makeVerticalBarSerie('1111_any_豆冰'),
        ];

        const wideInjected = applyWidePivotBarSeriesData({
            layout,
            series: unsortedSeries,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        // Wide path maps every dataset row → multi-point same category
        expect(wideInjected[0].data).toHaveLength(2);

        const applied = applyVerticalBarAxisSortSeriesData({
            layout,
            series: wideInjected,
            rows: [],
            datasetRows,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        for (const serie of applied) {
            expect(serie.data).toHaveLength(1);
        }

        // Multi-row: values are column totals (0.03, 2.49, 24.75)
        expect(
            applied.map((s) => (s.data![0] as [unknown, unknown])[1]),
        ).toEqual([24.75, 0.03, 2.49]);

        // sortWide sums all rows (not first-row-only), matching bar heights
        const descendingWide = sortWidePivotBarSeriesByBarTotals({
            layout,
            series: unsortedSeries,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
            descending: true,
        });

        expect(descendingWide!.sortedCategoryLabels).toEqual([
            '巧冰',
            '豆冰',
            '其他',
        ]);

        // First-row descending would still be 巧冰>豆冰>其他; use a case where
        // row0 order ≠ column totals (regression for multi-row wide BAR_TOTALS).
        const multiRowDisagreeingFirstRow = [
            {
                types: 0,
                '1111_any_其他': 100,
                '1111_any_豆冰': 50,
                '1111_any_巧冰': 10,
            },
            {
                types: 1,
                '1111_any_其他': 1,
                '1111_any_豆冰': 200,
                '1111_any_巧冰': 5,
            },
        ];
        // Totals: 其他=101, 豆冰=250, 巧冰=15 → desc: 豆冰, 其他, 巧冰
        // First-row-only desc would be: 其他, 豆冰, 巧冰

        const descendingVertical = sortVerticalBarSeriesByBarTotals({
            series: unsortedSeries,
            rows: [],
            datasetRows: multiRowDisagreeingFirstRow,
            itemsMap: {},
            pivotValuesColumnsMap,
            descending: true,
        });

        expect(descendingVertical!.sortedCategoryLabels).toEqual([
            '豆冰',
            '其他',
            '巧冰',
        ]);
        expect(
            descendingVertical!.sortedSeries.map((s) => s.encode?.y),
        ).toEqual(['1111_any_豆冰', '1111_any_其他', '1111_any_巧冰']);

        const descendingWideDisagree = sortWidePivotBarSeriesByBarTotals({
            layout,
            series: unsortedSeries,
            datasetRows: multiRowDisagreeingFirstRow,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
            descending: true,
        });

        expect(descendingWideDisagree!.sortedCategoryLabels).toEqual([
            '豆冰',
            '其他',
            '巧冰',
        ]);
    });

    test('sortWide returns undefined when column keys resolve to all zeros', () => {
        const layout = {
            flipAxes: false as const,
            xField: 'mengniu_type',
            yField: ['1111'],
        };
        const pivotDetails = {
            totalColumnCount: 2,
            indexColumn: { reference: 'types' },
            valuesColumns: [
                {
                    pivotColumnName: '1111_any_其他',
                    columnIndex: 0,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '其他',
                            formatted: '其他',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
                {
                    pivotColumnName: '1111_any_豆冰',
                    columnIndex: 1,
                    referenceField: '1111',
                    aggregation: null,
                    pivotValues: [
                        {
                            value: '豆冰',
                            formatted: '豆冰',
                            referenceField: 'mengniu_type',
                        },
                    ],
                },
            ],
            groupByColumns: undefined,
            sortBy: undefined,
            originalColumns: {},
        } as unknown as InfiniteQueryResults['pivotDetails'];

        const pivotValuesColumnsMap = Object.fromEntries(
            (pivotDetails?.valuesColumns ?? []).map((column) => [
                column.pivotColumnName,
                column,
            ]),
        );

        // Wide shape but series encode keys do not match dataset columns
        const datasetRows = [
            {
                types: 0,
                '1111_any_其他': 10,
                '1111_any_豆冰': 20,
            },
        ];

        const series: EChartSeries[] = [
            {
                type: CartesianSeriesType.BAR,
                connectNulls: true,
                encode: {
                    x: 'mengniu_type',
                    y: 'missing_column_a',
                    tooltip: ['missing_column_a'],
                    seriesName: 'missing_column_a',
                },
            },
            {
                type: CartesianSeriesType.BAR,
                connectNulls: true,
                encode: {
                    x: 'mengniu_type',
                    y: 'missing_column_b',
                    tooltip: ['missing_column_b'],
                    seriesName: 'missing_column_b',
                },
            },
        ];

        const result = sortWidePivotBarSeriesByBarTotals({
            layout,
            series,
            datasetRows,
            pivotDetails,
            itemsMap: {},
            pivotValuesColumnsMap,
        });

        expect(result).toBeUndefined();
    });

    test('long-format + pivotReference + pivotColumnName encode sorts descending', () => {
        const merchantField = 'btsl_zhengzhou_category_sales_merchant_name';
        const rateField = 'btsl_zhengzhou_category_sales_total_rate';

        const makeRow = (merchant: string, value: number): ResultRow => ({
            [merchantField]: {
                value: { raw: merchant, formatted: merchant },
            },
            [rateField]: {
                value: { raw: value, formatted: `${value}%` },
            },
        });

        const makeSerie = (
            merchant: string,
            pivotColumnName: string,
        ): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            name: merchant,
            encode: {
                x: merchantField,
                // Dashboard pivoted encode key — absent on long-format rows
                y: pivotColumnName,
                tooltip: [pivotColumnName],
                seriesName: pivotColumnName,
            },
            pivotReference: {
                field: rateField,
                pivotValues: [{ field: merchantField, value: merchant }],
            },
        });

        const rows = [
            makeRow('河南新乡万德隆', 0.0112),
            makeRow('江西赣州宏昌', 0.3534),
            makeRow('河南郑州建业', 0.1259),
            makeRow('江苏淮安商联超市', 0.0654),
        ];

        const series = [
            makeSerie('河南新乡万德隆', `${rateField}_any_河南新乡万德隆`),
            makeSerie('江苏淮安商联超市', `${rateField}_any_江苏淮安商联超市`),
            makeSerie('河南郑州建业', `${rateField}_any_河南郑州建业`),
            makeSerie('江西赣州宏昌', `${rateField}_any_江西赣州宏昌`),
        ];

        // Long-format dataset: category column present (not wide-pivot)
        const datasetRows = rows.map((row) => ({
            [merchantField]: (row[merchantField] as { value: { raw: string } })
                .value.raw,
            [rateField]: (row[rateField] as { value: { raw: number } }).value
                .raw,
        }));

        const result = sortVerticalBarSeriesByBarTotals({
            series,
            rows,
            datasetRows,
            itemsMap: {},
            descending: true,
        });

        expect(result).toBeDefined();
        expect(result!.sortedCategoryLabels).toEqual([
            '江西赣州宏昌',
            '河南郑州建业',
            '江苏淮安商联超市',
            '河南新乡万德隆',
        ]);
        expect(result!.sortedSeries.map((s) => s.name)).toEqual([
            '江西赣州宏昌',
            '河南郑州建业',
            '江苏淮安商联超市',
            '河南新乡万德隆',
        ]);
    });

    test('orderedCategoryLabels align point labels with xAxis order when dataset stays unsorted', () => {
        const merchantField = 'merchant_name';
        const rateField = 'total_rate';

        const makeSerie = (
            merchant: string,
            pivotColumnName: string,
        ): EChartSeries => ({
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            name: merchant,
            encode: {
                x: merchantField,
                y: pivotColumnName,
                tooltip: [pivotColumnName],
                seriesName: pivotColumnName,
            },
            pivotReference: {
                field: rateField,
                pivotValues: [{ field: merchantField, value: merchant }],
            },
        });

        // Series already sorted descending (as BAR_TOTALS would leave them)
        const sortedSeries = [
            makeSerie('江西赣州宏昌', `${rateField}_any_江西赣州宏昌`),
            makeSerie('河南郑州建业', `${rateField}_any_河南郑州建业`),
            makeSerie('河南新乡万德隆', `${rateField}_any_河南新乡万德隆`),
        ];
        const orderedLabels = [
            '江西赣州宏昌',
            '河南郑州建业',
            '河南新乡万德隆',
        ];

        // Dataset still in original unsorted row order
        const rows: ResultRow[] = [
            {
                [merchantField]: {
                    value: {
                        raw: '河南新乡万德隆',
                        formatted: '河南新乡万德隆',
                    },
                },
                [rateField]: { value: { raw: 0.0112, formatted: '1.12%' } },
            },
            {
                [merchantField]: {
                    value: { raw: '江西赣州宏昌', formatted: '江西赣州宏昌' },
                },
                [rateField]: { value: { raw: 0.3534, formatted: '35.34%' } },
            },
            {
                [merchantField]: {
                    value: { raw: '河南郑州建业', formatted: '河南郑州建业' },
                },
                [rateField]: { value: { raw: 0.1259, formatted: '12.59%' } },
            },
        ];

        const applied = applyVerticalBarAxisSortSeriesData({
            layout: {
                flipAxes: false,
                xField: merchantField,
                yField: [rateField],
            },
            series: sortedSeries,
            rows,
            datasetRows: [],
            itemsMap: {},
            orderedCategoryLabels: orderedLabels,
        });

        expect(
            applied.map((s) => (s.data![0] as [unknown, unknown])[0]),
        ).toEqual(orderedLabels);
        expect(
            applied.map((s) => (s.data![0] as [unknown, unknown])[1]),
        ).toEqual([0.3534, 0.1259, 0.0112]);
    });

    test('applyVertical still injects single points when datasetRows empty but rows present', () => {
        const merchantField = 'merchant_name';
        const rateField = 'total_rate';
        const merchant = '江西赣州宏昌';
        const serie: EChartSeries = {
            type: CartesianSeriesType.BAR,
            connectNulls: true,
            name: merchant,
            encode: {
                x: merchantField,
                y: `${rateField}_any_${merchant}`,
                tooltip: [`${rateField}_any_${merchant}`],
                seriesName: `${rateField}_any_${merchant}`,
            },
            pivotReference: {
                field: rateField,
                pivotValues: [{ field: merchantField, value: merchant }],
            },
        };
        const rows: ResultRow[] = [
            {
                [merchantField]: {
                    value: { raw: merchant, formatted: merchant },
                },
                [rateField]: { value: { raw: 0.3534, formatted: '35.34%' } },
            },
        ];

        const applied = applyVerticalBarAxisSortSeriesData({
            layout: {
                flipAxes: false,
                xField: merchantField,
                yField: [rateField],
            },
            series: [serie],
            rows,
            datasetRows: [],
            itemsMap: {},
            orderedCategoryLabels: [merchant],
        });

        expect(applied[0].data).toEqual([[merchant, 0.3534]]);
    });
});

describe('shouldInjectSeriesCategoryAxis', () => {
    const cls3Field = 'btsl_zhengzhou_category_sales_cls3';
    const merchantField = 'btsl_zhengzhou_category_sales_merchant_name';
    const metricField = 'btsl_zhengzhou_category_sales_total_rate';

    const makeMerchantSerie = (merchant: string): EChartSeries => ({
        type: CartesianSeriesType.BAR,
        connectNulls: true,
        name: merchant,
        encode: {
            x: merchantField,
            y: `${metricField}.${merchantField}.${merchant}`,
            tooltip: [`${metricField}.${merchantField}.${merchant}`],
            seriesName: `${metricField}.${merchantField}.${merchant}`,
        },
        pivotReference: {
            field: metricField,
            pivotValues: [{ field: merchantField, value: merchant }],
        },
    });

    test('Shape A: xField=cls3 and pivot=merchant → do not inject series labels', () => {
        const series = [
            {
                ...makeMerchantSerie('江西赣州宏昌'),
                encode: {
                    ...makeMerchantSerie('江西赣州宏昌').encode!,
                    x: cls3Field,
                },
            },
            {
                ...makeMerchantSerie('河南郑州建业'),
                encode: {
                    ...makeMerchantSerie('河南郑州建业').encode!,
                    x: cls3Field,
                },
            },
        ];

        const datasetRows = [
            {
                [cls3Field]: '包装水',
                [merchantField]: '江西赣州宏昌',
                [metricField]: 0.35,
            },
            {
                [cls3Field]: '包装水',
                [merchantField]: '河南郑州建业',
                [metricField]: 0.12,
            },
        ];

        expect(
            shouldInjectSeriesCategoryAxis({
                layout: {
                    flipAxes: false,
                    xField: cls3Field,
                    yField: [metricField],
                },
                series,
                datasetRows,
                pivotDimensions: [merchantField],
            }),
        ).toBe(false);
    });

    test('Shape B: xField=merchant and pivot=merchant → inject series category axis', () => {
        const series = [
            makeMerchantSerie('江西赣州宏昌'),
            makeMerchantSerie('河南郑州建业'),
        ];

        expect(
            shouldInjectSeriesCategoryAxis({
                layout: {
                    flipAxes: false,
                    xField: merchantField,
                    yField: [metricField],
                },
                series,
                datasetRows: [
                    {
                        [merchantField]: '江西赣州宏昌',
                        [metricField]: 0.35,
                    },
                ],
                pivotDimensions: [merchantField],
            }),
        ).toBe(true);

        // Shape B descending apply keeps axis labels = series category order
        const sorted = sortVerticalBarSeriesByBarTotals({
            series,
            rows: [
                {
                    [merchantField]: {
                        value: {
                            raw: '河南郑州建业',
                            formatted: '河南郑州建业',
                        },
                    },
                    [metricField]: {
                        value: { raw: 0.1259, formatted: '12.59%' },
                    },
                },
                {
                    [merchantField]: {
                        value: {
                            raw: '江西赣州宏昌',
                            formatted: '江西赣州宏昌',
                        },
                    },
                    [metricField]: {
                        value: { raw: 0.3534, formatted: '35.34%' },
                    },
                },
            ],
            datasetRows: [],
            itemsMap: {},
            descending: true,
        });

        expect(sorted).toBeDefined();
        const orderedLabels = sorted!.sortedCategoryLabels;
        const applied = applyVerticalBarAxisSortSeriesData({
            layout: {
                flipAxes: false,
                xField: merchantField,
                yField: [metricField],
            },
            series: sorted!.sortedSeries,
            rows: [
                {
                    [merchantField]: {
                        value: {
                            raw: '河南郑州建业',
                            formatted: '河南郑州建业',
                        },
                    },
                    [metricField]: {
                        value: { raw: 0.1259, formatted: '12.59%' },
                    },
                },
                {
                    [merchantField]: {
                        value: {
                            raw: '江西赣州宏昌',
                            formatted: '江西赣州宏昌',
                        },
                    },
                    [metricField]: {
                        value: { raw: 0.3534, formatted: '35.34%' },
                    },
                },
            ],
            datasetRows: [],
            itemsMap: {},
            orderedCategoryLabels: orderedLabels,
        });

        expect(orderedLabels[0]).toBe('江西赣州宏昌');
        expect(
            applied.map((s) => (s.data![0] as [unknown, unknown])[0]),
        ).toEqual(orderedLabels);
        expect(
            applied.map((s) => (s.data![0] as [unknown, unknown])[1]),
        ).toEqual([0.3534, 0.1259]);
    });
});

describe('getSinglePointTimeAxisConfig', () => {
    const axisId = 'orders_order_date_month';

    const rowsWithValues = (values: string[]): ResultRow[] =>
        values.map((v) => ({
            [axisId]: { value: { raw: v, formatted: v.slice(0, 7) } },
        }));

    test('单月唯一 X 值时改为 category 并对齐刻度', () => {
        const config = getSinglePointTimeAxisConfig({
            axisId,
            rows: rowsWithValues(['2026-07-01']),
            axisType: 'time',
        });

        expect(config.axisType).toBe('category');
        expect(config.data).toEqual(['2026-07-01']);
        expect(config.axisTick).toEqual({
            alignWithLabel: true,
            interval: 0,
        });
        expect(config).toHaveProperty('minInterval', undefined);
    });

    test('多个不同月份时保持 time，不返回覆盖配置', () => {
        const config = getSinglePointTimeAxisConfig({
            axisId,
            rows: rowsWithValues(['2026-06-01', '2026-07-01']),
            axisType: 'time',
        });

        expect(config).toEqual({});
    });

    test('多行同一月份仍视为单点', () => {
        const config = getSinglePointTimeAxisConfig({
            axisId,
            rows: rowsWithValues(['2026-07-01', '2026-07-01', '2026-07-01']),
            axisType: 'time',
        });

        expect(config.axisType).toBe('category');
        expect(config.data).toEqual(['2026-07-01']);
    });

    test('有参考线时保持 time，避免参考线错位', () => {
        const config = getSinglePointTimeAxisConfig({
            axisId,
            rows: rowsWithValues(['2026-07-01']),
            axisType: 'time',
            hasReferenceLine: true,
        });

        expect(config).toEqual({});
    });

    test('非 time 轴不处理', () => {
        const config = getSinglePointTimeAxisConfig({
            axisId,
            rows: rowsWithValues(['2026-07-01']),
            axisType: 'category',
        });

        expect(config).toEqual({});
    });
});

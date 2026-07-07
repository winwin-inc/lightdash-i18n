import { CartesianSeriesType, type ResultRow } from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import { type InfiniteQueryResults } from '../useQueryResults';
import {
    getAxisDefaultMaxValue,
    getAxisDefaultMinValue,
    getMinAndMaxValues,
    sortFlipAxesWidePivotBarSeriesByBarTotals,
    sortLineSeriesByValue,
    type EChartSeries,
} from './useEchartsCartesianConfig';

vi.mock('./../../providers/TrackingProvider');

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

    test('should return undefined when flipAxes is disabled', () => {
        const result = sortFlipAxesWidePivotBarSeriesByBarTotals({
            layout: { ...layout, flipAxes: false },
            series: unsortedSeries,
            datasetRows,
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
});

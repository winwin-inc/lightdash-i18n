import { CartesianSeriesType, getItemMap, StackType } from '@lightdash/common';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../useFeatureFlagEnabled', () => ({
    useFeatureFlag: () => ({ data: { enabled: false } }),
    useFeatureFlagEnabled: () => false,
}));

import useCartesianChartConfig from './useCartesianChartConfig';
import {
    existingMixedSeries,
    expectedMixedSeriesMap,
    expectedMultiPivotedSeriesMap,
    expectedPivotedSeriesMap,
    expectedSimpleSeriesMap,
    explore,
    groupedMixedSeries,
    mergedMixedSeries,
    multiPivotSeriesMapArgs,
    pivotSeriesMapArgs,
    simpleSeriesMapArgs,
    useCartesianChartConfigParamsMock,
} from './useCartesianChartConfig.mock';
import {
    applyStackFromLayout,
    getExpectedSeriesMap,
    getSeriesGroupedByField,
    getStackSeriesSortDirection,
    getTooltipSortDirection,
    isStackEnabled,
    mergeExistingAndExpectedSeries,
    migrateLegacySeriesSortConfig,
    normalizeSeriesSortConfig,
    sortDimensions,
} from './utils';

describe('sortDimensions', () => {
    test('should not sort anything if no explore', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            undefined,
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual(dimensionIds);
    });

    test('should not sort anything if no dates', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual(dimensionIds);
    });

    test('should sort a single date', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_date_1',
            'dimension_boolean',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_date_1',
            'dimension_boolean',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual([
            'dimension_date_1',
            'dimension_string',
            'dimension_boolean',
        ]);
    });

    test('should sort dates based on columnOrder', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_date_1',
            'dimension_date_2',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_date_2',
            'dimension_date_1',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual([
            'dimension_date_2',
            'dimension_date_1',
            'dimension_string',
        ]);
    });

    test('should sort timestamp', () => {
        const dimensionIds = ['dimension_string', 'dimension_timestamp'];
        const columnOrder = ['dimension_string', 'dimension_timestamp'];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual([
            'dimension_timestamp',
            'dimension_string',
        ]);
    });
});

describe('stack helpers', () => {
    test('isStackEnabled should handle stack types', () => {
        expect(isStackEnabled(StackType.NORMAL)).toBe(true);
        expect(isStackEnabled(StackType.PERCENT)).toBe(true);
        expect(isStackEnabled(true)).toBe(true);
        expect(isStackEnabled(StackType.NONE)).toBe(false);
        expect(isStackEnabled(false)).toBe(false);
        expect(isStackEnabled(undefined)).toBe(false);
    });

    test('applyStackFromLayout should add stack to pivot series from layout', () => {
        const series = Object.values(expectedPivotedSeriesMap).map((s) => ({
            ...s,
            stack: undefined,
        }));

        const stacked = applyStackFromLayout(
            series,
            {
                stack: StackType.PERCENT,
                yField: ['my_metric', 'my_second_metric'],
            },
            ['dimension_x'],
        );

        expect(stacked.every((serie) => serie.stack !== undefined)).toBe(true);
        expect(
            stacked.every((serie) => serie.stack === serie.encode.yRef.field),
        ).toBe(true);
    });

    test('applyStackFromLayout should clear stack when layout stack is disabled', () => {
        const series = Object.values(expectedPivotedSeriesMap).map((s) => ({
            ...s,
            stack: s.encode.yRef.field,
        }));

        const unstacked = applyStackFromLayout(
            series,
            {
                stack: StackType.NONE,
                yField: ['my_metric', 'my_second_metric'],
            },
            ['dimension_x'],
        );

        expect(unstacked.every((serie) => serie.stack === undefined)).toBe(
            true,
        );
    });
});

describe('getExpectedSeriesMap', () => {
    test('should return series without pivot', () => {
        expect(getExpectedSeriesMap(simpleSeriesMapArgs)).toStrictEqual(
            expectedSimpleSeriesMap,
        );
    });
    test('should return series with pivot', () => {
        expect(getExpectedSeriesMap(pivotSeriesMapArgs)).toStrictEqual(
            expectedPivotedSeriesMap,
        );
    });
    test('should return series with multi pivot', () => {
        expect(getExpectedSeriesMap(multiPivotSeriesMapArgs)).toStrictEqual(
            expectedMultiPivotedSeriesMap,
        );
    });
});

describe('mergeExistingAndExpectedSeries', () => {
    test('should return empty list when expected series is empty', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: {},
                existingSeries: Object.values(expectedSimpleSeriesMap),
            }),
        ).toStrictEqual([]);
    });
    test('should return all expected series when existing series is empty', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedSimpleSeriesMap,
                existingSeries: [],
            }),
        ).toStrictEqual(Object.values(expectedSimpleSeriesMap));
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedPivotedSeriesMap,
                existingSeries: [],
            }),
        ).toStrictEqual(Object.values(expectedPivotedSeriesMap));
    });
    test('should merge stack from expected series when ids match', () => {
        const existingSeries = Object.values(expectedPivotedSeriesMap).map(
            (series) => ({ ...series, stack: undefined }),
        );
        const expectedWithStack = Object.fromEntries(
            Object.entries(expectedPivotedSeriesMap).map(([id, series]) => [
                id,
                { ...series, stack: series.encode.yRef.field },
            ]),
        );

        const merged = mergeExistingAndExpectedSeries({
            expectedSeriesMap: expectedWithStack,
            existingSeries,
        });

        expect(merged.every((serie) => serie.stack !== undefined)).toBe(true);
    });
});

describe('getSeriesGroupedByField', () => {
    test('should return series grouped by Y field', () => {
        expect(
            getSeriesGroupedByField(Object.values(mergedMixedSeries)),
        ).toStrictEqual(groupedMixedSeries);
    });
});

describe('useCartesianChartConfig', () => {
    test('should default series yAxisIndex to 0', () => {
        const { result } = renderHook(
            // @ts-expect-error partially mock params for hook
            () => useCartesianChartConfig(useCartesianChartConfigParamsMock),
        );

        const series = result.current.validConfig!.eChartsConfig.series!;

        expect(series.length).toBeGreaterThan(0);
        series.forEach((serie) => expect(serie.yAxisIndex).toBe(0));
    });

    test('should set undefined yAxisIndex to 0', () => {
        const seriesFromOldChart = [
            {
                type: CartesianSeriesType.BAR,
                encode: {
                    xRef: {
                        field: 'orders_customer_id',
                    },
                    yRef: {
                        field: 'orders_total_order_amount',
                    },
                },
                yAxisIndex: 1,
            },
            {
                type: CartesianSeriesType.BAR,
                encode: {
                    xRef: {
                        field: 'orders_customer_id',
                    },
                    yRef: {
                        field: 'orders_fulfillment_rate',
                    },
                },
            },
        ];

        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                initialChartConfig: {
                    ...useCartesianChartConfigParamsMock.initialChartConfig,

                    eChartsConfig: {
                        series: seriesFromOldChart,
                    },
                },
            }),
        );

        const series = result.current.validConfig!.eChartsConfig.series!;

        expect(series[0].yAxisIndex).toBe(1);
        expect(series[1].yAxisIndex).toBe(0);
    });
});

describe('series sort config', () => {
    const legacySeries = {
        type: CartesianSeriesType.BAR,
        encode: {
            xRef: { field: 'orders_customer_id' },
            yRef: { field: 'orders_total_order_amount' },
        },
        tooltipSortByValue: 'desc' as const,
    };

    test('migrateLegacySeriesSortConfig should backfill stackSeriesSortByValue from legacy tooltipSortByValue', () => {
        expect(migrateLegacySeriesSortConfig(legacySeries)).toEqual({
            ...legacySeries,
            tooltipSortByValue: 'desc',
            stackSeriesSortByValue: 'desc',
        });
    });

    test('normalizeSeriesSortConfig should not backfill stackSeriesSortByValue from tooltipSortByValue', () => {
        expect(normalizeSeriesSortConfig(legacySeries)).toEqual(legacySeries);
    });

    test('getStackSeriesSortDirection should read explicit stackSeriesSortByValue', () => {
        expect(
            getStackSeriesSortDirection([
                {
                    ...legacySeries,
                    stackSeriesSortByValue: 'asc',
                },
            ]),
        ).toBe('asc');
    });

    test('getStackSeriesSortDirection should not fall back to tooltipSortByValue at runtime', () => {
        // Legacy fallback is handled by migrateLegacySeriesSortConfig on load,
        // not by getStackSeriesSortDirection at runtime
        expect(getStackSeriesSortDirection([legacySeries])).toBe(undefined);
    });

    test('getTooltipSortDirection should only read tooltipSortByValue', () => {
        expect(
            getTooltipSortDirection([
                {
                    ...legacySeries,
                    stackSeriesSortByValue: 'asc',
                },
            ]),
        ).toBe('desc');
    });

    test('useCartesianChartConfig should normalize legacy sort config on load', () => {
        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                initialChartConfig: {
                    ...useCartesianChartConfigParamsMock.initialChartConfig,
                    eChartsConfig: {
                        series: [legacySeries],
                    },
                },
            }),
        );

        const series = result.current.validConfig!.eChartsConfig.series!;

        expect(series[0].tooltipSortByValue).toBe('desc');
        expect(series[0].stackSeriesSortByValue).toBe('desc');
    });

    test('should preserve stack from layout.stack when initial series lack stack field', async () => {
        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                pivotKeys: pivotSeriesMapArgs.pivotKeys,
                resultsData: {
                    ...pivotSeriesMapArgs.resultsData,
                    hasFetchedAllRows: true,
                    metricQuery: {
                        exploreName: '',
                        dimensions: ['my_dimension', 'dimension_x'],
                        metrics: ['my_metric', 'my_second_metric'],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                },
                initialChartConfig: {
                    layout: {
                        xField: 'my_dimension',
                        yField: ['my_metric', 'my_second_metric'],
                        stack: StackType.PERCENT,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'my_dimension' },
                                    yRef: {
                                        field: 'my_metric',
                                        pivotValues: [
                                            {
                                                field: 'dimension_x',
                                                value: 'a',
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
            }),
        );

        await waitFor(() => {
            const series = result.current.validConfig!.eChartsConfig.series!;
            expect(series.length).toBeGreaterThan(0);
            expect(series.every((serie) => serie.stack !== undefined)).toBe(
                true,
            );
        });
    });

    test('should rebuild stacked pivot series when eChartsConfig.series was stripped', async () => {
        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                pivotKeys: pivotSeriesMapArgs.pivotKeys,
                resultsData: {
                    ...pivotSeriesMapArgs.resultsData,
                    hasFetchedAllRows: true,
                    metricQuery: {
                        exploreName: '',
                        dimensions: ['my_dimension', 'dimension_x'],
                        metrics: ['my_metric', 'my_second_metric'],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                },
                initialChartConfig: {
                    layout: {
                        xField: 'my_dimension',
                        yField: ['my_metric', 'my_second_metric'],
                        stack: StackType.NORMAL,
                    },
                    eChartsConfig: {},
                },
            }),
        );

        await waitFor(() => {
            const series = result.current.validConfig!.eChartsConfig.series!;
            expect(series.length).toBeGreaterThan(0);
            expect(series.every((serie) => serie.stack !== undefined)).toBe(
                true,
            );
            expect(
                series.every((serie) => serie.stack === serie.encode.yRef.field),
            ).toBe(true);
        });
    });

    test('should propagate legacy sort config to expanded pivot series when layout.stack is set', async () => {
        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                pivotKeys: pivotSeriesMapArgs.pivotKeys,
                resultsData: {
                    ...pivotSeriesMapArgs.resultsData,
                    hasFetchedAllRows: true,
                    metricQuery: {
                        exploreName: '',
                        dimensions: ['my_dimension', 'dimension_x'],
                        metrics: ['my_metric', 'my_second_metric'],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                },
                initialChartConfig: {
                    layout: {
                        xField: 'my_dimension',
                        yField: ['my_metric', 'my_second_metric'],
                        stack: StackType.PERCENT,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                ...legacySeries,
                                encode: {
                                    xRef: { field: 'my_dimension' },
                                    yRef: {
                                        field: 'my_metric',
                                        pivotValues: [
                                            {
                                                field: 'dimension_x',
                                                value: 'a',
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
            }),
        );

        await waitFor(() => {
            const series = result.current.validConfig!.eChartsConfig.series!;
            expect(series.length).toBeGreaterThan(1);
            expect(
                series.every(
                    (serie) =>
                        serie.tooltipSortByValue === 'desc' &&
                        serie.stackSeriesSortByValue === 'desc',
                ),
            ).toBe(true);
        });
    });
});

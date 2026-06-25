import {
    CartesianSeriesType,
    ChartType,
    SupportedDbtAdapter,
    type Explore,
    type MetricQuery,
    type SavedChartDAO,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { buildQueryArgs } from './buildQueryArgs';

const savedChartWithPivotSeries: Pick<
    SavedChartDAO,
    'chartConfig' | 'pivotConfig'
> = {
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'payments_payment_method',
                yField: ['payments_total_revenue'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        encode: {
                            xRef: { field: 'payments_payment_method' },
                            yRef: {
                                field: 'payments_total_revenue',
                                pivotValues: [
                                    {
                                        field: 'orders_status',
                                        value: 'completed',
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
        },
    },
    pivotConfig: {
        columns: ['orders_status'],
    },
};

const savedChartWithoutPivotSeries: Pick<
    SavedChartDAO,
    'chartConfig' | 'pivotConfig'
> = {
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'payments_payment_method',
                yField: ['payments_total_revenue'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        encode: {
                            xRef: { field: 'payments_payment_method' },
                            yRef: { field: 'payments_total_revenue' },
                        },
                    },
                ],
            },
        },
    },
    pivotConfig: undefined,
};

const savedChartWithEmptySeriesAndPivotConfig: Pick<
    SavedChartDAO,
    'chartConfig' | 'pivotConfig'
> = {
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'payments_payment_method',
                yField: ['payments_total_revenue'],
            },
            eChartsConfig: {},
        },
    },
    pivotConfig: {
        columns: ['orders_status'],
    },
};

const computedMetricQuery: MetricQuery = {
    exploreName: 'payments',
    dimensions: ['payments_payment_method', 'orders_status'],
    metrics: ['payments_total_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};

const explore: Explore = {
    name: 'payments',
    label: 'Payments',
    tags: [],
    baseTable: 'payments',
    joinedTables: [],
    tables: {},
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const baseArgs = {
    activeFields: new Set([
        'payments_payment_method',
        'orders_status',
        'payments_total_revenue',
    ]),
    tableName: 'payments',
    projectUuid: 'project-uuid',
    explore,
    computedMetricQuery,
    parameters: {},
    minimal: false,
};

describe('buildQueryArgs', () => {
    test('should derive pivot configuration when feature flag is on or chart requires pivot', () => {
        const withFeatureFlag = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithPivotSeries,
            useSqlPivotResults: true,
            isEditMode: true,
        });
        const withPivotSeries = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithPivotSeries,
            useSqlPivotResults: false,
            isEditMode: true,
        });

        expect(withPivotSeries?.pivotConfiguration).toEqual(
            withFeatureFlag?.pivotConfiguration,
        );
    });

    test('should derive pivot configuration when eChartsConfig.series was stripped but pivotConfig exists', () => {
        const withFeatureFlag = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithEmptySeriesAndPivotConfig,
            useSqlPivotResults: true,
            isEditMode: true,
        });
        const withPivotConfigOnly = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithEmptySeriesAndPivotConfig,
            useSqlPivotResults: false,
            isEditMode: true,
        });

        expect(withPivotConfigOnly?.pivotConfiguration).toEqual(
            withFeatureFlag?.pivotConfiguration,
        );
    });

    test('should set pivotResults in view mode when pivotConfig exists without series', () => {
        const result = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithEmptySeriesAndPivotConfig,
            useSqlPivotResults: false,
            isEditMode: false,
            viewModeQueryArgs: { chartUuid: 'chart-uuid' },
        });

        expect(result?.pivotResults).toBe(true);
    });

    test('should not derive pivot when chart has no pivot series and feature flag is off', () => {
        const result = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithoutPivotSeries,
            useSqlPivotResults: false,
            isEditMode: true,
        });

        expect(result?.pivotConfiguration).toBeUndefined();
    });

    test('should set pivotResults in view mode when chart has pivot series', () => {
        const result = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithPivotSeries,
            useSqlPivotResults: false,
            isEditMode: false,
            viewModeQueryArgs: { chartUuid: 'chart-uuid' },
        });

        expect(result?.pivotResults).toBe(true);
        expect(result?.chartUuid).toBe('chart-uuid');
    });

    test('should not set pivotResults in edit mode', () => {
        const result = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithPivotSeries,
            useSqlPivotResults: false,
            isEditMode: true,
        });

        expect(result?.pivotResults).toBeUndefined();
    });

    test('should derive pivot configuration in edit mode when series stripped and pass fromDashboard', () => {
        const withFeatureFlag = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithEmptySeriesAndPivotConfig,
            useSqlPivotResults: true,
            isEditMode: true,
            fromDashboard: 'dashboard-uuid',
        });
        const withPivotConfigOnly = buildQueryArgs({
            ...baseArgs,
            savedChart: savedChartWithEmptySeriesAndPivotConfig,
            useSqlPivotResults: false,
            isEditMode: true,
            fromDashboard: 'dashboard-uuid',
        });

        expect(withPivotConfigOnly?.pivotConfiguration).toEqual(
            withFeatureFlag?.pivotConfiguration,
        );
        expect(withPivotConfigOnly?.fromDashboard).toBe('dashboard-uuid');
        expect(withPivotConfigOnly?.pivotResults).toBeUndefined();
    });
});

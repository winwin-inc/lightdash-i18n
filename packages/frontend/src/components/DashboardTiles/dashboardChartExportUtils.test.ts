import { ChartType, type ItemsMap, type SavedChart } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getChartExportCustomLabels,
    getChartExportShowTableNames,
} from './dashboardChartExportUtils';

const tableChart = {
    chartConfig: {
        type: ChartType.TABLE,
        config: {
            showTableNames: true,
            columns: {
                orders_amount: { name: 'Amount' },
            },
        },
    },
} as unknown as SavedChart;

const tableChartWithoutTableNames = {
    chartConfig: {
        type: ChartType.TABLE,
        config: {
            showTableNames: false,
            columns: {
                orders_amount: { name: 'Amount' },
            },
        },
    },
} as unknown as SavedChart;

const cartesianChart = {
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {},
    },
} as unknown as SavedChart;

const itemsMap = {
    orders_amount: {
        fieldType: 'metric',
        type: 'number',
        name: 'amount',
        table: 'orders',
        tableLabel: 'Orders',
        label: 'Amount',
        hidden: false,
        sql: '${TABLE}.amount',
    },
} as unknown as ItemsMap;

describe('dashboardChartExportUtils', () => {
    it('returns false for non-table charts', () => {
        expect(getChartExportShowTableNames(cartesianChart)).toBe(false);
    });

    it('returns configured showTableNames for table charts', () => {
        expect(getChartExportShowTableNames(tableChart)).toBe(true);
        expect(getChartExportShowTableNames(tableChartWithoutTableNames)).toBe(
            false,
        );
    });

    it('prefixes custom labels with table names when enabled', () => {
        expect(getChartExportCustomLabels(tableChart, itemsMap)).toEqual({
            orders_amount: 'Orders Amount',
        });
    });

    it('does not prefix custom labels when showTableNames is disabled', () => {
        expect(
            getChartExportCustomLabels(tableChartWithoutTableNames, itemsMap),
        ).toEqual({
            orders_amount: 'Amount',
        });
    });

    it('returns undefined custom labels for non-table charts', () => {
        expect(getChartExportCustomLabels(cartesianChart, itemsMap)).toBe(
            undefined,
        );
    });

    it('does not duplicate table name prefixes', () => {
        const chartWithPrefixedLabel = {
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: true,
                    columns: {
                        orders_amount: { name: 'Orders Amount' },
                    },
                },
            },
        } as unknown as SavedChart;

        expect(
            getChartExportCustomLabels(chartWithPrefixedLabel, itemsMap),
        ).toEqual({
            orders_amount: 'Orders Amount',
        });
    });

    it('returns empty object when there are no custom labels', () => {
        const chartWithoutCustomLabels = {
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: true,
                    columns: {},
                },
            },
        } as unknown as SavedChart;

        expect(
            getChartExportCustomLabels(chartWithoutCustomLabels, itemsMap),
        ).toEqual({});
    });

    it('returns raw custom labels when itemsMap is unavailable', () => {
        expect(getChartExportCustomLabels(tableChart)).toEqual({
            orders_amount: 'Amount',
        });
    });
});

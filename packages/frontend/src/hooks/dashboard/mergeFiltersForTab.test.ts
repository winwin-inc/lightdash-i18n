import {
    FilterOperator,
    UnitOfTime,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { emptyFilters } from './useDashboardFilters';
import { mergeFiltersForTab } from './useDashboardTabFilters';

const dimensionFilter = (
    id: string,
    operator: FilterOperator,
    values: unknown[],
): DashboardFilterRule => ({
    id,
    target: { fieldId: 'month_field', tableName: 'sales' },
    operator,
    values,
    label: undefined,
});

const last13Months = dimensionFilter('global-month', FilterOperator.IN_THE_PAST, [
    13,
]);
last13Months.settings = {
    unitOfTime: UnitOfTime.months,
    completed: false,
};

const betweenRange = dimensionFilter('tab-month', FilterOperator.IN_BETWEEN, [
    '2025-08-01',
    '2026-07-31',
]);

const globalFilters: DashboardFilters = {
    dimensions: [last13Months],
    metrics: [],
    tableCalculations: [],
};

const tabFilters: DashboardFilters = {
    dimensions: [betweenRange],
    metrics: [],
    tableCalculations: [],
};

describe('mergeFiltersForTab', () => {
    test('global disabled and tab enabled: only tab filters are applied', () => {
        const result = mergeFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: false,
            isTabFilterEnabled: true,
        });

        expect(result.dimensions.map((filter) => filter.id)).toEqual([
            'tab-month',
        ]);
        expect(result.dimensions[0].operator).toBe(FilterOperator.IN_BETWEEN);
    });

    test('global enabled and tab enabled: both layers are applied', () => {
        const result = mergeFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: true,
            isTabFilterEnabled: true,
        });

        expect(result.dimensions.map((filter) => filter.id)).toEqual([
            'global-month',
            'tab-month',
        ]);
    });

    test('global enabled and tab disabled: only global filters are applied', () => {
        const result = mergeFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: true,
            isTabFilterEnabled: false,
        });

        expect(result.dimensions.map((filter) => filter.id)).toEqual([
            'global-month',
        ]);
    });

    test('both disabled: no filters are applied', () => {
        const result = mergeFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: false,
            isTabFilterEnabled: false,
        });

        expect(result).toEqual(emptyFilters);
        expect(result.dimensions).toHaveLength(0);
    });

    test('disabled global temporary filters are not applied', () => {
        const result = mergeFiltersForTab({
            globalFilters,
            globalTemporaryFilters: {
                dimensions: [
                    dimensionFilter(
                        'global-temp',
                        FilterOperator.EQUALS,
                        ['x'],
                    ),
                ],
                metrics: [],
                tableCalculations: [],
            },
            tabFilters,
            isGlobalFilterEnabled: false,
            isTabFilterEnabled: true,
        });

        expect(result.dimensions.map((filter) => filter.id)).toEqual([
            'tab-month',
        ]);
    });
});

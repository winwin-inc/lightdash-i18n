import { FilterOperator, type DashboardFilters } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { emptyFilters } from './useDashboardFilters';
import { useDashboardTabFilters } from './useDashboardTabFilters';

const globalFilter = {
    id: 'global-1',
    target: { fieldId: 'orders_status' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
} as unknown as DashboardFilters['dimensions'][number];

const makeGlobalFilters = (): DashboardFilters => ({
    dimensions: [globalFilter],
    metrics: [],
    tableCalculations: [],
});

const renderTabFilters = (
    overrides: {
        dashboardFilters?: DashboardFilters;
        isFilterEnabled?: (tabUuid: string) => boolean;
    } = {},
) => {
    const props = {
        dashboard: undefined,
        dashboardFilters: overrides.dashboardFilters ?? makeGlobalFilters(),
        dashboardTemporaryFilters: emptyFilters,
        isGlobalFilterEnabled: true,
        isFilterEnabled: overrides.isFilterEnabled ?? (() => true),
    };

    return renderHook(
        (currentProps: typeof props) => useDashboardTabFilters(currentProps),
        {
            initialProps: props,
        },
    );
};

describe('useDashboardTabFilters.getMergedFiltersForTab', () => {
    it('returns a stable reference for the same inputs', () => {
        const { result } = renderTabFilters();

        const first = result.current.getMergedFiltersForTab('tab-1');
        const second = result.current.getMergedFiltersForTab('tab-1');

        expect(second).toBe(first);
    });

    it('recomputes when the global filters change', () => {
        const { result, rerender } = renderTabFilters();

        const before = result.current.getMergedFiltersForTab('tab-1');

        rerender({
            dashboard: undefined,
            dashboardFilters: makeGlobalFilters(),
            dashboardTemporaryFilters: emptyFilters,
            isGlobalFilterEnabled: true,
            isFilterEnabled: () => true,
        });

        const after = result.current.getMergedFiltersForTab('tab-1');

        expect(after).not.toBe(before);
        expect(after.dimensions).toHaveLength(1);
    });

    it('recomputes when the tab filters change', () => {
        const { result } = renderTabFilters();

        const before = result.current.getMergedFiltersForTab('tab-1');

        act(() => {
            result.current.addTabDimensionFilter(
                'tab-1',
                {
                    id: 'tab-1',
                    target: { fieldId: 'users_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['Alice'],
                } as unknown as DashboardFilters['dimensions'][number],
                false,
            );
        });

        const after = result.current.getMergedFiltersForTab('tab-1');

        expect(after).not.toBe(before);
        expect(after.dimensions).toHaveLength(2);
    });

    it('keeps separate results per tab', () => {
        const { result } = renderTabFilters();

        const tab1 = result.current.getMergedFiltersForTab('tab-1');
        const tab2 = result.current.getMergedFiltersForTab('tab-2');

        expect(tab1).not.toBe(tab2);
        expect(tab1).toEqual(tab2);
    });

    it('recomputes when the tab filter switch changes', () => {
        const isFilterEnabled = vi.fn(() => true);
        const { result, rerender } = renderTabFilters({ isFilterEnabled });

        const before = result.current.getMergedFiltersForTab('tab-1');

        isFilterEnabled.mockReturnValue(false);
        rerender({
            dashboard: undefined,
            dashboardFilters: makeGlobalFilters(),
            dashboardTemporaryFilters: emptyFilters,
            isGlobalFilterEnabled: true,
            isFilterEnabled,
        });

        const after = result.current.getMergedFiltersForTab('tab-1');

        expect(after).not.toBe(before);
        // tab 筛选器被关闭后只剩全局筛选器
        expect(after.dimensions).toHaveLength(1);
    });
});

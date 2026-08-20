import {
    FilterOperator,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import { shouldPersistSavedFilterOverride } from './useDashboardFilters';

const createFilter = (
    settings?: DashboardFilterRule['settings'],
): DashboardFilterRule => ({
    id: 'filter-1',
    label: 'Created month',
    operator: FilterOperator.IN_BETWEEN,
    target: {
        fieldId: 'orders_created_month',
        tableName: 'orders',
    },
    values: ['2025-08-01', '2026-07-31'],
    settings,
});

describe('shouldPersistSavedFilterOverride', () => {
    it('keeps dynamic-default overrides in the current browser session', () => {
        expect(
            shouldPersistSavedFilterOverride(
                createFilter({
                    dateRange: {
                        mode: 'dynamic',
                        start: {
                            direction: 'ago',
                            count: 12,
                            unit: UnitOfTime.months,
                        },
                        end: {
                            direction: 'ago',
                            count: 0,
                            unit: UnitOfTime.months,
                        },
                    },
                }),
            ),
        ).toBe(false);
    });

    it('continues to persist ordinary saved-filter overrides', () => {
        expect(shouldPersistSavedFilterOverride(createFilter())).toBe(true);
    });
});

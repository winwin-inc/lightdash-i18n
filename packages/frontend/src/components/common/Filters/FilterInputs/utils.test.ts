import {
    FilterOperator,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import { getDateRangeRuleWithFixedValues } from './utils';

describe('getDateRangeRuleWithFixedValues', () => {
    it('keeps viewer values and removes only the dynamic default', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            values: ['2026-01-01', '2026-03-31'],
            settings: {
                completed: true,
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
            },
        };

        expect(getDateRangeRuleWithFixedValues(rule)).toEqual({
            ...rule,
            settings: {
                completed: true,
            },
        });
    });

    it('returns fixed rules unchanged', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            values: ['2026-01-01', '2026-03-31'],
        };

        expect(getDateRangeRuleWithFixedValues(rule)).toBe(rule);
    });
});

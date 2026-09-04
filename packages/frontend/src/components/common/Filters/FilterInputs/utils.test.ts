import {
    FilterOperator,
    TimeFrames,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import {
    getDateRangeRuleWithFixedValues,
    prepareDashboardFilterRuleForQuery,
    resolveDisplayValues,
} from './utils';

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

describe('resolveDisplayValues', () => {
    it('clamps a 1-month-ago default to two months ago before the 4th', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            values: ['2025-07-01', '2026-06-30'],
            settings: {
                dateRange: {
                    mode: 'dynamic',
                    start: {
                        direction: 'ago',
                        count: 12,
                        unit: UnitOfTime.months,
                    },
                    end: {
                        direction: 'ago',
                        count: 1,
                        unit: UnitOfTime.months,
                    },
                },
            },
        };

        expect(resolveDisplayValues(rule, new Date('2026-07-03'))).toEqual([
            '2025-07-01',
            '2026-05-31',
        ]);
    });

    it('does not clamp when the dynamic max switch is off', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            dateRangeGranularity: TimeFrames.MONTH,
            values: ['2025-07-01', '2026-06-30'],
            settings: {
                dateRange: {
                    mode: 'dynamic',
                    start: {
                        direction: 'ago',
                        count: 12,
                        unit: UnitOfTime.months,
                    },
                    end: {
                        direction: 'ago',
                        count: 1,
                        unit: UnitOfTime.months,
                    },
                },
            },
        };

        expect(resolveDisplayValues(rule, new Date('2026-07-03'))).toEqual([
            '2025-07-01',
            '2026-06-30',
        ]);
    });
});

describe('prepareDashboardFilterRuleForQuery', () => {
    it('sends clamped values and removes the dynamic dateRange', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            values: ['2025-07-01', '2026-06-30'],
            settings: {
                dateRange: {
                    mode: 'dynamic',
                    start: {
                        direction: 'ago',
                        count: 12,
                        unit: UnitOfTime.months,
                    },
                    end: {
                        direction: 'ago',
                        count: 1,
                        unit: UnitOfTime.months,
                    },
                },
            },
        };

        const prepared = prepareDashboardFilterRuleForQuery(
            rule,
            new Date('2026-07-03'),
        );

        expect(prepared.values).toEqual(['2025-07-01', '2026-05-31']);
        expect(
            (prepared.settings as { dateRange?: unknown } | undefined)
                ?.dateRange,
        ).toBeUndefined();
    });
});

import {
    FilterOperator,
    TimeFrames,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import {
    clampFixedDateRangeValues,
    getDateRangeRuleWithFixedValues,
    getSingleDateRuleWithFixedValues,
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

describe('clampFixedDateRangeValues', () => {
    // 参考 2026-11-11（4 号已过）：动态最晚月 = 2026-10-31；
    // rolling N=24 → 下限 = 2026-10 月初往前 23 个月 = 2024-11-01
    const createRollingRule = (): DashboardFilterRule => ({
        id: 'filter-1',
        label: 'Created month',
        operator: FilterOperator.IN_BETWEEN,
        target: {
            fieldId: 'orders_created_month',
            tableName: 'orders',
        },
        dateRangeGranularity: TimeFrames.MONTH,
        enableDynamicMaxAllowedDate: true,
        rollingMinAllowedMonths: 24,
    });

    it('clamps both out-of-bounds ends to the resolved rolling window', () => {
        expect(
            clampFixedDateRangeValues(
                createRollingRule(),
                ['2024-01-15', '2027-01-01'],
                new Date('2026-11-11'),
            ),
        ).toEqual(['2024-11-01', '2026-10-31']);
    });

    it('returns in-bounds values unchanged without period realignment', () => {
        const values = ['2024-12-15', '2026-09-20'];
        expect(
            clampFixedDateRangeValues(
                createRollingRule(),
                values,
                new Date('2026-11-11'),
            ),
        ).toEqual(['2024-12-15', '2026-09-20']);
    });

    it('only rewrites the out-of-bounds end (rolling min)', () => {
        expect(
            clampFixedDateRangeValues(
                createRollingRule(),
                ['2024-06-15', '2026-09-20'],
                new Date('2026-11-11'),
            ),
        ).toEqual(['2024-11-01', '2026-09-20']);
    });

    it('keeps single-sided values untouched (D5)', () => {
        const startEmpty = ['', '2027-05-01'];
        expect(
            clampFixedDateRangeValues(
                createRollingRule(),
                startEmpty,
                new Date('2026-11-11'),
            ),
        ).toBe(startEmpty);

        const endEmpty = ['2024-01-01', ''];
        expect(
            clampFixedDateRangeValues(
                createRollingRule(),
                endEmpty,
                new Date('2026-11-11'),
            ),
        ).toBe(endEmpty);
    });

    it('does not clamp NOT_IN_BETWEEN (exclusion semantics)', () => {
        const values = ['2024-01-15', '2027-01-01'];
        expect(
            clampFixedDateRangeValues(
                {
                    ...createRollingRule(),
                    operator: FilterOperator.NOT_IN_BETWEEN,
                },
                values,
                new Date('2026-11-11'),
            ),
        ).toBe(values);
    });

    it('returns the same reference when the rule has no bounds config', () => {
        const values = ['2020-01-01', '2030-01-01'];
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created at',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_at',
                tableName: 'orders',
            },
        };
        expect(
            clampFixedDateRangeValues(rule, values, new Date('2026-11-11')),
        ).toBe(values);
    });

    it('treats an invalid rolling N as not configured', () => {
        const values = ['2020-01-01', '2030-01-01'];
        expect(
            clampFixedDateRangeValues(
                {
                    ...createRollingRule(),
                    rollingMinAllowedMonths: 0,
                    enableDynamicMaxAllowedDate: false,
                },
                values,
                new Date('2026-11-11'),
            ),
        ).toBe(values);
    });

    it('clamps day-granularity values to fixed min/max', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created at',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_at',
                tableName: 'orders',
            },
            minAllowedDate: '2025-06-15',
            maxAllowedDate: '2026-06-20',
        };
        expect(
            clampFixedDateRangeValues(rule, ['2025-01-01', '2027-01-01']),
        ).toEqual(['2025-06-15', '2026-06-20']);
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

    it('clamps fixed values to the resolved bounds for display (chip parity)', () => {
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
            values: ['2024-01-01', '2026-06-30'],
        };

        // 2026-07-03（4 号前）→ 动态最晚月 = 2026-05-31
        expect(resolveDisplayValues(rule, new Date('2026-07-03'))).toEqual([
            '2024-01-01',
            '2026-05-31',
        ]);
    });

    it('clamps fixed values to the rolling min for display', () => {
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
            rollingMinAllowedMonths: 24,
            values: ['2024-06-15', '2026-09-20'],
        };

        expect(resolveDisplayValues(rule, new Date('2026-11-11'))).toEqual([
            '2024-11-01',
            '2026-09-20',
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

    it('clamps out-of-bounds fixed values before they reach the query', () => {
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
            rollingMinAllowedMonths: 24,
            values: ['2024-01-15', '2027-01-01'],
        };

        const prepared = prepareDashboardFilterRuleForQuery(
            rule,
            new Date('2026-11-11'),
        );

        expect(prepared.values).toEqual(['2024-11-01', '2026-10-31']);
    });

    it('keeps in-bounds fixed values byte-identical in query params', () => {
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
            rollingMinAllowedMonths: 24,
            values: ['2024-12-15', '2026-09-20'],
        };

        const prepared = prepareDashboardFilterRuleForQuery(
            rule,
            new Date('2026-11-11'),
        );

        expect(prepared.values).toEqual(['2024-12-15', '2026-09-20']);
    });

    it('returns the exact same rule when nothing needs resolving or clamping', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            values: ['2024-12-15', '2026-09-20'],
        };

        expect(
            prepareDashboardFilterRuleForQuery(rule, new Date('2026-11-11')),
        ).toBe(rule);
    });
});

describe('single-date dynamic month equals', () => {
    const createSingleDateRule = (): DashboardFilterRule => ({
        id: 'filter-1',
        label: 'Created month',
        operator: FilterOperator.EQUALS,
        target: {
            fieldId: 'orders_created_month',
            tableName: 'orders',
        },
        values: ['2020-01'],
        settings: {
            singleDate: {
                mode: 'dynamic',
                preset: 'lastAvailableMonth',
            },
        },
    });

    it('resolveDisplayValues uses lastAvailableMonth before the 4th', () => {
        expect(
            resolveDisplayValues(
                createSingleDateRule(),
                new Date('2026-07-03'),
            ),
        ).toEqual(['2026-05']);
    });

    it('resolveDisplayValues uses lastAvailableMonth on or after the 4th', () => {
        expect(
            resolveDisplayValues(
                createSingleDateRule(),
                new Date('2026-07-04'),
            ),
        ).toEqual(['2026-06']);
    });

    it('getSingleDateRuleWithFixedValues strips singleDate', () => {
        const rule = createSingleDateRule();
        expect(getSingleDateRuleWithFixedValues(rule)).toEqual({
            ...rule,
            settings: {},
        });
    });

    it('prepareDashboardFilterRuleForQuery resolves and strips singleDate', () => {
        const prepared = prepareDashboardFilterRuleForQuery(
            createSingleDateRule(),
            new Date('2026-07-03'),
        );
        expect(prepared.values).toEqual(['2026-05']);
        expect(
            (prepared.settings as { singleDate?: unknown } | undefined)
                ?.singleDate,
        ).toBeUndefined();
    });
});

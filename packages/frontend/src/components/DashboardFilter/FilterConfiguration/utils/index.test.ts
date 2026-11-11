import dayjs from 'dayjs';

import {
    FilterOperator,
    TimeFrames,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';

import {
    applyExcludedValuesToFilterRule,
    hasFilterValueSet,
    hasSavedFilterValueChanged,
    mergeExcludedValues,
    mergePendingExcludedValueIntoRule,
    normalizeExcludedValues,
    removeValuesExcludedFromFilterRule,
    validateDashboardFilterDateRange,
} from './index';

const createFilterRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'filter-1',
    label: 'Test filter',
    target: {
        fieldId: 'brand',
        tableName: 'orders',
    },
    operator: FilterOperator.EQUALS,
    values: ['伊利股份', '蒙牛'],
    disabled: false,
    ...overrides,
});

describe('hasFilterValueSet', () => {
    it('requires only start date for fromStartToLatestMonth', () => {
        expect(
            hasFilterValueSet(
                createFilterRule({
                    operator: FilterOperator.FROM_START_TO_LATEST_MONTH,
                    values: ['2026-01'],
                }),
            ),
        ).toBe(true);
    });

    it('is false for fromStartToLatestMonth without start date', () => {
        expect(
            hasFilterValueSet(
                createFilterRule({
                    operator: FilterOperator.FROM_START_TO_LATEST_MONTH,
                    values: [],
                }),
            ),
        ).toBe(false);
    });

    it('still requires two values for inBetween', () => {
        expect(
            hasFilterValueSet(
                createFilterRule({
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2026-01'],
                }),
            ),
        ).toBe(false);
    });
});

describe('hasSavedFilterValueChanged', () => {
    it('detects a viewer value override without removing the dynamic default', () => {
        const original = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            values: ['2025-08-01', '2026-07-31'],
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
        });

        expect(
            hasSavedFilterValueChanged(original, {
                ...original,
                values: ['2026-01-01', '2026-03-31'],
            }),
        ).toBe(true);
    });

    it('detects a fixed viewer override even when values equal the saved snapshot', () => {
        const original = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            values: ['2025-08-01', '2026-07-31'],
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
        });

        expect(
            hasSavedFilterValueChanged(original, {
                ...original,
                settings: undefined,
            }),
        ).toBe(true);
    });
});

describe('normalizeExcludedValues', () => {
    it('trims and deduplicates excluded values', () => {
        expect(normalizeExcludedValues([' 伊利 ', '伊利', '', '蒙牛'])).toEqual(
            ['伊利', '蒙牛'],
        );
    });
});

describe('mergeExcludedValues', () => {
    it('merges pending excluded value with saved excluded values', () => {
        expect(mergeExcludedValues(['伊利'], '蒙牛')).toEqual(['伊利', '蒙牛']);
    });

    it('returns undefined when there are no excluded values', () => {
        expect(mergeExcludedValues(undefined, '   ')).toBeUndefined();
    });
});

describe('removeValuesExcludedFromFilterRule', () => {
    it('removes selected values that are excluded', () => {
        const result = removeValuesExcludedFromFilterRule(createFilterRule(), [
            '伊利股份',
        ]);

        expect(result.values).toEqual(['蒙牛']);
    });

    it('clears values when all selected values are excluded', () => {
        const result = removeValuesExcludedFromFilterRule(createFilterRule(), [
            '伊利股份',
            '蒙牛',
        ]);

        expect(result.values).toBeUndefined();
    });
});

describe('mergePendingExcludedValueIntoRule', () => {
    it('merges pending excluded values without removing selected values', () => {
        const result = mergePendingExcludedValueIntoRule(
            createFilterRule(),
            '梦龙',
        );

        expect(result.excludedValues).toEqual(['梦龙']);
        expect(result.values).toEqual(['伊利股份', '蒙牛']);
    });
});

describe('applyExcludedValuesToFilterRule', () => {
    it('merges pending excluded values and removes conflicting selected values', () => {
        const result = applyExcludedValuesToFilterRule(
            createFilterRule({ excludedValues: ['伊利股份'] }),
            '蒙牛',
        );

        expect(result.excludedValues).toEqual(['伊利股份', '蒙牛']);
        expect(result.values).toBeUndefined();
    });
});

describe('validateDashboardFilterDateRange', () => {
    it('returns start_after_end when start is more recent than end', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            settings: {
                dateRange: {
                    mode: 'dynamic',
                    start: {
                        direction: 'ago',
                        count: 1,
                        unit: UnitOfTime.months,
                    },
                    end: {
                        direction: 'ago',
                        count: 12,
                        unit: UnitOfTime.months,
                    },
                },
            },
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toEqual({ code: 'start_after_end' });
    });

    it('returns end_after_max when dynamic end exceeds rolling max', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
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
                        count: 0,
                        unit: UnitOfTime.months,
                    },
                },
            },
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-03-03'))
                ?.code,
        ).toBe('end_after_max');
    });

    it('skips rolling max validation when the switch is off', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
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
                        count: 0,
                        unit: UnitOfTime.months,
                    },
                },
            },
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-03-03')),
        ).toBeNull();
    });

    it('rejects a 1-month-ago end before the 4th (runtime caliber, P1-5)', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
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
        });

        // 2026-03-03（4 号前）：校验与运行时同口径（applyDataAvailabilityDelay=true）
        // → 最晚可选 = 2026-01-31，动态 end=2026-02-28 越界。
        // 旧口径（false）会在这里放行，导致每月 1–3 号保存与页面行为差 1 个月。
        const error = validateDashboardFilterDateRange(
            rule,
            new Date('2026-03-03'),
        );
        expect(error?.code).toBe('end_after_max');
        expect(
            error?.maxDate && dayjs(error.maxDate).format('YYYY-MM-DD'),
        ).toBe('2026-01-31');
    });

    it('passes when dynamic end is within rolling max', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
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
                        count: 2,
                        unit: UnitOfTime.months,
                    },
                },
            },
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-05-10')),
        ).toBeNull();
    });

    it('returns null for fixed values without any bounds config', () => {
        expect(
            validateDashboardFilterDateRange(
                createFilterRule({
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2026-01-01', '2026-03-31'],
                }),
                new Date('2026-07-10'),
            ),
        ).toBeNull();
    });

    it('validates fixed default values against the bounds (P1-5)', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2025-01-01',
            maxAllowedDate: '2026-06-30',
            values: ['2024-11-05', '2026-06-20'],
        });

        const error = validateDashboardFilterDateRange(
            rule,
            new Date('2026-07-10'),
        );
        expect(error?.code).toBe('start_before_min');
        expect(
            error?.minDate && dayjs(error.minDate).format('YYYY-MM-DD'),
        ).toBe('2025-01-01');
        expect(
            error?.maxDate && dayjs(error.maxDate).format('YYYY-MM-DD'),
        ).toBe('2026-06-30');
    });

    it('returns end_after_max for fixed values beyond the rolling window', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            values: ['2024-11-01', '2026-10-31'],
        });

        // 2026-07-03（4 号前）→ 最晚可选 = 2026-05-31
        const error = validateDashboardFilterDateRange(
            rule,
            new Date('2026-07-03'),
        );
        expect(error?.code).toBe('end_after_max');
        expect(
            error?.maxDate && dayjs(error.maxDate).format('YYYY-MM-DD'),
        ).toBe('2026-05-31');
    });

    it('passes fixed values inside the rolling window', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            values: ['2025-07-01', '2026-05-31'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-03')),
        ).toBeNull();
    });

    it('rejects rolling without any latest bound (rolling_requires_max)', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            rollingMinAllowedMonths: 24,
            values: ['2025-07-01', '2026-06-30'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toEqual({ code: 'rolling_requires_max' });
    });

    it('accepts rolling with a dynamic max bound', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            values: [],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toBeNull();
    });

    it('does not enforce the rolling gate for NOT_IN_BETWEEN', () => {
        const rule = createFilterRule({
            operator: FilterOperator.NOT_IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            rollingMinAllowedMonths: 24,
            values: ['2025-07-01', '2026-06-30'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toBeNull();
    });

    it('treats an invalid rolling N as not configured', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            rollingMinAllowedMonths: 0,
            values: ['2025-07-01', '2026-06-30'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toBeNull();
    });

    it('skips half-empty fixed values (hasFilterValueSet guards those)', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2025-01-01',
            maxAllowedDate: '2026-06-30',
            values: ['2024-11-05'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toBeNull();
    });

    it('returns end_after_max for current quarter vs last complete quarter', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.QUARTER,
            enableDynamicMaxAllowedDate: true,
            settings: {
                dateRange: {
                    mode: 'dynamic',
                    start: {
                        direction: 'ago',
                        count: 8,
                        unit: UnitOfTime.quarters,
                    },
                    end: {
                        direction: 'ago',
                        count: 0,
                        unit: UnitOfTime.quarters,
                    },
                },
            },
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-04-10'))
                ?.code,
        ).toBe('end_after_max');
    });
});

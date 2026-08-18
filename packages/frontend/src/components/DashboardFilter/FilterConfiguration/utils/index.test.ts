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
    validateDashboardFilterDynamicDateRange,
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

describe('validateDashboardFilterDynamicDateRange', () => {
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
            validateDashboardFilterDynamicDateRange(
                rule,
                new Date('2026-07-10'),
            ),
        ).toBe('start_after_end');
    });

    it('returns end_after_max when dynamic end exceeds rolling max', () => {
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
            validateDashboardFilterDynamicDateRange(
                rule,
                new Date('2026-03-03'),
            ),
        ).toBe('end_after_max');
    });

    it('passes when dynamic end is within rolling max', () => {
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
                        count: 2,
                        unit: UnitOfTime.months,
                    },
                },
            },
        });

        expect(
            validateDashboardFilterDynamicDateRange(
                rule,
                new Date('2026-05-10'),
            ),
        ).toBeNull();
    });

    it('returns null for fixed date mode', () => {
        expect(
            validateDashboardFilterDynamicDateRange(
                createFilterRule({
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2026-01-01', '2026-03-31'],
                }),
            ),
        ).toBeNull();
    });

    it('returns end_after_max for current quarter vs last complete quarter', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.QUARTER,
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
            validateDashboardFilterDynamicDateRange(
                rule,
                new Date('2026-04-10'),
            ),
        ).toBe('end_after_max');
    });
});

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

    it('passes the standard dynamic default before the 4th (lenient caliber, P1-2)', () => {
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

        // 2026-03-03（4 号前）：动态默认用从宽口径（applyDataAvailabilityDelay=false）
        // → 最晚可选 = 2026-02-28，动态 end=2026-02-28 界内，放行保存。
        // 修复前（运行时口径）每月 1–3 号标准动态默认必被误拦（P1-2），
        // 与验收 §8.6「1–3 号与 4 号后行为一致」冲突；运行时展示/查询仍按
        // 运行时口径自行钳制。
        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-03-03')),
        ).toBeNull();
        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-03-04')),
        ).toBeNull();
    });

    it('still rejects dynamic defaults outside the rolling window (lenient caliber)', () => {
        // rolling N=6：窗口最早月被锚定在最晚可选月前推 5 个月；切到动态时
        // seed 的默认 start=12 个月前落在窗口外，需作者手动改小 start ——
        // 从宽口径下依旧拒绝（这是真实的永久越界，不是月初误拦）
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 6,
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

        // 2026-03-03（4 号前）：从宽口径 → 最晚可选 = 2026-02-28，
        // rolling 下限 = 2026-02-01 前推 5 个月 = 2025-09-01；
        // 动态 start = 2025-03-01 越界
        const error = validateDashboardFilterDateRange(
            rule,
            new Date('2026-03-03'),
        );
        expect(error?.code).toBe('start_before_min');
        expect(
            error?.minDate && dayjs(error.minDate).format('YYYY-MM'),
        ).toBe('2025-09');
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

    it('passes fixed values inside the static bounds (fixed mode)', () => {
        const rule = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2024-11-01',
            maxAllowedDate: '2026-05-31',
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
            settings: { dateRange: { mode: 'dynamic' } },
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
            settings: { dateRange: { mode: 'dynamic' } },
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
            settings: { dateRange: { mode: 'dynamic' } },
            values: ['2025-07-01', '2026-06-30'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toBeNull();
    });

    it('skips selectable-bounds checks for NOT_IN_BETWEEN (D5/P2-2)', () => {
        // 排除区间落在可选范围外是合法配置（如「排除 2020 年以前」）；
        // 运行时不钳制 NOT_IN_BETWEEN，保存校验也不按可选范围拦截
        const rule = createFilterRule({
            operator: FilterOperator.NOT_IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2025-01-01',
            maxAllowedDate: '2026-06-30',
            values: ['2020-01-01', '2024-12-31'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toBeNull();
    });

    it('still checks start_after_end for NOT_IN_BETWEEN', () => {
        const rule = createFilterRule({
            operator: FilterOperator.NOT_IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            values: ['2026-06-30', '2025-07-01'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-07-10')),
        ).toEqual({ code: 'start_after_end' });
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

    it('validates timestamp fixed values against the bounds (P3-5)', () => {
        // 修复前：resolveDateRangeValues 对固定值用 YYYY-MM-DD 严格解析，
        // ISO 时间串判为无效 → timestamp 固定默认值完全不参与保存校验
        const outOfBounds = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.DAY,
            minAllowedDate: '2025-06-01',
            maxAllowedDate: '2026-05-31',
            values: [
                '2025-07-01T10:30:00+08:00',
                '2026-07-15T08:15:00+08:00',
            ],
        });
        expect(
            validateDashboardFilterDateRange(
                outOfBounds,
                new Date('2026-07-10'),
            )?.code,
        ).toBe('end_after_max');

        const inBounds = createFilterRule({
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.DAY,
            minAllowedDate: '2025-06-01',
            maxAllowedDate: '2026-05-31',
            values: [
                '2025-07-01T10:30:00+08:00',
                '2026-05-01T08:15:00+08:00',
            ],
        });
        expect(
            validateDashboardFilterDateRange(inBounds, new Date('2026-07-10')),
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

    // ── 单值月份「是」：动态默认与固定值的可选范围校验 ──
    it('EQUALS dynamic rejects rolling without any latest bound', () => {
        const rule = createFilterRule({
            operator: FilterOperator.EQUALS,
            rollingMinAllowedMonths: 12,
            settings: {
                singleDate: { mode: 'dynamic', preset: 'lastAvailableMonth' },
            },
            values: ['2026-10'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-11-11')),
        ).toEqual({ code: 'rolling_requires_max' });
    });

    it('EQUALS dynamic preset passes against the runtime window (N=1, before the 4th)', () => {
        // 2026-11-02（4 号前）：预设 = 上上月（2026-09）；运行时窗口
        // N=1 → [2026-09-01, 2026-09-30]，预设落在窗口内，不得误拦
        const rule = createFilterRule({
            operator: FilterOperator.EQUALS,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 1,
            settings: {
                singleDate: { mode: 'dynamic', preset: 'lastAvailableMonth' },
            },
            values: ['2026-09'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-11-02')),
        ).toBeNull();
    });

    it('EQUALS fixed value beyond static latest is rejected', () => {
        const rule = createFilterRule({
            operator: FilterOperator.EQUALS,
            minAllowedDate: '2025-01-01',
            maxAllowedDate: '2026-03-31',
            values: ['2026-10'],
        });

        const error = validateDashboardFilterDateRange(
            rule,
            new Date('2026-11-11'),
        );
        expect(error?.code).toBe('end_after_max');
    });

    it('EQUALS without any bounds config skips validation', () => {
        const rule = createFilterRule({
            operator: FilterOperator.EQUALS,
            values: ['2099-01'],
        });

        expect(
            validateDashboardFilterDateRange(rule, new Date('2026-11-11')),
        ).toBeNull();
    });
});

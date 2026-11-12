import {
    FilterOperator,
    TimeFrames,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { stripDisallowedDynamicDateRange } from './dateRangeMode';
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
        settings: { dateRange: { mode: 'dynamic' } },
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
        // 固定模式：固定默认值 + 静态最晚边界 → chip 显示钳后值（与查询一致）
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            dateRangeGranularity: TimeFrames.MONTH,
            maxAllowedDate: '2026-05-31',
            values: ['2024-01-01', '2026-06-30'],
        };

        expect(resolveDisplayValues(rule, new Date('2026-07-03'))).toEqual([
            '2024-01-01',
            '2026-05-31',
        ]);
    });

    it('clamps fixed values to the static min for display', () => {
        // 固定模式：静态最早边界钳制固定默认值的开始（归属隔离后 rolling 只在动态模式）
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2024-11-01',
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
        // 固定模式：固定默认值 + 静态最早/最晚边界（新归属模型下 rolling 只在动态模式）
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2024-11-01',
            maxAllowedDate: '2026-10-31',
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
            minAllowedDate: '2024-11-01',
            maxAllowedDate: '2026-10-31',
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

describe('clampFixedDateRangeValues — timestamp values (P1-1)', () => {
    // 日粒度（未配置 dateRangeGranularity）+ 固定 min/max 的 timestamp 筛选器：
    // 夹紧端必须保留时间部分，不能截成 YYYY-MM-DD（否则 end 按 00:00 比较、
    // 丢当天数据，跨 tab 同步还会把截断值写回存储）
    const createTimestampRule = (): DashboardFilterRule => ({
        id: 'filter-ts',
        label: 'Created at',
        operator: FilterOperator.IN_BETWEEN,
        target: {
            fieldId: 'orders_created_at',
            tableName: 'orders',
        },
        minAllowedDate: '2025-06-01',
        maxAllowedDate: '2026-05-31',
    });

    it('keeps the time part on clamped out-of-bounds timestamp ends', () => {
        expect(
            clampFixedDateRangeValues(
                createTimestampRule(),
                ['2025-07-01T10:30:00+08:00', '2026-07-15T08:15:00+08:00'],
                new Date('2026-11-11'),
            ),
        ).toEqual([
            '2025-07-01T10:30:00+08:00',
            dayjs('2026-05-31')
                .endOf('day')
                .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ]);
    });

    it('keeps the time part on a clamped out-of-bounds timestamp start', () => {
        expect(
            clampFixedDateRangeValues(
                createTimestampRule(),
                ['2024-01-01T10:30:00+08:00', '2026-04-15T08:15:00+08:00'],
                new Date('2026-11-11'),
            ),
        ).toEqual([
            dayjs('2025-06-01')
                .startOf('day')
                .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
            '2026-04-15T08:15:00+08:00',
        ]);
    });

    it('returns in-bounds timestamp values unchanged', () => {
        const values = [
            '2025-07-01T10:30:00+08:00',
            '2026-05-01T08:15:00+08:00',
        ];
        expect(
            clampFixedDateRangeValues(
                createTimestampRule(),
                values,
                new Date('2026-11-11'),
            ),
        ).toEqual(values);
    });
});

describe('stripDisallowedDynamicDateRange (P2-4)', () => {
    const dynamicSettings = {
        dateRange: {
            mode: 'dynamic' as const,
            start: { direction: 'ago' as const, count: 12 },
            end: { direction: 'ago' as const, count: 1 },
        },
    };

    it('strips dynamic dateRange residue for day granularity', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created at',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_at',
                tableName: 'orders',
            },
            values: ['2026-01-01', '2026-03-31'],
            dateRangeGranularity: TimeFrames.DAY,
            settings: dynamicSettings,
        };
        expect(stripDisallowedDynamicDateRange(rule)).toEqual({
            ...rule,
            settings: undefined,
        });
    });

    it('strips for year granularity but keeps other settings', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created year',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_year',
                tableName: 'orders',
            },
            values: ['2025-01-01', '2026-12-31'],
            dateRangeGranularity: TimeFrames.YEAR,
            settings: { ...dynamicSettings, completed: true },
        };
        expect(stripDisallowedDynamicDateRange(rule)).toEqual({
            ...rule,
            settings: { completed: true },
        });
    });

    it('keeps dynamic dateRange for month granularity (allowed)', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            values: ['2026-01-01', '2026-03-31'],
            dateRangeGranularity: TimeFrames.MONTH,
            settings: dynamicSettings,
        };
        expect(stripDisallowedDynamicDateRange(rule)).toBe(rule);
    });

    it('strips static earliest in dynamic mode (ownership to rolling)', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: { fieldId: 'orders_created_month', tableName: 'orders' },
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            minAllowedDate: '2024-01-01',
            settings: dynamicSettings,
        };
        const next = stripDisallowedDynamicDateRange(rule);
        expect(next.minAllowedDate).toBeUndefined();
        expect(next.rollingMinAllowedMonths).toBe(24);
        expect(next.enableDynamicMaxAllowedDate).toBe(true);
    });

    it('strips fixed latest in dynamic mode when dynamic max is on', () => {
        // 固定最晚会静默覆盖动态上限（fixedMax ?? dynamicMax），二者不能共存
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: { fieldId: 'orders_created_month', tableName: 'orders' },
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 12,
            maxAllowedDate: '2026-03-31',
            settings: dynamicSettings,
        };
        const next = stripDisallowedDynamicDateRange(rule);
        expect(next.maxAllowedDate).toBeUndefined();
        expect(next.enableDynamicMaxAllowedDate).toBe(true);
        expect(next.rollingMinAllowedMonths).toBe(12);
    });

    it('strips rolling fields in fixed mode (static constraints only)', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created month',
            operator: FilterOperator.IN_BETWEEN,
            target: { fieldId: 'orders_created_month', tableName: 'orders' },
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            settings: { dateRange: { mode: 'fixed' } },
            minAllowedDate: '2025-01-01',
            maxAllowedDate: '2026-03-31',
        };
        const next = stripDisallowedDynamicDateRange(rule);
        expect(next.rollingMinAllowedMonths).toBeUndefined();
        expect(next.enableDynamicMaxAllowedDate).toBeUndefined();
        expect(next.minAllowedDate).toBe('2025-01-01');
        expect(next.maxAllowedDate).toBe('2026-03-31');
    });

    it('treats missing granularity as day and strips residue', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created at',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_at',
                tableName: 'orders',
            },
            values: ['2026-01-01', '2026-03-31'],
            settings: dynamicSettings,
        };
        expect(stripDisallowedDynamicDateRange(rule).settings).toBeUndefined();
    });

    it('returns the same reference when there is nothing to strip', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Created at',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_at',
                tableName: 'orders',
            },
            values: ['2026-01-01', '2026-03-31'],
            dateRangeGranularity: TimeFrames.DAY,
            settings: { completed: true },
        };
        expect(stripDisallowedDynamicDateRange(rule)).toBe(rule);
    });

    // ── 单值月份「是」：模式看 singleDate，不携带 dateRangeGranularity ──
    it('EQUALS dynamic keeps rolling/dynamic-max, strips static earliest + dateRange residue', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Order month',
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'orders_month', tableName: 'orders' },
            values: ['2026-10'],
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 12,
            minAllowedDate: '2024-01-01',
            settings: {
                singleDate: { mode: 'dynamic', preset: 'lastAvailableMonth' },
                dateRange: { mode: 'dynamic' },
            },
        };
        const next = stripDisallowedDynamicDateRange(rule);
        // 动态约束保留；静态最早 / dateRange 残留剥离；singleDate 保留
        expect(next.rollingMinAllowedMonths).toBe(12);
        expect(next.enableDynamicMaxAllowedDate).toBe(true);
        expect(next.minAllowedDate).toBeUndefined();
        expect(next.settings?.singleDate).toEqual({
            mode: 'dynamic',
            preset: 'lastAvailableMonth',
        });
        expect(next.settings?.dateRange).toBeUndefined();
    });

    it('EQUALS fixed strips rolling/dynamic-max residue, keeps static bounds', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Order month',
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'orders_month', tableName: 'orders' },
            values: ['2026-10'],
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            minAllowedDate: '2025-01-01',
            maxAllowedDate: '2026-03-31',
            settings: { dateRange: { mode: 'dynamic' } },
        };
        const next = stripDisallowedDynamicDateRange(rule);
        expect(next.rollingMinAllowedMonths).toBeUndefined();
        expect(next.enableDynamicMaxAllowedDate).toBeUndefined();
        expect(next.minAllowedDate).toBe('2025-01-01');
        expect(next.maxAllowedDate).toBe('2026-03-31');
        expect(next.settings).toBeUndefined();
    });

    it('EQUALS dynamic strips fixed latest when dynamic max is on', () => {
        // 固定最晚会静默覆盖动态上限，与区间规则同构不共存
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Order month',
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'orders_month', tableName: 'orders' },
            values: ['2026-10'],
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 12,
            maxAllowedDate: '2026-03-31',
            settings: {
                singleDate: { mode: 'dynamic', preset: 'lastAvailableMonth' },
            },
        };
        const next = stripDisallowedDynamicDateRange(rule);
        expect(next.maxAllowedDate).toBeUndefined();
        expect(next.enableDynamicMaxAllowedDate).toBe(true);
    });

    it('EQUALS without constraints returns the same reference', () => {
        const rule: DashboardFilterRule = {
            id: 'filter-1',
            label: 'Order month',
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'orders_month', tableName: 'orders' },
            values: ['2026-10'],
            settings: { completed: true },
        };
        expect(stripDisallowedDynamicDateRange(rule)).toBe(rule);
    });
});

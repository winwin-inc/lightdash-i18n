import { TimeFrames, UnitOfTime } from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import {
    DYNAMIC_DATE_RANGE_DEFAULT_END,
    DYNAMIC_DATE_RANGE_DEFAULT_START,
    buildDateRangeModeChangeRule,
    getLockedDynamicUnit,
    isDateRangeMode,
    isDynamicDateRangeAllowed,
    normalizeDateRangeSetting,
    parseDateRangeCount,
    resolveDateRangeMode,
    resolveDynamicDateRangeValues,
} from './dateRangeMode';

// stripDisallowedDynamicDateRange 的用例见 ../components 侧
// FilterInputs/utils.test.ts 的 describe('stripDisallowedDynamicDateRange')
describe('dateRangeMode', () => {
    describe('isDateRangeMode', () => {
        it('accepts fixed / dynamic and rejects anything else', () => {
            expect(isDateRangeMode('fixed')).toBe(true);
            expect(isDateRangeMode('dynamic')).toBe(true);
            expect(isDateRangeMode('auto')).toBe(false);
            expect(isDateRangeMode(null)).toBe(false);
        });
    });

    describe('isDynamicDateRangeAllowed', () => {
        it('allows month / quarter only', () => {
            expect(isDynamicDateRangeAllowed(TimeFrames.MONTH)).toBe(true);
            expect(isDynamicDateRangeAllowed(TimeFrames.QUARTER)).toBe(true);
            expect(isDynamicDateRangeAllowed(TimeFrames.DAY)).toBe(false);
            expect(isDynamicDateRangeAllowed(TimeFrames.YEAR)).toBe(false);
        });
    });

    describe('getLockedDynamicUnit', () => {
        it('locks month / quarter and leaves day / year unlocked', () => {
            expect(getLockedDynamicUnit(TimeFrames.MONTH)).toBe(
                UnitOfTime.months,
            );
            expect(getLockedDynamicUnit(TimeFrames.QUARTER)).toBe(
                UnitOfTime.quarters,
            );
            expect(getLockedDynamicUnit(TimeFrames.DAY)).toBeUndefined();
            expect(getLockedDynamicUnit(TimeFrames.YEAR)).toBeUndefined();
        });
    });

    describe('resolveDateRangeMode', () => {
        it('keeps dynamic mode on month granularity', () => {
            expect(
                resolveDateRangeMode({ mode: 'dynamic' }, TimeFrames.MONTH),
            ).toBe('dynamic');
        });

        it('forces fixed mode when the granularity disallows dynamic', () => {
            // 存量「日粒度 + 动态 settings」在 UI 上按固定日期呈现（M1/清理语义）
            expect(
                resolveDateRangeMode({ mode: 'dynamic' }, TimeFrames.DAY),
            ).toBe('fixed');
        });

        it('defaults to fixed when no settings or invalid stored mode', () => {
            expect(resolveDateRangeMode(undefined, TimeFrames.MONTH)).toBe(
                'fixed',
            );
            expect(
                resolveDateRangeMode(
                    { mode: 'auto' as 'dynamic' },
                    TimeFrames.MONTH,
                ),
            ).toBe('fixed');
        });
    });

    describe('parseDateRangeCount', () => {
        it('passes finite numbers through', () => {
            expect(parseDateRangeCount(12)).toBe(12);
            expect(parseDateRangeCount(0)).toBe(0);
        });

        it('parses numeric strings and falls back to 1', () => {
            expect(parseDateRangeCount('7')).toBe(7);
            expect(parseDateRangeCount('abc')).toBe(1);
            expect(parseDateRangeCount(undefined)).toBe(1);
            expect(parseDateRangeCount(Number.NaN)).toBe(1);
        });
    });

    describe('normalizeDateRangeSetting', () => {
        it('forces direction=ago and the locked unit', () => {
            const next = normalizeDateRangeSetting(
                {
                    mode: 'dynamic',
                    start: { direction: 'later', count: 3, unit: 'days' },
                    end: { direction: 'ago', count: 1, unit: 'days' },
                },
                UnitOfTime.months,
            );
            expect(next.start).toEqual({
                direction: 'ago',
                count: 3,
                unit: UnitOfTime.months,
            });
            expect(next.end).toEqual({
                direction: 'ago',
                count: 1,
                unit: UnitOfTime.months,
            });
        });

        it('falls back to the default unit when the bound has none', () => {
            const next = normalizeDateRangeSetting(
                { mode: 'dynamic', start: { count: 5 } },
                undefined,
            );
            expect(next.start?.unit).toBe(
                DYNAMIC_DATE_RANGE_DEFAULT_START.unit,
            );
        });
    });

    describe('resolveDynamicDateRangeValues', () => {
        it('returns two month-aligned date strings with start before end', () => {
            const values = resolveDynamicDateRangeValues(
                {
                    mode: 'dynamic',
                    start: { direction: 'ago', count: 12, unit: 'months' },
                    end: { direction: 'ago', count: 1, unit: 'months' },
                },
                TimeFrames.MONTH,
            );
            expect(values).toHaveLength(2);
            expect(values[0]).toMatch(/^\d{4}-\d{2}-01$/);
            expect(values[1]).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/);
            expect(values[0] < values[1]).toBe(true);
        });
    });

    describe('buildDateRangeModeChangeRule', () => {
        it('seeds the documented 12 → 1 month defaults when switching to dynamic without prior config', () => {
            const next = buildDateRangeModeChangeRule(
                { values: [] },
                'dynamic',
                TimeFrames.MONTH,
            );
            expect(next.settings?.dateRange?.mode).toBe('dynamic');
            expect(next.settings?.dateRange?.start).toEqual({
                direction: 'ago',
                count: DYNAMIC_DATE_RANGE_DEFAULT_START.count,
                unit: UnitOfTime.months,
            });
            expect(next.settings?.dateRange?.end).toEqual({
                direction: 'ago',
                count: DYNAMIC_DATE_RANGE_DEFAULT_END.count,
                unit: UnitOfTime.months,
            });
            expect(next.values).toHaveLength(2);
        });

        it('keeps existing counts and re-resolves values when dynamic config already exists', () => {
            const next = buildDateRangeModeChangeRule(
                {
                    values: [],
                    settings: {
                        dateRange: {
                            mode: 'dynamic',
                            start: {
                                direction: 'ago',
                                count: 23,
                                unit: 'months',
                            },
                            end: { direction: 'ago', count: 1, unit: 'months' },
                        },
                    },
                },
                'dynamic',
                TimeFrames.MONTH,
            );
            expect(next.settings?.dateRange?.start?.count).toBe(23);
            expect(next.settings?.dateRange?.end?.count).toBe(1);
            expect(next.values).toHaveLength(2);
        });

        it('locks the unit to quarters on quarter granularity', () => {
            const next = buildDateRangeModeChangeRule(
                { values: [] },
                'dynamic',
                TimeFrames.QUARTER,
            );
            expect(next.settings?.dateRange?.start?.unit).toBe(
                UnitOfTime.quarters,
            );
            expect(next.settings?.dateRange?.end?.unit).toBe(
                UnitOfTime.quarters,
            );
        });

        it('drops only dateRange when switching to fixed, preserving other settings keys and values', () => {
            const rule = {
                values: ['2026-01-01', '2026-06-30'],
                settings: {
                    dateRange: { mode: 'dynamic' as const },
                    singleDate: { mode: 'dynamic' as const },
                    unitOfTime: 'months' as const,
                },
            };
            const next = buildDateRangeModeChangeRule(
                rule,
                'fixed',
                TimeFrames.MONTH,
            );
            expect(next.settings).toEqual({
                singleDate: { mode: 'dynamic' },
                unitOfTime: 'months',
            });
            // 固定模式的既有取值原样保留，驱动固定 picker
            expect(next.values).toEqual(['2026-01-01', '2026-06-30']);
        });
    });
});

import { FilterOperator, TimeFrames } from '@lightdash/common';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

import {
    DATA_MONTH_AVAILABLE_FROM_DAY,
    clampDateRangeValuesToBounds,
    getDashboardFilterDatePickerBounds,
    getDynamicMaxAllowedDate,
    getLastAvailableMonth,
    resolveRuleBounds,
} from './filterDateUtils';

dayjs.extend(quarterOfYear);

describe('getDynamicMaxAllowedDate', () => {
    it('returns end of two months ago before the 4th', () => {
        const ref = dayjs('2026-03-03');
        expect(getDynamicMaxAllowedDate(TimeFrames.MONTH, ref)).toEqual(
            dayjs('2026-01-31').endOf('day').toDate(),
        );
    });

    it('returns end of last month on or after the 4th', () => {
        const ref = dayjs('2026-03-04');
        expect(getDynamicMaxAllowedDate(TimeFrames.MONTH, ref)).toEqual(
            dayjs('2026-02-28').endOf('day').toDate(),
        );
    });

    it('returns end of last month before the 4th when data availability delay is off', () => {
        const ref = dayjs('2026-03-03');
        expect(getDynamicMaxAllowedDate(TimeFrames.MONTH, ref, false)).toEqual(
            dayjs('2026-02-28').endOf('day').toDate(),
        );
    });

    it('returns end of the most recent complete quarter', () => {
        const ref = dayjs('2026-04-10');
        expect(getDynamicMaxAllowedDate(TimeFrames.QUARTER, ref)).toEqual(
            dayjs('2026-03-31').endOf('day').toDate(),
        );
    });

    it('returns undefined for day granularity', () => {
        expect(
            getDynamicMaxAllowedDate(TimeFrames.DAY, dayjs('2026-03-10')),
        ).toBeUndefined();
    });
});

describe('getDashboardFilterDatePickerBounds', () => {
    it('keeps fixed max when maxAllowedDate is set', () => {
        const { maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            '2025-06-15',
            TimeFrames.MONTH,
        );

        expect(maxDate).toEqual(dayjs('2025-06-30').endOf('month').toDate());
    });

    it('does not apply dynamic max for day granularity', () => {
        const { maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.DAY,
        );

        expect(maxDate).toBeUndefined();
    });

    it('does not apply dynamic max for month when the switch is off', () => {
        const { maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
        );

        expect(maxDate).toBeUndefined();
    });

    it('applies dynamic max for month when the switch is on', () => {
        const { maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs(),
            true,
            true,
        );

        expect(maxDate).toBeDefined();
    });
});

describe('getDashboardFilterDatePickerBounds with rollingMinAllowedMonths', () => {
    it('resolves a 24-month window anchored to the dynamic max (on/after the 4th)', () => {
        // 2026-11-11 (past the 4th) → max 2026-10-31 → window 2024-11 ～ 2026-10
        const { minDate, maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-11-11'),
            true,
            true,
            24,
        );

        expect(minDate).toEqual(
            dayjs('2024-11-01').startOf('month').toDate(),
        );
        expect(maxDate).toEqual(dayjs('2026-10-31').endOf('month').toDate());
    });

    it('keeps the window stable before the 4th and slides it from the 4th', () => {
        const before4th = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-12-03'),
            true,
            true,
            24,
        );
        expect(before4th.minDate).toEqual(
            dayjs('2024-11-01').startOf('month').toDate(),
        );
        expect(before4th.maxDate).toEqual(
            dayjs('2026-10-31').endOf('month').toDate(),
        );

        const on4th = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-12-04'),
            true,
            true,
            24,
        );
        expect(on4th.minDate).toEqual(
            dayjs('2024-12-01').startOf('month').toDate(),
        );
        expect(on4th.maxDate).toEqual(
            dayjs('2026-11-30').endOf('month').toDate(),
        );
    });

    it('collapses the window to the max month itself for N=1', () => {
        const { minDate, maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-11-11'),
            true,
            true,
            1,
        );

        expect(minDate).toEqual(
            dayjs('2026-10-01').startOf('month').toDate(),
        );
        expect(maxDate).toEqual(dayjs('2026-10-31').endOf('month').toDate());
    });

    it('ignores invalid window sizes (0, negative, fractional, NaN, >120)', () => {
        [0, -3, 2.5, Number.NaN, 121].forEach((n) => {
            const { minDate } = getDashboardFilterDatePickerBounds(
                undefined,
                undefined,
                TimeFrames.MONTH,
                dayjs('2026-11-11'),
                true,
                true,
                n,
            );
            expect(minDate).toBeUndefined();
        });
    });

    it('anchors to a fixed max and stays static regardless of the reference date', () => {
        const boundsA = getDashboardFilterDatePickerBounds(
            undefined,
            '2025-06-15',
            TimeFrames.MONTH,
            dayjs('2026-11-11'),
            true,
            true,
            12,
        );
        const boundsB = getDashboardFilterDatePickerBounds(
            undefined,
            '2025-06-15',
            TimeFrames.MONTH,
            dayjs('2020-01-01'),
            true,
            true,
            12,
        );

        // Window 2024-07 ～ 2025-06: exactly 12 months, does not roll.
        expect(boundsA.minDate).toEqual(
            dayjs('2024-07-01').startOf('month').toDate(),
        );
        expect(boundsA.maxDate).toEqual(
            dayjs('2025-06-30').endOf('month').toDate(),
        );
        expect(boundsB).toEqual(boundsA);
    });

    it('ignores rolling when there is no resolved max at all', () => {
        const { minDate, maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-11-11'),
            true,
            false,
            24,
        );

        expect(minDate).toBeUndefined();
        expect(maxDate).toBeUndefined();
    });

    it('merges a fixed min with the rolling min using the later bound', () => {
        // Rolling min (2024-11-01) is later than the fixed min (2022-01-01).
        const rollingLater = getDashboardFilterDatePickerBounds(
            '2022-01-01',
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-11-11'),
            true,
            true,
            24,
        );
        expect(rollingLater.minDate).toEqual(
            dayjs('2024-11-01').startOf('month').toDate(),
        );

        // Fixed min (2026-01-01) is later than the rolling min (2024-11-01).
        const fixedLater = getDashboardFilterDatePickerBounds(
            '2026-01-01',
            undefined,
            TimeFrames.MONTH,
            dayjs('2026-11-11'),
            true,
            true,
            24,
        );
        expect(fixedLater.minDate).toEqual(
            dayjs('2026-01-01').startOf('month').toDate(),
        );
    });

    it('anchors without drift across a leap-year February', () => {
        // 2024-03-04 (past the 4th) → max 2024-02-29 → N=24 → min 2022-03-01.
        const { minDate, maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
            dayjs('2024-03-04'),
            true,
            true,
            24,
        );

        expect(maxDate).toEqual(dayjs('2024-02-29').endOf('month').toDate());
        expect(minDate).toEqual(
            dayjs('2022-03-01').startOf('month').toDate(),
        );
    });

    it('ignores rolling for non-month granularity', () => {
        const { minDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.QUARTER,
            dayjs('2026-11-11'),
            true,
            true,
            24,
        );

        expect(minDate).toBeUndefined();
    });
});

describe('resolveRuleBounds', () => {
    it('consumes rolling for IN_BETWEEN + month granularity', () => {
        const bounds = resolveRuleBounds(
            {
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                enableDynamicMaxAllowedDate: true,
                rollingMinAllowedMonths: 12,
            },
            dayjs('2026-11-11'),
        );

        // Window 2025-11 ～ 2026-10: exactly 12 months.
        expect(bounds.minDate).toEqual(
            dayjs('2025-11-01').startOf('month').toDate(),
        );
        expect(bounds.maxDate).toEqual(
            dayjs('2026-10-31').endOf('month').toDate(),
        );
    });

    it('ignores rolling for NOT_IN_BETWEEN', () => {
        const bounds = resolveRuleBounds(
            {
                operator: FilterOperator.NOT_IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                enableDynamicMaxAllowedDate: true,
                rollingMinAllowedMonths: 12,
            },
            dayjs('2026-11-11'),
        );

        expect(bounds.minDate).toBeUndefined();
        expect(bounds.maxDate).toEqual(
            dayjs('2026-10-31').endOf('month').toDate(),
        );
    });

    it('ignores rolling for IN_BETWEEN without month granularity', () => {
        const bounds = resolveRuleBounds(
            {
                operator: FilterOperator.IN_BETWEEN,
                enableDynamicMaxAllowedDate: true,
                rollingMinAllowedMonths: 12,
            },
            dayjs('2026-11-11'),
        );

        // Granularity defaults to DAY: no rolling min, no dynamic max.
        expect(bounds.minDate).toBeUndefined();
        expect(bounds.maxDate).toBeUndefined();
    });

    it('supports the validation-time availability delay via options', () => {
        const rule = {
            operator: FilterOperator.IN_BETWEEN,
            dateRangeGranularity: TimeFrames.MONTH,
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
        };

        // 2026-03-03 (before the 4th):
        // runtime → max 2026-01-31 → min 2024-02-01 (window 2024-02 ～ 2026-01);
        // validation (delay off) → max 2026-02-28 → min 2024-03-01 (window 2024-03 ～ 2026-02).
        const runtime = resolveRuleBounds(rule, dayjs('2026-03-03'));
        const validation = resolveRuleBounds(rule, dayjs('2026-03-03'), {
            applyDataAvailabilityDelay: false,
        });

        expect(runtime.minDate).toEqual(
            dayjs('2024-02-01').startOf('month').toDate(),
        );
        expect(validation.minDate).toEqual(
            dayjs('2024-03-01').startOf('month').toDate(),
        );
    });
});

describe('clampDateRangeValuesToBounds', () => {
    it('clamps the end date to the picker max', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2025-07-01', '2026-06-30'],
                undefined,
                dayjs('2026-05-31').endOf('month').toDate(),
                TimeFrames.MONTH,
            ),
        ).toEqual(['2025-07-01', '2026-05-31']);
    });

    it('clamps the start date to the picker min', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2023-06-15', '2025-08-20'],
                dayjs('2024-01-01').startOf('month').toDate(),
                undefined,
                TimeFrames.MONTH,
            ),
        ).toEqual(['2024-01-01', '2025-08-20']);
    });

    it('preserves an empty start slot so a single-sided upper bound is not re-interpreted', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['', '2026-06-30'],
                undefined,
                dayjs('2026-05-31').endOf('month').toDate(),
                TimeFrames.MONTH,
            ),
        ).toEqual(['', '2026-05-31']);
    });

    it('preserves an empty end slot', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2024-11-01', ''],
                dayjs('2024-11-01').startOf('month').toDate(),
                undefined,
                TimeFrames.MONTH,
            ),
        ).toEqual(['2024-11-01', '']);
    });

    it('does not rewrite in-bounds mid-month values to period boundaries', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2025-07-15', '2025-08-20'],
                dayjs('2024-11-01').startOf('month').toDate(),
                dayjs('2026-10-31').endOf('month').toDate(),
                TimeFrames.MONTH,
            ),
        ).toEqual(['2025-07-15', '2025-08-20']);
    });

    it('aligns only the clamped bound to the period boundary', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2025-07-15', '2026-06-20'],
                undefined,
                dayjs('2026-05-31').endOf('month').toDate(),
                TimeFrames.MONTH,
            ),
        ).toEqual(['2025-07-15', '2026-05-31']);
    });

    it('keeps the start > end degenerate collapse', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2026-03-15', '2025-02-10'],
                undefined,
                undefined,
                TimeFrames.MONTH,
            ),
        ).toEqual(['2025-02-10', '2025-02-10']);
    });

    it('keeps single-slot arity for pre-filtered inputs', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2025-07-01'],
                dayjs('2024-11-01').startOf('month').toDate(),
                dayjs('2026-10-31').endOf('month').toDate(),
                TimeFrames.MONTH,
            ),
        ).toEqual(['2025-07-01']);
    });

    // P1-1：TIMESTAMP 值夹紧后不能截断时间部分（否则 end 按 00:00 比较、
    // 丢当天数据，跨 tab 同步还会把截断值写回存储）
    it('keeps the time part when clamping a timestamp end (P1-1)', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2025-07-01T10:30:00', '2026-07-15T08:15:00'],
                dayjs('2025-06-01').startOf('day').toDate(),
                dayjs('2026-05-31').endOf('day').toDate(),
                TimeFrames.DAY,
            ),
        ).toEqual([
            '2025-07-01T10:30:00',
            dayjs('2026-05-31').endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ]);
    });

    it('keeps the time part when clamping a timestamp start (P1-1)', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2024-01-01T10:30:00', '2026-04-15T08:15:00'],
                dayjs('2025-06-01').startOf('day').toDate(),
                dayjs('2026-05-31').endOf('day').toDate(),
                TimeFrames.DAY,
            ),
        ).toEqual([
            dayjs('2025-06-01')
                .startOf('day')
                .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
            '2026-04-15T08:15:00',
        ]);
    });

    it('returns in-bounds timestamp values byte-identical (P1-1)', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2025-07-01T10:30:00+08:00', '2026-05-01T08:15:00+08:00'],
                dayjs('2025-06-01').startOf('day').toDate(),
                dayjs('2026-05-31').endOf('day').toDate(),
                TimeFrames.DAY,
            ),
        ).toEqual(['2025-07-01T10:30:00+08:00', '2026-05-01T08:15:00+08:00']);
    });

    it('aligns a clamped timestamp to the period boundary keeping time (MONTH)', () => {
        expect(
            clampDateRangeValuesToBounds(
                ['2024-06-15T10:30:00', '2026-09-20T08:15:00'],
                dayjs('2025-01-01').startOf('month').toDate(),
                dayjs('2026-05-31').endOf('month').toDate(),
                TimeFrames.MONTH,
            ),
        ).toEqual([
            dayjs('2025-01-01')
                .startOf('month')
                .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
            dayjs('2026-05-31')
                .endOf('month')
                .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ]);
    });
});

describe('DATA_MONTH_AVAILABLE_FROM_DAY', () => {
    it('is 4', () => {
        expect(DATA_MONTH_AVAILABLE_FROM_DAY).toBe(4);
    });
});

describe('getLastAvailableMonth', () => {
    it('returns start of two months ago before the 4th', () => {
        expect(getLastAvailableMonth(dayjs('2026-03-03'))).toEqual(
            dayjs('2026-01-01').startOf('month').toDate(),
        );
    });

    it('returns start of last month on or after the 4th', () => {
        expect(getLastAvailableMonth(dayjs('2026-03-04'))).toEqual(
            dayjs('2026-02-01').startOf('month').toDate(),
        );
    });
});

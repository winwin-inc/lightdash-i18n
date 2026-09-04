import { TimeFrames } from '@lightdash/common';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

import {
    DATA_MONTH_AVAILABLE_FROM_DAY,
    clampDateRangeValuesToBounds,
    getDashboardFilterDatePickerBounds,
    getDynamicMaxAllowedDate,
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
});

describe('DATA_MONTH_AVAILABLE_FROM_DAY', () => {
    it('is 4', () => {
        expect(DATA_MONTH_AVAILABLE_FROM_DAY).toBe(4);
    });
});

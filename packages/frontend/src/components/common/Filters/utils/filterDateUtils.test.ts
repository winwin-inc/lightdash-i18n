import { TimeFrames } from '@lightdash/common';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

import {
    DATA_MONTH_AVAILABLE_FROM_DAY,
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

    it('applies dynamic max for month when maxAllowedDate is empty', () => {
        const { maxDate } = getDashboardFilterDatePickerBounds(
            undefined,
            undefined,
            TimeFrames.MONTH,
        );

        expect(maxDate).toBeDefined();
    });
});

describe('DATA_MONTH_AVAILABLE_FROM_DAY', () => {
    it('is 4', () => {
        expect(DATA_MONTH_AVAILABLE_FROM_DAY).toBe(4);
    });
});

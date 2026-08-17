import { TimeFrames, type WeekDay } from '@lightdash/common';
import { type DayOfWeek } from '@mantine/dates';

import dayjs from 'dayjs';
import getLocaleData from 'dayjs/plugin/localeData';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import updateLocale from 'dayjs/plugin/updateLocale';

dayjs.extend(quarterOfYear);

dayjs.extend(getLocaleData);
dayjs.extend(updateLocale);

//
// internally we use WeekDay enum with values from 0 (Monday) to 6 (Sunday)
// normalized values are from 0 (Sunday) to 6 (Saturday)
//
const normalizeWeekDay = (weekDay: WeekDay): DayOfWeek => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as DayOfWeek;
};

export const getFirstDayOfWeek = (startOfWeekDay?: WeekDay): DayOfWeek => {
    if (startOfWeekDay === undefined) {
        return dayjs().localeData().firstDayOfWeek() as DayOfWeek;
    } else {
        return normalizeWeekDay(startOfWeekDay);
    }
};

export const startOfWeek = (date: Date, firstDayOfWeek: DayOfWeek) => {
    const currentLocale = dayjs.locale();
    const localeFirstDayOfWeek = dayjs().localeData().firstDayOfWeek();

    dayjs.updateLocale(currentLocale, {
        weekStart: firstDayOfWeek,
    });

    const startOfWeekDate = dayjs(date).startOf('week').toDate();

    dayjs.updateLocale(currentLocale, {
        weekStart: localeFirstDayOfWeek,
    });

    return startOfWeekDate;
};

export const endOfWeek = (date: Date, fdow: DayOfWeek) => {
    return dayjs(startOfWeek(date, fdow)).add(6, 'day').toDate();
};

export const isInWeekRange = (
    date: Date | null,
    selectedDate: Date | null,
    firstDayOfWeek: DayOfWeek,
) => {
    if (!selectedDate) return false;

    return (
        (dayjs(date).isSame(startOfWeek(selectedDate, firstDayOfWeek)) ||
            dayjs(date).isAfter(startOfWeek(selectedDate, firstDayOfWeek))) &&
        (dayjs(date).isBefore(endOfWeek(selectedDate, firstDayOfWeek)) ||
            dayjs(date).isSame(endOfWeek(selectedDate, firstDayOfWeek)))
    );
};

/** Pick the stricter (later) minimum of two optional dates */
export const mergeMinDate = (a?: Date, b?: Date): Date | undefined => {
    if (!a) return b;
    if (!b) return a;
    return dayjs(a).isAfter(dayjs(b)) ? a : b;
};

/** Pick the stricter (earlier) maximum of two optional dates */
export const mergeMaxDate = (a?: Date, b?: Date): Date | undefined => {
    if (!a) return b;
    if (!b) return a;
    return dayjs(a).isBefore(dayjs(b)) ? a : b;
};

/** 底层数据每月 3 号更新；4 号起上月数据可用，4 号前只能选到上上月 */
export const DATA_MONTH_AVAILABLE_FROM_DAY = 4;

/**
 * 未配置固定最晚日期时，按月/季粒度计算动态上限（对齐周期末）。
 * - 月：4 号前 → 上上月末；4 号及以后 → 上月末
 * - 季：最近一个完整季度末
 */
export const getDynamicMaxAllowedDate = (
    timeInterval?: string,
    referenceDate: dayjs.Dayjs = dayjs(),
): Date | undefined => {
    const upper = timeInterval?.toUpperCase();
    if (upper === TimeFrames.MONTH) {
        const monthsBack =
            referenceDate.date() < DATA_MONTH_AVAILABLE_FROM_DAY ? 2 : 1;
        return referenceDate
            .subtract(monthsBack, 'month')
            .endOf('month')
            .toDate();
    }
    if (upper === TimeFrames.QUARTER) {
        return referenceDate.subtract(1, 'quarter').endOf('quarter').toDate();
    }
    return undefined;
};

/**
 * Parse dashboard filter min/max date strings (YYYY-MM-DD) into Date bounds for Mantine pickers.
 * Aligns boundaries with the field time interval when applicable.
 * maxAllowedDate 留空且为月/季粒度时，使用 getDynamicMaxAllowedDate。
 */
export const getDashboardFilterDatePickerBounds = (
    minAllowedDate?: string,
    maxAllowedDate?: string,
    timeInterval?: string,
    referenceDate: dayjs.Dayjs = dayjs(),
): { minDate?: Date; maxDate?: Date } => {
    const parseMin = (raw: string | undefined): Date | undefined => {
        const trimmed = raw?.trim();
        if (!trimmed) return undefined;
        const d = dayjs(trimmed);
        if (!d.isValid()) return undefined;
        const upper = timeInterval?.toUpperCase();
        if (upper === TimeFrames.MONTH) {
            return d.startOf('month').toDate();
        }
        if (upper === TimeFrames.YEAR) {
            return d.startOf('year').toDate();
        }
        if (upper === TimeFrames.QUARTER) {
            return d.startOf('quarter').toDate();
        }
        return d.startOf('day').toDate();
    };

    const parseMax = (raw: string | undefined): Date | undefined => {
        const trimmed = raw?.trim();
        if (!trimmed) return undefined;
        const d = dayjs(trimmed);
        if (!d.isValid()) return undefined;
        const upper = timeInterval?.toUpperCase();
        if (upper === TimeFrames.MONTH) {
            return d.endOf('month').toDate();
        }
        if (upper === TimeFrames.YEAR) {
            return d.endOf('year').toDate();
        }
        if (upper === TimeFrames.QUARTER) {
            return d.endOf('quarter').toDate();
        }
        return d.endOf('day').toDate();
    };

    const fixedMax = parseMax(maxAllowedDate);
    const dynamicMax =
        fixedMax === undefined
            ? getDynamicMaxAllowedDate(timeInterval, referenceDate)
            : undefined;

    return {
        minDate: parseMin(minAllowedDate),
        maxDate: fixedMax ?? dynamicMax,
    };
};

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

const toDayjs = (value: Date | dayjs.Dayjs = dayjs()): dayjs.Dayjs =>
    dayjs.isDayjs(value) ? value : dayjs(value);

const getCompareUnit = (
    timeInterval?: string,
): 'day' | 'month' | 'quarter' | 'year' => {
    const upper = timeInterval?.toUpperCase();
    if (upper === TimeFrames.MONTH) return 'month';
    if (upper === TimeFrames.QUARTER) return 'quarter';
    if (upper === TimeFrames.YEAR) return 'year';
    return 'day';
};

const formatBound = (
    date: dayjs.Dayjs,
    isEnd: boolean,
    timeInterval?: string,
): string => {
    const upper = timeInterval?.toUpperCase();
    let aligned = date;
    if (upper === TimeFrames.MONTH) {
        aligned = isEnd ? date.endOf('month') : date.startOf('month');
    } else if (upper === TimeFrames.QUARTER) {
        aligned = isEnd ? date.endOf('quarter') : date.startOf('quarter');
    } else if (upper === TimeFrames.YEAR) {
        aligned = isEnd ? date.endOf('year') : date.startOf('year');
    } else {
        aligned = isEnd ? date.endOf('day') : date.startOf('day');
    }
    return aligned.format('YYYY-MM-DD');
};

/**
 * 未配置固定最晚日期时，按月/季粒度计算动态上限（对齐周期末）。
 * - 月：默认 4 号前 → 上上月末，4 号及以后 → 上月末
 * - 季：最近一个完整季度末
 * applyDataAvailabilityDelay=false 时月份始终取上月末，供配置校验使用。
 */
export const getDynamicMaxAllowedDate = (
    timeInterval?: string,
    referenceDate: Date | dayjs.Dayjs = dayjs(),
    applyDataAvailabilityDelay = true,
): Date | undefined => {
    const ref = toDayjs(referenceDate);
    const upper = timeInterval?.toUpperCase();
    if (upper === TimeFrames.MONTH) {
        const monthsBack =
            applyDataAvailabilityDelay &&
            ref.date() < DATA_MONTH_AVAILABLE_FROM_DAY
                ? 2
                : 1;
        return ref.subtract(monthsBack, 'month').endOf('month').toDate();
    }
    if (upper === TimeFrames.QUARTER) {
        return ref.subtract(1, 'quarter').endOf('quarter').toDate();
    }
    return undefined;
};

/**
 * 将动态解析出的起止日期夹到可选范围内，避免默认值落在选择器禁用的日期上。
 */
export const clampDateRangeValuesToBounds = (
    values: Array<string | null | undefined>,
    minDate?: Date,
    maxDate?: Date,
    timeInterval?: string,
): string[] => {
    const unit = getCompareUnit(timeInterval);
    const min = minDate ? dayjs(minDate) : null;
    const max = maxDate ? dayjs(maxDate) : null;

    let start = values[0] ? dayjs(values[0]) : null;
    let end = values[1] ? dayjs(values[1]) : null;
    if (!start?.isValid()) start = null;
    if (!end?.isValid()) end = null;

    if (end && max && end.isAfter(max, unit)) {
        end = max;
    }
    if (start && min && start.isBefore(min, unit)) {
        start = min;
    }
    if (start && max && start.isAfter(max, unit)) {
        start = max;
    }
    if (end && min && end.isBefore(min, unit)) {
        end = min;
    }
    if (start && end && start.isAfter(end, unit)) {
        start = end;
    }

    return [
        start ? formatBound(start, false, timeInterval) : values[0] ?? '',
        end ? formatBound(end, true, timeInterval) : values[1] ?? '',
    ].filter((value) => value !== '');
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
    referenceDate: Date | dayjs.Dayjs = dayjs(),
    applyDataAvailabilityDelay = true,
): { minDate?: Date; maxDate?: Date } => {
    const ref = toDayjs(referenceDate);
    const parseMin = (raw: string | undefined): Date | undefined => {
        const trimmed = raw?.trim();
        if (!trimmed) return undefined;
        const d = toDayjs(trimmed);
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
            ? getDynamicMaxAllowedDate(
                  timeInterval,
                  ref,
                  applyDataAvailabilityDelay,
              )
            : undefined;

    return {
        minDate: parseMin(minAllowedDate),
        maxDate: fixedMax ?? dynamicMax,
    };
};

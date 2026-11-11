import {
    DATA_MONTH_AVAILABLE_FROM_DAY,
    isRollingMinAllowedMonthsActive,
    isValidRollingMinAllowedMonths,
    TimeFrames,
    type FilterOperator,
    type WeekDay,
} from '@lightdash/common';
import { type DayOfWeek } from '@mantine/dates';

import dayjs from 'dayjs';
import getLocaleData from 'dayjs/plugin/localeData';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import updateLocale from 'dayjs/plugin/updateLocale';

export { DATA_MONTH_AVAILABLE_FROM_DAY };

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

const toDayjs = (value: Date | dayjs.Dayjs | string = dayjs()): dayjs.Dayjs =>
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
 * 按 4 号数据可用规则解析「上月（4号显示）」对应的月初日期。
 * 4 号前 → 上上月初；4 号及以后 → 上月初。
 */
export const getLastAvailableMonth = (
    referenceDate: Date | dayjs.Dayjs = dayjs(),
): Date => {
    const max = getDynamicMaxAllowedDate(TimeFrames.MONTH, referenceDate, true);
    return toDayjs(max ?? referenceDate)
        .startOf('month')
        .toDate();
};

/**
 * 将起止日期夹到可选范围内，避免默认值落在选择器禁用的日期上。
 *
 * - 始终保留输入的槽位结构：空槽位（''/null/undefined）原样保留为 ''，
 *   单边区间 `['', end]` 不会被过滤塌缩成 `[end]`（否则 start 槽位被
 *   隐式填充，IN_BETWEEN 语义被改写）；输出槽位数与输入一致。
 * - 只改写被夹紧的那一端并按周期对齐；界内值原样返回，不做周期对齐
 *   重写（否则月中日期会被静默扩成整月）。
 * - `start > end` 时退化保留既有行为（start 跟随 end 的输出）。
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

    let startClamped = false;
    let endClamped = false;

    if (end && max && end.isAfter(max, unit)) {
        end = max;
        endClamped = true;
    }
    if (start && min && start.isBefore(min, unit)) {
        start = min;
        startClamped = true;
    }
    if (start && max && start.isAfter(max, unit)) {
        start = max;
        startClamped = true;
    }
    if (end && min && end.isBefore(min, unit)) {
        end = min;
        endClamped = true;
    }

    const startOutput = start
        ? startClamped
            ? formatBound(start, false, timeInterval)
            : String(values[0])
        : values[0] ?? '';
    const endOutput = end
        ? endClamped
            ? formatBound(end, true, timeInterval)
            : String(values[1])
        : values[1] ?? '';

    const result: string[] = [];
    if (values.length > 0) {
        result.push(
            start && end && start.isAfter(end, unit) ? endOutput : startOutput,
        );
    }
    if (values.length > 1) {
        result.push(endOutput);
    }
    return result;
};

/**
 * 解析滚动下限日期（月粒度）：锚定最晚可选月的月初，往前 N-1 个月，
 * 窗口恰好包含 N 个整月。以下情况视为未配置（返回 undefined）：
 * - N 非法（非整数或不在 [1, 120] 区间）
 * - 非月粒度
 * - 无最晚可选月可锚定（无固定 max 且未开启动态 max；该组合应由保存期校验拒绝）
 */
const resolveRollingMinAllowedDate = (
    rollingMinAllowedMonths: number | undefined,
    maxDate: Date | undefined,
    timeInterval?: string,
): Date | undefined => {
    if (
        rollingMinAllowedMonths == null ||
        maxDate == null ||
        timeInterval?.toUpperCase() !== TimeFrames.MONTH ||
        !isValidRollingMinAllowedMonths(rollingMinAllowedMonths)
    ) {
        return undefined;
    }
    return dayjs(maxDate)
        .startOf('month')
        .subtract(rollingMinAllowedMonths - 1, 'month')
        .toDate();
};

/**
 * Parse dashboard filter min/max date strings (YYYY-MM-DD) into Date bounds for Mantine pickers.
 * Aligns boundaries with the field time interval when applicable.
 * maxAllowedDate 留空且开启 enableDynamicMax 时，月/季粒度使用 getDynamicMaxAllowedDate。
 * rollingMinAllowedMonths（月粒度滚动下限，窗口整月数 N）生效时与固定 min 取更晚者。
 */
export const getDashboardFilterDatePickerBounds = (
    minAllowedDate?: string,
    maxAllowedDate?: string,
    timeInterval?: string,
    referenceDate: Date | dayjs.Dayjs = dayjs(),
    applyDataAvailabilityDelay = true,
    enableDynamicMax = false,
    rollingMinAllowedMonths?: number,
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
        fixedMax === undefined && enableDynamicMax
            ? getDynamicMaxAllowedDate(
                  timeInterval,
                  ref,
                  applyDataAvailabilityDelay,
              )
            : undefined;
    const resolvedMax = fixedMax ?? dynamicMax;
    const rollingMin = resolveRollingMinAllowedDate(
        rollingMinAllowedMonths,
        resolvedMax,
        timeInterval,
    );

    return {
        minDate: mergeMinDate(parseMin(minAllowedDate), rollingMin),
        maxDate: resolvedMax,
    };
};

/** `resolveRuleBounds` 的规则级输入（DashboardFilterRule 的日期约束子集）。 */
export type RuleDateBoundsInput = {
    operator?: FilterOperator;
    minAllowedDate?: string;
    maxAllowedDate?: string;
    dateRangeGranularity?: TimeFrames;
    enableDynamicMaxAllowedDate?: boolean;
    rollingMinAllowedMonths?: number;
};

/**
 * 解析一条筛选规则的可选日期边界（picker / chip / 查询钳制 / 保存校验共用入口，
 * 避免各处各算一次）。rolling 下限仅在「IN_BETWEEN + 月粒度 + N 合法」时消费，
 * 其它算子/粒度一律短路（门禁）；固定 min 与 rolling 取更晚者为生效下限。
 * applyDataAvailabilityDelay 默认 true（运行时口径），校验场景可传 false。
 */
export const resolveRuleBounds = (
    rule: RuleDateBoundsInput,
    referenceDate: Date | dayjs.Dayjs = dayjs(),
    options: { applyDataAvailabilityDelay?: boolean } = {},
): { minDate?: Date; maxDate?: Date } => {
    const granularity = rule.dateRangeGranularity ?? TimeFrames.DAY;
    const rollingMinAllowedMonths = isRollingMinAllowedMonthsActive({
        operator: rule.operator,
        dateRangeGranularity: granularity,
        rollingMinAllowedMonths: rule.rollingMinAllowedMonths,
    })
        ? rule.rollingMinAllowedMonths
        : undefined;
    return getDashboardFilterDatePickerBounds(
        rule.minAllowedDate,
        rule.maxAllowedDate,
        granularity,
        referenceDate,
        options.applyDataAvailabilityDelay ?? true,
        !!rule.enableDynamicMaxAllowedDate,
        rollingMinAllowedMonths,
    );
};

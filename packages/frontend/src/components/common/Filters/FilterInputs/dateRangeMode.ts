import {
    FilterOperator,
    resolveDateRangeValues,
    resolveSingleDateValue,
    TimeFrames,
    UnitOfTime,
    type DateRangeBoundSetting,
    type DateRangeMode,
    type DateRangeSetting,
    type SingleDateSetting,
} from '@lightdash/common';

/**
 * Pure helpers for the fixed ↔ dynamic date-range default mode.
 *
 * Shared by `FilterDynamicDateRangePicker` (value input, in common/Filters)
 * and the dashboard `FilterSettings` card-level mode Radio, so the mode
 * switch logic (including the `values` recomputation that keeps the
 * "apply" button / `hasFilterValueSet` consistent) is defined exactly once
 * and no common → DashboardFilter reverse dependency is introduced.
 */

/** Window seeded when switching to dynamic mode with no prior dynamic
 * config: last 12 months → last 1 month (counts are in bound units). */
export const DYNAMIC_DATE_RANGE_DEFAULT_START: Required<DateRangeBoundSetting> =
    {
        direction: 'ago',
        count: 12,
        unit: UnitOfTime.months,
    };
export const DYNAMIC_DATE_RANGE_DEFAULT_END: Required<DateRangeBoundSetting> = {
    direction: 'ago',
    count: 1,
    unit: UnitOfTime.months,
};

export const isDateRangeMode = (value: string | null): value is DateRangeMode =>
    value === 'fixed' || value === 'dynamic';

/**
 * Dynamic date-range defaults are only enabled for month / quarter
 * granularity. Day / year granularities use fixed dates only.
 */
export const isDynamicDateRangeAllowed = (granularity: TimeFrames): boolean =>
    granularity === TimeFrames.MONTH || granularity === TimeFrames.QUARTER;

/**
 * Map the picker's date-range granularity to the dynamic unit it must use
 * (month → months, quarter → quarters). The user cannot change the unit.
 */
export const getLockedDynamicUnit = (
    granularity: TimeFrames,
): UnitOfTime | undefined => {
    if (granularity === TimeFrames.MONTH) return UnitOfTime.months;
    if (granularity === TimeFrames.QUARTER) return UnitOfTime.quarters;
    return undefined;
};

/**
 * Resolve the effective mode from stored settings. When dynamic mode is not
 * allowed for the granularity (day / year), stored dynamic configs are
 * ignored so the UI never shows a dynamic branch for them.
 */
export const resolveDateRangeMode = (
    dateRange: DateRangeSetting | undefined,
    granularity: TimeFrames,
): DateRangeMode => {
    if (!isDynamicDateRangeAllowed(granularity)) return 'fixed';
    const storedMode = dateRange?.mode ?? null;
    return isDateRangeMode(storedMode) ? storedMode : 'fixed';
};

/**
 * Resolve a dynamic DateRangeSetting into [startStr, endStr] so that the
 * `values` array always reflects the current dynamic configuration. The SQL
 * compiler re-resolves from `settings.dateRange` at query time, but
 * `values` must also be populated for validation (`hasFilterValueSet`) and
 * for any code path that reads `values` directly.
 */
export const resolveDynamicDateRangeValues = (
    dateRange: DateRangeSetting,
    granularity: TimeFrames,
): string[] =>
    resolveDateRangeValues(
        { settings: { dateRange }, values: [] },
        granularity,
    ).filter((value): value is string => value !== null);

/**
 * Normalize stored dynamic settings before writing them back:
 * direction is always 'ago' and the unit is forced to the granularity's
 * locked unit (existing storage may carry stale units from a previous
 * granularity).
 */
export const normalizeDateRangeSetting = (
    dateRange: DateRangeSetting,
    lockedUnit: UnitOfTime | undefined,
): DateRangeSetting => ({
    ...dateRange,
    start: dateRange.start
        ? {
              ...dateRange.start,
              direction: 'ago',
              unit:
                  lockedUnit ??
                  dateRange.start.unit ??
                  DYNAMIC_DATE_RANGE_DEFAULT_START.unit,
          }
        : dateRange.start,
    end: dateRange.end
        ? {
              ...dateRange.end,
              direction: 'ago',
              unit:
                  lockedUnit ??
                  dateRange.end.unit ??
                  DYNAMIC_DATE_RANGE_DEFAULT_END.unit,
          }
        : dateRange.end,
});

export const parseDateRangeCount = (raw: unknown): number => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : 1;
    }
    return 1;
};

/**
 * Minimal structural shape consumed by `buildDateRangeModeChangeRule`.
 * Both `FilterRule`-based explore rules and `DashboardFilterRule` satisfy it.
 */
export type DateRangeModeRule = {
    values?: (string | null)[] | null;
    settings?: { dateRange?: DateRangeSetting } | null;
};

/** `DateRangeModeRule` + 规则级粒度字段（保存期规范化用）。 */
export type GranularDateRangeModeRule = DateRangeModeRule & {
    dateRangeGranularity?: TimeFrames;
    operator?: FilterOperator;
    settings?:
        | ({ dateRange?: DateRangeSetting } & {
              singleDate?: SingleDateSetting;
          })
        | null;
};

/**
 * 保存期规范化（P2-4/M1）：剥离与粒度门禁不兼容的动态 dateRange 残留。
 *
 * 旧 UI 的粒度下拉不清理 `settings.dateRange`，存量数据可能存在
 * 「日/年粒度 + dateRange.mode='dynamic'」的已保存筛选器 —— 改动后
 * 编辑页 Radio 显示固定日期，但查询编译仍按动态解析，UI 与查询持续
 * 不一致；只有作者重新切一次粒度才会被清理。保存时在此按粒度门禁
 * 剥离，让存储回到与 UI/查询一致的单一口径（月/季粒度不交）。

/**
 * Build the next rule for a fixed ↔ dynamic mode switch.
 *
 * - `dynamic`: seed start/end from the existing dynamic config when present,
 *   otherwise from the documented defaults (12 → 1 months), normalize units
 *   to the granularity's locked unit, and re-resolve `values` so validation
 *   and query stay consistent.
 * - `fixed`: drop only `settings.dateRange` (other settings such as
 *   `singleDate` / `unitOfTime` are preserved); existing `values` (if any)
 *   continue to drive the fixed pickers. min/max constraints are untouched —
 *   the mode switch only decides the default value's shape.
 */
export const buildDateRangeModeChangeRule = <T extends DateRangeModeRule>(
    rule: T,
    nextMode: DateRangeMode,
    granularity: TimeFrames,
): T => {
    if (nextMode !== 'dynamic') {
        const { dateRange: _dropped, ...restSettings } = rule.settings ?? {};
        return { ...rule, settings: restSettings } as T;
    }

    const lockedUnit = getLockedDynamicUnit(granularity);
    const previous = rule.settings?.dateRange;
    const seedBound = (
        bound: DateRangeBoundSetting | undefined,
        fallback: Required<DateRangeBoundSetting>,
    ): DateRangeBoundSetting => ({
        direction: 'ago',
        count:
            bound?.count != null
                ? parseDateRangeCount(bound.count)
                : fallback.count,
        unit: lockedUnit ?? bound?.unit ?? fallback.unit,
    });

    const nextDateRange: DateRangeSetting = normalizeDateRangeSetting(
        {
            mode: 'dynamic',
            start: seedBound(previous?.start, DYNAMIC_DATE_RANGE_DEFAULT_START),
            end: seedBound(previous?.end, DYNAMIC_DATE_RANGE_DEFAULT_END),
        },
        lockedUnit,
    );
    return {
        ...rule,
        values: resolveDynamicDateRangeValues(nextDateRange, granularity),
        settings: { ...rule.settings, dateRange: nextDateRange },
    } as T;
};

/**
 * Preset seeded when switching a single-value month `EQUALS` filter to
 * dynamic mode (the only single-date preset today): last available month
 * with the day-of-month data cutoff (before the 4th → month before last).
 */
export const LAST_AVAILABLE_MONTH_SETTING: SingleDateSetting = {
    mode: 'dynamic',
    preset: 'lastAvailableMonth',
};

/** Minimal structural shape consumed by `buildSingleDateModeChangeRule`. */
export type SingleDateModeRule = {
    values?: (string | null)[] | null;
    /** 规则级数据可用日（上月预设 cutoff，缺省 4 号） */
    dataAvailableFromDay?: number;
    // 真实规则的 settings 还携带 dateRange / unitOfTime 等兄弟键，
    // 索引签名保持结构兼容（与 DateFilterSettings 的真实形状一致）
    settings?:
        | ({ singleDate?: SingleDateSetting } & Record<string, unknown>)
        | null;
};

/**
 * Build the next rule for a fixed ↔ dynamic single-date (month `EQUALS`)
 * mode switch. Mirrors `buildDateRangeModeChangeRule`:
 *
 * - `dynamic`: seed `settings.singleDate` with the last-available-month
 *   preset and resolve `values` immediately (keeps `hasFilterValueSet` /
 *   chip preview consistent, matching how the mode Radio card works for
 *   date ranges).
 * - `fixed`: drop only `settings.singleDate` (other settings such as
 *   `dateRange` / `unitOfTime` are preserved); existing `values` continue
 *   to drive the fixed month picker.
 */
export const buildSingleDateModeChangeRule = <T extends SingleDateModeRule>(
    rule: T,
    nextMode: DateRangeMode,
    now: Date = new Date(),
): T => {
    if (nextMode !== 'dynamic') {
        const { singleDate: _dropped, ...restSettings } = rule.settings ?? {};
        return { ...rule, settings: restSettings } as T;
    }
    const settings = {
        ...rule.settings,
        singleDate: LAST_AVAILABLE_MONTH_SETTING,
    };
    const resolved = resolveSingleDateValue(
        {
            values: rule.values ?? undefined,
            dataAvailableFromDay: rule.dataAvailableFromDay,
            settings,
        },
        now,
    );
    return {
        ...rule,
        values: resolved != null ? [resolved] : rule.values,
        settings,
    } as T;
};

/**
 * 保存前剥除「粒度不允许动态默认」时残留的 `settings.dateRange`（见
 * `GranularDateRangeModeRule` 上的说明）。其余 settings（singleDate /
 * unitOfTime 等）与 values 原样保留；无可剥除内容时返回原引用。
 */
export const stripDisallowedDynamicDateRange = <
    T extends GranularDateRangeModeRule,
>(
    rule: T,
): T => {
    const settings = rule.settings;
    // 约束字段（rolling / 跟随数据更新 / 静态最早最晚）不在 GranularDateRangeModeRule 上，
    // 统一经此视图访问，避免各分支重复断言
    const constrainedView = rule as GranularDateRangeModeRule & {
        rollingMinAllowedMonths?: number;
        enableDynamicMaxAllowedDate?: boolean;
        minAllowedDate?: string;
        maxAllowedDate?: string;
    };
    // ── 单值「是」（月份）规则：模式看 settings.singleDate，粒度是字段属性 ──
    // 不走下方 dateRangeGranularity 门禁（EQUALS 规则不携带该字段，会被误判
    // 为 DAY 而剥掉动态约束）。与区间规则同构的归属隔离：
    // - 动态模式：最早归 rolling（剥静态最早残留）；「跟随数据更新」开启时
    //   最晚归其所有（剥共存固定最晚）；同时剥不该存在的 dateRange 残留
    // - 固定模式：rolling / 跟随数据更新不参与，一并剥除
    if (rule.operator === FilterOperator.EQUALS) {
        if (settings?.singleDate?.mode !== 'dynamic') {
            if (
                constrainedView.rollingMinAllowedMonths == null &&
                !constrainedView.enableDynamicMaxAllowedDate &&
                settings?.dateRange == null
            ) {
                return rule;
            }
            const { dateRange: _dropped, ...restSettings } = settings ?? {};
            return {
                ...rule,
                settings:
                    Object.keys(restSettings).length > 0
                        ? restSettings
                        : undefined,
                rollingMinAllowedMonths: undefined,
                enableDynamicMaxAllowedDate: undefined,
            } as T;
        }
        const hasStaticMin = constrainedView.minAllowedDate != null;
        const hasFixedMaxConflict =
            !!constrainedView.enableDynamicMaxAllowedDate &&
            constrainedView.maxAllowedDate != null;
        if (!hasStaticMin && !hasFixedMaxConflict && settings?.dateRange == null) {
            return rule;
        }
        const stripped: T & { maxAllowedDate?: string } = {
            ...rule,
            minAllowedDate: undefined,
        } as T;
        const { dateRange: _droppedRange, ...restSettings } = settings ?? {};
        (stripped as GranularDateRangeModeRule).settings =
            Object.keys(restSettings).length > 0 ? restSettings : undefined;
        if (hasFixedMaxConflict) {
            stripped.maxAllowedDate = undefined;
        }
        return stripped as T;
    }
    const granularity = rule.dateRangeGranularity ?? TimeFrames.DAY;
    if (!isDynamicDateRangeAllowed(granularity)) {
        // 粒度不允许动态默认：动态默认与动态约束（rolling / 跟随数据更新上限）一并清理
        if (
            constrainedView.settings?.dateRange == null &&
            constrainedView.rollingMinAllowedMonths == null &&
            !constrainedView.enableDynamicMaxAllowedDate
        ) {
            return rule;
        }
        const { dateRange: _dropped, ...restSettings } = settings ?? {};
        return {
            ...rule,
            settings:
                Object.keys(restSettings).length > 0 ? restSettings : undefined,
            rollingMinAllowedMonths: undefined,
            enableDynamicMaxAllowedDate: undefined,
        } as T;
    }
    // 粒度允许但默认值是固定模式：约束只支持静态（固定最早/最晚日期），
    // 动态约束与固定默认值会出现「默认值不动、窗口滚动」的交叉错位，一并清理
    if (settings?.dateRange?.mode !== 'dynamic') {
        if (
            constrainedView.rollingMinAllowedMonths == null &&
            !constrainedView.enableDynamicMaxAllowedDate
        ) {
            return rule;
        }
        return {
            ...rule,
            rollingMinAllowedMonths: undefined,
            enableDynamicMaxAllowedDate: undefined,
        } as T & { rollingMinAllowedMonths?: undefined; enableDynamicMaxAllowedDate?: undefined };
    }
    // 动态模式：最早归 rolling（清理残留静态最早）；开启「跟随数据更新」时
    // 最晚归其所有（清理共存固定最晚——固定值会静默覆盖动态上限）。
    // 保存后存储与 UI/查询保持单一口径，杜绝跨模式字段混用导致的查询错误。
    const hasStaticMin = constrainedView.minAllowedDate != null;
    const hasFixedMaxConflict =
        !!constrainedView.enableDynamicMaxAllowedDate &&
        constrainedView.maxAllowedDate != null;
    if (!hasStaticMin && !hasFixedMaxConflict) {
        return rule;
    }
    const strippedConstraint = {
        ...rule,
        minAllowedDate: undefined,
    } as T & { maxAllowedDate?: string | undefined };
    if (hasFixedMaxConflict) {
        strippedConstraint.maxAllowedDate = undefined;
    }
    return strippedConstraint;
};

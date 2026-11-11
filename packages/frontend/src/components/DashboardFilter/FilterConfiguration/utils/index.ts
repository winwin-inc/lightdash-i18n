import {
    FilterOperator,
    TimeFrames,
    assertUnreachable,
    isDateRangeDynamic,
    isRollingMinAllowedMonthsActive,
    resolveDateRangeValues,
    type DashboardFilterRule,
} from '@lightdash/common';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { produce } from 'immer';
import isEqual from 'lodash/isEqual';

import { resolveRuleBounds } from '../../../common/Filters/utils/filterDateUtils';

dayjs.extend(quarterOfYear);

export type DashboardFilterDateRangeValidationErrorCode =
    | 'start_after_end'
    | 'end_after_max'
    | 'start_before_min'
    | 'rolling_requires_max';

export type DashboardFilterDateRangeValidationError = {
    code: DashboardFilterDateRangeValidationErrorCode;
    /** 解析后的实际可选范围（供错误文案展示「实际最早/最晚可选」，P1-5）；
     *  rolling_requires_max 时无最晚可选月，二者均为空 */
    minDate?: Date;
    maxDate?: Date;
};

const getCompareUnit = (
    granularity: TimeFrames,
): 'day' | 'month' | 'quarter' | 'year' => {
    switch (granularity) {
        case TimeFrames.MONTH:
            return 'month';
        case TimeFrames.QUARTER:
            return 'quarter';
        case TimeFrames.YEAR:
            return 'year';
        default:
            return 'day';
    }
};

/**
 * 编辑看板筛选器保存时校验默认日期区间（P1-5 修订，含 P1-2/P2-2/P3-5 修复）：
 * - 开始不能晚于结束（IN_BETWEEN 与 NOT_IN_BETWEEN 都查）
 * - 起止需落在可选范围内，且仅对 IN_BETWEEN 生效（D5/P2-2）：
 *   NOT_IN_BETWEEN 运行时不钳制（夹紧会反转排除语义）、取值控件是
 *   无 min/max 的自由文本，按可选范围拦截会禁止合法的「排除可选范围外
 *   区间」配置
 * - 固定值默认值也校验（P3-5：resolveDateRangeValues 对固定值按
 *   YYYY-MM-DD 严格解析，带时间部分的 timestamp 值会判无效被跳过，
 *   这里对固定值单独解析以支持 timestamp）
 * - 口径（P1-2）：动态默认用「从宽」口径（applyDataAvailabilityDelay=false）。
 *   运行时口径在每月 1–3 号会把最晚可选月提前一个月，标准动态默认
 *   （… → 1 个月前）必被误拦；运行时仍会按自身口径钳制展示/查询，保存
 *   期只需确认配置与从宽边界一致。固定值默认仍用运行时口径，与查看者
 *   看到的可选范围一致
 * - rolling 已启用但没有任何最晚可选月（无固定 max 且未开启动态 max）→ 拒绝保存
 * 返回错误对象（含解析后的实际边界，供文案展示）；通过则返回 null。
 */
export const validateDashboardFilterDateRange = (
    filterRule: DashboardFilterRule,
    referenceDate: Date = new Date(),
): DashboardFilterDateRangeValidationError | null => {
    if (
        filterRule.operator !== FilterOperator.IN_BETWEEN &&
        filterRule.operator !== FilterOperator.NOT_IN_BETWEEN
    ) {
        return null;
    }

    const granularity = filterRule.dateRangeGranularity ?? TimeFrames.DAY;

    // rolling 门禁：已激活（IN_BETWEEN + 月粒度 + 合法 N）但没有最晚可选月 →
    // 拒绝保存（否则「可选未来月 + N 个月」退化，§3.1）。
    // rolling 自身的下限由最晚可选月锚定，无 max 时解析结果不含它
    if (isRollingMinAllowedMonthsActive(filterRule)) {
        const { maxDate } = resolveRuleBounds(filterRule, referenceDate);
        if (maxDate == null) {
            return { code: 'rolling_requires_max' };
        }
    }

    // 固定值默认值也校验：动态模式从 settings 解析，固定模式取真实 values
    // （原实现固定传 values:[] 导致固定值恒 [null,null] 被跳过）
    const dynamicDefault = isDateRangeDynamic(filterRule);
    const parseFixedSlot = (raw: unknown): dayjs.Dayjs | null => {
        // 仅接受 YYYY-MM-DD（可带时间部分/时区后缀）形态，避免把 '2026-01'
        // 之类的残缺值当作合法日期（与原严格解析口径一致地跳过）
        if (
            typeof raw !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(raw)
        ) {
            return null;
        }
        const parsed = dayjs(raw);
        return parsed.isValid() ? parsed : null;
    };
    const [start, end]: Array<dayjs.Dayjs | null> = dynamicDefault
        ? (() => {
              const [startStr, endStr] = resolveDateRangeValues(
                  {
                      settings: filterRule.settings,
                      values: filterRule.values,
                  },
                  granularity,
                  referenceDate,
              );
              return [
                  startStr ? dayjs(startStr) : null,
                  endStr ? dayjs(endStr) : null,
              ];
          })()
        : [
              parseFixedSlot(filterRule.values?.[0]),
              parseFixedSlot(filterRule.values?.[1]),
          ];

    // 半边/空取值不在本校验范围（保存路径由 hasFilterValueSet 把关）
    if (!start?.isValid() || !end?.isValid()) {
        return null;
    }

    const unit = getCompareUnit(granularity);

    if (start.isAfter(end, unit)) {
        return { code: 'start_after_end' };
    }

    // D5/P2-2：NOT_IN_BETWEEN 不做可选范围校验（运行时不钳制、控件无
    // min/max）；仅保留 start_after_end
    if (filterRule.operator !== FilterOperator.IN_BETWEEN) {
        return null;
    }

    // P1-2：动态默认用从宽口径（false），固定值与运行时同口径
    const { minDate, maxDate } = resolveRuleBounds(filterRule, referenceDate, {
        applyDataAvailabilityDelay: !dynamicDefault,
    });

    if (maxDate && end.isAfter(dayjs(maxDate), unit)) {
        return { code: 'end_after_max', minDate, maxDate };
    }
    if (minDate && start.isBefore(dayjs(minDate), unit)) {
        return { code: 'start_before_min', minDate, maxDate };
    }

    return null;
};

export const normalizeExcludedValues = (
    values: string[] | undefined,
): string[] =>
    Array.from(
        new Set(
            (values ?? [])
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        ),
    );

export const mergeExcludedValues = (
    excludedValues: string[] | undefined,
    pendingExcludedValue?: string,
): string[] | undefined => {
    const pendingValue = pendingExcludedValue?.trim();
    const merged = normalizeExcludedValues([
        ...(excludedValues ?? []),
        ...(pendingValue ? [pendingValue] : []),
    ]);
    return merged.length > 0 ? merged : undefined;
};

export const removeValuesExcludedFromFilterRule = (
    filterRule: DashboardFilterRule,
    excludedValues: string[] | undefined,
): DashboardFilterRule => {
    const excludedSet = new Set(normalizeExcludedValues(excludedValues));
    if (excludedSet.size === 0 || !filterRule.values?.length) {
        return filterRule;
    }

    const filteredValues = filterRule.values.filter((value) => {
        if (value == null) {
            return true;
        }
        return !excludedSet.has(String(value).trim());
    });

    if (filteredValues.length === filterRule.values.length) {
        return filterRule;
    }

    return {
        ...filterRule,
        values: filteredValues.length > 0 ? filteredValues : undefined,
    };
};

export const mergePendingExcludedValueIntoRule = (
    filterRule: DashboardFilterRule,
    pendingExcludedValue?: string,
): DashboardFilterRule => ({
    ...filterRule,
    excludedValues: mergeExcludedValues(
        filterRule.excludedValues,
        pendingExcludedValue,
    ),
});

export const applyExcludedValuesToFilterRule = (
    filterRule: DashboardFilterRule,
    pendingExcludedValue?: string,
): DashboardFilterRule => {
    const mergedExcludedValues = mergeExcludedValues(
        filterRule.excludedValues,
        pendingExcludedValue,
    );

    return removeValuesExcludedFromFilterRule(
        {
            ...filterRule,
            excludedValues: mergedExcludedValues,
        },
        mergedExcludedValues,
    );
};

export const hasFilterValueSet = (filterRule: DashboardFilterRule) => {
    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return true;
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.LESS_THAN:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.STARTS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return filterRule.values && filterRule.values.length > 0;
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return (
                filterRule.settings &&
                filterRule.settings.unitOfTime &&
                filterRule.values &&
                filterRule.values.length > 0
            );
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return filterRule.settings && filterRule.settings.unitOfTime;
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            // Dynamic mode: the bounds are resolved at query time, so we
            // only need to check that both start and end are configured.
            if (isDateRangeDynamic(filterRule)) {
                const dr = (
                    filterRule.settings as {
                        dateRange?: { start?: unknown; end?: unknown };
                    }
                )?.dateRange;
                return !!dr?.start && !!dr?.end;
            }
            return (
                filterRule.values &&
                filterRule.values.length === 2 &&
                filterRule.values.every((val) => val != null && val !== '')
            );
        case FilterOperator.FROM_START_TO_LATEST_MONTH:
            return (
                filterRule.values != null &&
                filterRule.values.length > 0 &&
                filterRule.values[0] != null &&
                filterRule.values[0] !== ''
            );
        default:
            return assertUnreachable(filterRule.operator, 'unknown operator');
    }
};

export const isFilterEnabled = (
    filterRule?: DashboardFilterRule,
    isEditMode?: boolean,
    isCreatingNew?: boolean,
) => {
    if (!filterRule) return false;

    const isFilterRuleDisabled = filterRule.disabled;
    if (
        (isFilterRuleDisabled && isEditMode) ||
        (isFilterRuleDisabled && !isCreatingNew)
    ) {
        return true;
    }

    return hasFilterValueSet(filterRule);
};

export const getFilterRuleRevertableObject = (
    filterRule: DashboardFilterRule,
) => {
    return {
        target: filterRule.target,
        disabled: filterRule.disabled,
        required: filterRule.required,
        singleValue: filterRule.singleValue,
        values: filterRule.values,
        operator: filterRule.operator,
        settings: filterRule.settings,
        label: filterRule.label,
        tileTargets: filterRule.tileTargets,
        categoryLevel: filterRule.categoryLevel,
        parentFieldId: filterRule.parentFieldId,
        parentScope: filterRule.parentScope,
        parentTabUuid: filterRule.parentTabUuid,
        excludedValues: filterRule.excludedValues,
        allowedOperators: filterRule.allowedOperators,
        minAllowedDate: filterRule.minAllowedDate,
        maxAllowedDate: filterRule.maxAllowedDate,
        enableDynamicMaxAllowedDate: filterRule.enableDynamicMaxAllowedDate,
        dateRangeGranularity: filterRule.dateRangeGranularity,
        rollingMinAllowedMonths: filterRule.rollingMinAllowedMonths,
        readOnly: filterRule.readOnly,
        hidden: filterRule.hidden,
        clearable: filterRule.clearable,
    };
};

export const hasSavedFilterValueChanged = (
    originalFilterRule: DashboardFilterRule,
    filterRule: DashboardFilterRule,
) => {
    // FIXME: remove this once we fix Date value serialization.
    // example: with date inputs we get a Date object originally but a string after we save the filter
    const serializedInternalFilterRule = produce(filterRule, (draft) => {
        if (draft.values && draft.values.length > 0) {
            draft.values = draft.values.map((v) =>
                v instanceof Date ? v.toISOString() : v,
            );
        }
    });

    if (
        originalFilterRule.disabled &&
        serializedInternalFilterRule.values === undefined
    ) {
        // Keep disabled-filter value compatibility, but still detect other
        // configuration changes (label, tileTargets, singleValue, etc).
        const originalRuleForComparison = produce(
            originalFilterRule,
            (draft) => {
                draft.values = undefined;
            },
        );
        return !isEqual(
            getFilterRuleRevertableObject(originalRuleForComparison),
            getFilterRuleRevertableObject(serializedInternalFilterRule),
        );
    }

    return !isEqual(
        getFilterRuleRevertableObject(originalFilterRule),
        getFilterRuleRevertableObject(serializedInternalFilterRule),
    );
};

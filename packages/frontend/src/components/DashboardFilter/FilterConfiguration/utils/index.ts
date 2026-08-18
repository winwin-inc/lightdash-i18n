import {
    FilterOperator,
    TimeFrames,
    assertUnreachable,
    isDateRangeDynamic,
    resolveDateRangeValues,
    type DashboardFilterRule,
} from '@lightdash/common';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { produce } from 'immer';
import isEqual from 'lodash/isEqual';

import { getDashboardFilterDatePickerBounds } from '../../../common/Filters/utils/filterDateUtils';

dayjs.extend(quarterOfYear);

export type DashboardFilterDynamicDateRangeValidationError =
    | 'start_after_end'
    | 'end_after_max'
    | 'start_before_min';

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
 * 编辑看板筛选器时，校验动态默认日期：
 * - 开始不能晚于结束
 * - 起止需落在最早/最晚可选范围内（月份按上月，不套用 4 号数据可用规则）
 * 返回错误码供 UI 展示；通过则返回 null。
 */
export const validateDashboardFilterDynamicDateRange = (
    filterRule: DashboardFilterRule,
    referenceDate: Date = new Date(),
): DashboardFilterDynamicDateRangeValidationError | null => {
    if (
        filterRule.operator !== FilterOperator.IN_BETWEEN &&
        filterRule.operator !== FilterOperator.NOT_IN_BETWEEN
    ) {
        return null;
    }
    if (!isDateRangeDynamic(filterRule)) {
        return null;
    }

    const granularity = filterRule.dateRangeGranularity ?? TimeFrames.DAY;
    const ref = dayjs(referenceDate);

    const [startStr, endStr] = resolveDateRangeValues(
        { settings: filterRule.settings, values: [] },
        granularity,
        referenceDate,
    );
    const start = startStr ? dayjs(startStr) : null;
    const end = endStr ? dayjs(endStr) : null;

    if (!start?.isValid() || !end?.isValid()) {
        return null;
    }

    const unit = getCompareUnit(granularity);

    if (start.isAfter(end, unit)) {
        return 'start_after_end';
    }

    const { minDate, maxDate } = getDashboardFilterDatePickerBounds(
        filterRule.minAllowedDate,
        filterRule.maxAllowedDate,
        granularity,
        ref,
        false,
    );

    if (maxDate && end.isAfter(dayjs(maxDate), unit)) {
        return 'end_after_max';
    }
    if (minDate && start.isBefore(dayjs(minDate), unit)) {
        return 'start_before_min';
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
        excludedValues: filterRule.excludedValues,
        allowedOperators: filterRule.allowedOperators,
        minAllowedDate: filterRule.minAllowedDate,
        maxAllowedDate: filterRule.maxAllowedDate,
        dateRangeGranularity: filterRule.dateRangeGranularity,
        readOnly: filterRule.readOnly,
        hidden: filterRule.hidden,
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

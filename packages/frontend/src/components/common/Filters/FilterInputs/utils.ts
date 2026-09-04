import {
    assertUnreachable,
    DimensionType,
    FilterOperator,
    FilterType,
    formatBoolean,
    formatDate,
    getFilterTypeFromItem,
    getItemId,
    getLocalTimeDisplay,
    isCustomSqlDimension,
    isDashboardFilterRule,
    isDateRangeDynamic,
    isDimension,
    isField,
    isFilterableItem,
    isFilterRule,
    isMomentInput,
    resolveDateRangeValues,
    TimeFrames,
    type AnyType,
    type BaseFilterRule,
    type ConditionalRuleLabel,
    type CustomSqlDimension,
    type DashboardFilterableField,
    type DateRangeSetting,
    type Field,
    type FilterableItem,
    type TableCalculation,
} from '@lightdash/common';
import isEmpty from 'lodash/isEmpty';
import uniq from 'lodash/uniq';
import { type MomentInput } from 'moment';
import { useTranslation } from 'react-i18next';
import {
    clampDateRangeValuesToBounds,
    getDashboardFilterDatePickerBounds,
} from '../utils/filterDateUtils';
import { useFilterOperatorLabel } from './constants';
import { useUnitOfTimeLabels } from './useUnitOfTimeLabels';

const useTimeFilterOptions = (): Array<{
    value: FilterOperator;
    label: string;
}> => {
    const { getFilterOptions } = useFilterOperatorLabel();
    const { t } = useTranslation();

    return [
        ...getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.IN_THE_PAST,
            FilterOperator.NOT_IN_THE_PAST,
            FilterOperator.IN_THE_NEXT,
            FilterOperator.IN_THE_CURRENT,
            FilterOperator.NOT_IN_THE_CURRENT,
        ]),
        {
            value: FilterOperator.LESS_THAN,
            label: t(
                'components_common_filters_inputs.time_filter_options.is_before',
            ),
        },
        {
            value: FilterOperator.LESS_THAN_OR_EQUAL,
            label: t(
                'components_common_filters_inputs.time_filter_options.is_on_or_before',
            ),
        },
        {
            value: FilterOperator.GREATER_THAN,
            label: t(
                'components_common_filters_inputs.time_filter_options.is_after',
            ),
        },
        {
            value: FilterOperator.GREATER_THAN_OR_EQUAL,
            label: t(
                'components_common_filters_inputs.time_filter_options.is_on_or_after',
            ),
        },
        {
            value: FilterOperator.IN_BETWEEN,
            label: t(
                'components_common_filters_inputs.time_filter_options.is_between',
            ),
        },
        {
            value: FilterOperator.FROM_START_TO_LATEST_MONTH,
            label: t(
                'components_common_filters_inputs.time_filter_options.to_latest_month',
            ),
        },
    ];
};

export const useFilterOperatorOptions = () => {
    const { getFilterOptions } = useFilterOperatorLabel();
    const timeFilterOptions = useTimeFilterOptions();

    return (
        filterType: FilterType,
    ): Array<{ value: FilterOperator; label: string }> => {
        switch (filterType) {
            case FilterType.STRING:
                return getFilterOptions([
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                    FilterOperator.EQUALS,
                    FilterOperator.NOT_EQUALS,
                    FilterOperator.STARTS_WITH,
                    FilterOperator.ENDS_WITH,
                    FilterOperator.INCLUDE,
                    FilterOperator.NOT_INCLUDE,
                ]);
            case FilterType.NUMBER:
                return getFilterOptions([
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                    FilterOperator.EQUALS,
                    FilterOperator.NOT_EQUALS,
                    FilterOperator.LESS_THAN,
                    FilterOperator.LESS_THAN_OR_EQUAL,
                    FilterOperator.GREATER_THAN,
                    FilterOperator.GREATER_THAN_OR_EQUAL,
                    FilterOperator.IN_BETWEEN,
                    FilterOperator.NOT_IN_BETWEEN,
                ]);
            case FilterType.BOOLEAN:
                return getFilterOptions([
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                    FilterOperator.EQUALS,
                    FilterOperator.NOT_EQUALS,
                ]);
            case FilterType.DATE:
                return timeFilterOptions;
            default:
                return assertUnreachable(
                    filterType,
                    `Unexpected filter type: ${filterType}`,
                );
        }
    };
};

// Effective display granularity for a date filter chip.
// The user-chosen `dateRangeGranularity` on the dashboard rule wins;
// otherwise we always default to DAY. Field timeInterval is intentionally
// not used as a fallback — the user opts in to month/quarter/year display
// via the date selector, and exploring a day-typed field with no override
// should always show day-level dates.
const getEffectiveDateInterval = (rule: BaseFilterRule): TimeFrames => {
    if (rule.dateRangeGranularity) return rule.dateRangeGranularity;
    return TimeFrames.DAY;
};

/**
 * Keep a dynamic rule's current values while preventing downstream consumers
 * from resolving its saved dynamic default again.
 */
export const getDateRangeRuleWithFixedValues = <
    T extends BaseFilterRule & {
        settings?: { dateRange?: DateRangeSetting };
    },
>(
    rule: T,
): T => {
    if (!isDateRangeDynamic(rule) || !rule.settings) return rule;

    const { dateRange: _drop, ...settings } = rule.settings;

    return {
        ...rule,
        settings,
    } as T;
};

/**
 * If the rule has a dynamic date range, re-resolve the `values` from
 * `settings.dateRange` using the current date so the displayed chip label
 * always reflects "now" rather than the stale values saved at config time.
 * Returns the original `values` for non-dynamic rules.
 */
export const resolveDisplayValues = (
    rule: BaseFilterRule & {
        settings?: { dateRange?: DateRangeSetting };
        minAllowedDate?: string;
        maxAllowedDate?: string;
        dateRangeGranularity?: TimeFrames;
        enableDynamicMaxAllowedDate?: boolean;
    },
    now: Date = new Date(),
): AnyType[] | undefined => {
    if (!isDateRangeDynamic(rule)) return rule.values;
    const dr = rule.settings?.dateRange;
    if (!dr) return rule.values;
    const granularity = rule.dateRangeGranularity ?? TimeFrames.DAY;
    const resolved = resolveDateRangeValues(rule, granularity, now).filter(
        (value): value is string => value !== null,
    );
    const { minDate, maxDate } = getDashboardFilterDatePickerBounds(
        rule.minAllowedDate,
        rule.maxAllowedDate,
        granularity,
        now,
        true,
        !!rule.enableDynamicMaxAllowedDate,
    );
    return clampDateRangeValuesToBounds(
        resolved,
        minDate,
        maxDate,
        granularity,
    );
};

/**
 * Returns a new rule with `values` re-resolved from `settings.dateRange`
 * if the rule is a dynamic date range. Non-dynamic rules are returned as-is.
 * Use this to ensure filter rules sent to the backend have up-to-date
 * `values` that match what the user sees in the chip label.
 */
export const resolveDynamicDateRangeRule = <
    T extends BaseFilterRule & { settings?: { dateRange?: DateRangeSetting } },
>(
    rule: T,
    now: Date = new Date(),
): T => {
    if (!isDateRangeDynamic(rule)) return rule;
    const resolved = resolveDisplayValues(rule, now);
    if (resolved === rule.values) return rule;
    return { ...rule, values: resolved };
};

/** 查询前解析动态日期并去掉 dateRange，保证接口参数与筛选器展示一致 */
export const prepareDashboardFilterRuleForQuery = <
    T extends BaseFilterRule & { settings?: { dateRange?: DateRangeSetting } },
>(
    rule: T,
    now: Date = new Date(),
): T => getDateRangeRuleWithFixedValues(resolveDynamicDateRangeRule(rule, now));

const useValueAsString = () => {
    const { t } = useTranslation();
    const { formatRelativeTimeDisplay } = useUnitOfTimeLabels();

    return (
        filterType: FilterType,
        rule: BaseFilterRule,
        field?: Field | TableCalculation | CustomSqlDimension,
    ) => {
        const { operator } = rule;
        const values = resolveDisplayValues(rule);
        const firstValue = values?.[0];
        const secondValue = values?.[1];

        switch (filterType) {
            case FilterType.STRING:
            case FilterType.NUMBER:
                switch (operator) {
                    case FilterOperator.IN_BETWEEN:
                    case FilterOperator.NOT_IN_BETWEEN:
                        return `${firstValue || 0}, ${secondValue || 0}`;
                    default:
                        return values?.join(', ');
                }
            case FilterType.BOOLEAN:
                return values?.map(formatBoolean).join(', ');
            case FilterType.DATE:
                switch (operator) {
                    case FilterOperator.IN_THE_PAST:
                    case FilterOperator.NOT_IN_THE_PAST:
                    case FilterOperator.IN_THE_NEXT:
                    case FilterOperator.IN_THE_CURRENT:
                    case FilterOperator.NOT_IN_THE_CURRENT: {
                        const relativeDisplay = formatRelativeTimeDisplay(rule);
                        if (relativeDisplay) {
                            return relativeDisplay;
                        }
                        if (!isFilterRule(rule)) {
                            throw new Error('Invalid rule');
                        }
                        return `${firstValue ?? ''} ${
                            rule.settings?.unitOfTime ?? ''
                        }`.trim();
                    }
                    case FilterOperator.IN_BETWEEN: {
                        if (
                            isDimension(field) &&
                            isMomentInput(firstValue) &&
                            isMomentInput(secondValue) &&
                            field.type === DimensionType.DATE
                        ) {
                            const rangeSeparator = t(
                                'components_common_filters_inputs.date_range.and',
                            );
                            const interval = getEffectiveDateInterval(rule);
                            return `${formatDate(
                                firstValue as MomentInput,
                                interval,
                            )} ${rangeSeparator} ${formatDate(
                                secondValue as MomentInput,
                                interval,
                            )}`;
                        }
                        {
                            const rangeSeparator = t(
                                'components_common_filters_inputs.date_range.and',
                            );
                            return `${getLocalTimeDisplay(
                                firstValue as MomentInput,
                                false,
                            )} ${rangeSeparator} ${getLocalTimeDisplay(
                                secondValue as MomentInput,
                            )}`;
                        }
                    }
                    case FilterOperator.FROM_START_TO_LATEST_MONTH: {
                        const startDisplay =
                            isDimension(field) &&
                            isMomentInput(firstValue) &&
                            field.type === DimensionType.DATE
                                ? formatDate(
                                      firstValue as MomentInput,
                                      getEffectiveDateInterval(rule),
                                  )
                                : isMomentInput(firstValue)
                                ? getLocalTimeDisplay(
                                      firstValue as MomentInput,
                                      false,
                                  )
                                : String(firstValue ?? '');
                        return t(
                            'components_common_filters_inputs.to_latest_month_chip',
                            { start: startDisplay },
                        );
                    }
                    case FilterOperator.NULL:
                    case FilterOperator.NOT_NULL:
                    case FilterOperator.EQUALS:
                    case FilterOperator.NOT_EQUALS:
                    case FilterOperator.STARTS_WITH:
                    case FilterOperator.ENDS_WITH:
                    case FilterOperator.INCLUDE:
                    case FilterOperator.NOT_INCLUDE:
                    case FilterOperator.LESS_THAN:
                    case FilterOperator.LESS_THAN_OR_EQUAL:
                    case FilterOperator.GREATER_THAN:
                    case FilterOperator.GREATER_THAN_OR_EQUAL:
                        return values
                            ?.map((value) => {
                                const type = field
                                    ? isCustomSqlDimension(field)
                                        ? field.dimensionType
                                        : field.type
                                    : DimensionType.TIMESTAMP;
                                if (
                                    isDimension(field) &&
                                    isMomentInput(value) &&
                                    type === DimensionType.TIMESTAMP
                                ) {
                                    return getLocalTimeDisplay(value);
                                } else if (
                                    isDimension(field) &&
                                    isMomentInput(value) &&
                                    type === DimensionType.DATE
                                ) {
                                    return formatDate(
                                        value,
                                        getEffectiveDateInterval(rule),
                                    );
                                } else {
                                    return value;
                                }
                            })
                            .join(', ');
                    default:
                        return assertUnreachable(
                            operator as never,
                            `Unexpected operator: ${operator}`,
                        );
                }
            default:
                return assertUnreachable(
                    filterType as never,
                    `Unexpected filter type: ${filterType}`,
                );
        }
    };
};

const buildConditionalRuleLabel = (
    rule: BaseFilterRule,
    filterType: FilterType,
    fieldLabel: string,
    getFilterOperatorOptions: ReturnType<typeof useFilterOperatorOptions>,
    filterOperatorLabel: ReturnType<
        typeof useFilterOperatorLabel
    >['filterOperatorLabel'],
    getValueAsString: ReturnType<typeof useValueAsString>,
    formatRelativeTimeDisplay: ReturnType<
        typeof useUnitOfTimeLabels
    >['formatRelativeTimeDisplay'],
    field?: Field | TableCalculation | CustomSqlDimension,
): ConditionalRuleLabel => {
    const relativeDisplay = formatRelativeTimeDisplay(rule);
    if (relativeDisplay) {
        return {
            field: fieldLabel,
            operator: '',
            value: relativeDisplay,
        };
    }

    const operatorOptions = getFilterOperatorOptions(filterType);
    const operationLabel =
        operatorOptions.find((o) => o.value === rule.operator)?.label ||
        filterOperatorLabel[rule.operator];

    return {
        field: fieldLabel,
        operator: operationLabel,
        value: getValueAsString(filterType, rule, field),
    };
};

export const useConditionalRuleLabel = () => {
    const { filterOperatorLabel } = useFilterOperatorLabel();
    const { formatRelativeTimeDisplay } = useUnitOfTimeLabels();

    const getFilterOperatorOptions = useFilterOperatorOptions();
    const getValueAsString = useValueAsString();

    return (
        rule: BaseFilterRule,
        filterType: FilterType,
        label: string,
    ): ConditionalRuleLabel =>
        buildConditionalRuleLabel(
            rule,
            filterType,
            label,
            getFilterOperatorOptions,
            filterOperatorLabel,
            getValueAsString,
            formatRelativeTimeDisplay,
        );
};

export const useConditionalRuleLabelFromItem = () => {
    const { filterOperatorLabel } = useFilterOperatorLabel();
    const { formatRelativeTimeDisplay } = useUnitOfTimeLabels();

    const getFilterOperatorOptions = useFilterOperatorOptions();
    const getValueAsString = useValueAsString();

    return (
        rule: BaseFilterRule,
        item: FilterableItem,
    ): ConditionalRuleLabel => {
        const filterType = isFilterableItem(item)
            ? getFilterTypeFromItem(item)
            : FilterType.STRING;

        return buildConditionalRuleLabel(
            rule,
            filterType,
            isField(item) ? item.label : item.name,
            getFilterOperatorOptions,
            filterOperatorLabel,
            getValueAsString,
            formatRelativeTimeDisplay,
            item,
        );
    };
};

const tableLabelFromDashboardField = (f: DashboardFilterableField): string =>
    'tableLabel' in f && f.tableLabel !== undefined ? f.tableLabel : f.table;

export const getFilterRuleTables = (
    filterRule: BaseFilterRule,
    field: DashboardFilterableField,
    filterableFields: DashboardFilterableField[],
): string[] => {
    if (
        isDashboardFilterRule(filterRule) &&
        filterRule.tileTargets &&
        !isEmpty(filterRule.tileTargets)
    ) {
        return Object.values(filterRule.tileTargets).reduce<string[]>(
            (tables, tileTarget) => {
                const targetField = filterableFields.find(
                    (f) =>
                        tileTarget !== false &&
                        f.table === tileTarget.tableName &&
                        getItemId(f) === tileTarget.fieldId,
                );
                return targetField
                    ? uniq([
                          ...tables,
                          tableLabelFromDashboardField(targetField),
                      ])
                    : tables;
            },
            [],
        );
    }
    return [tableLabelFromDashboardField(field)];
};

export const formatDisplayValue = (value: string): string => {
    return value
        .replace(/^\s+|\s+$/g, (match) => '␣'.repeat(match.length))
        .replace(/\n/g, '↵');
};

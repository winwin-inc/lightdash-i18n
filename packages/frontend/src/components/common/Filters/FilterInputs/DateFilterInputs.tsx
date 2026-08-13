import {
    DimensionType,
    FilterOperator,
    TimeFrames,
    formatDate,
    isCustomSqlDimension,
    isDimension,
    isFilterRule,
    parseDate,
    timeframeToUnitOfTime,
    type BaseFilterRule,
    type DashboardFilterRule,
    type DateFilterRule,
} from '@lightdash/common';
import { Flex, NumberInput, Text } from '@mantine/core';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { type FilterInputsProps } from '.';
import useFiltersContext from '../useFiltersContext';
import {
    getDashboardFilterDatePickerBounds,
    getFirstDayOfWeek,
} from '../utils/filterDateUtils';
import { usePlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import DefaultFilterInputs from './DefaultFilterInputs';
import FilterDatePicker from './FilterDatePicker';
import FilterDateTimePicker from './FilterDateTimePicker';
import FilterDateTimeRangePicker from './FilterDateTimeRangePicker';
import FilterDynamicDateRangePicker from './FilterDynamicDateRangePicker';
import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import FilterQuarterPicker from './FilterQuarterPicker';
import FilterUnitOfTimeAutoComplete from './FilterUnitOfTimeAutoComplete';
import FilterWeekPicker from './FilterWeekPicker';
import FilterYearPicker from './FilterYearPicker';

const DateFilterInputs = <T extends BaseFilterRule = DateFilterRule>(
    props: FilterInputsProps<T>,
) => {
    const { t } = useTranslation();
    const { field, rule, onChange, popoverProps, disabled, filterType } = props;
    const { startOfWeek } = useFiltersContext();

    const isTimestamp =
        !field ||
        (isCustomSqlDimension(field) ? field.dimensionType : field.type) ===
            DimensionType.TIMESTAMP;

    if (!isFilterRule(rule)) {
        throw new Error(t('components_common_filters_inputs.rule_error'));
    }

    const getPlaceholderByFilterTypeAndOperator =
        usePlaceholderByFilterTypeAndOperator();

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: rule.disabled && !rule.values,
    });

    const dashboardRule = rule as unknown as DashboardFilterRule;
    const timeIntervalStr =
        isDimension(field) && field.timeInterval
            ? String(field.timeInterval)
            : undefined;
    const { minDate: cfgMin, maxDate: cfgMax } =
        getDashboardFilterDatePickerBounds(
            dashboardRule.minAllowedDate,
            dashboardRule.maxAllowedDate,
            timeIntervalStr,
        );

    switch (rule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.FROM_START_TO_LATEST_MONTH:
            if (isDimension(field) && field.timeInterval) {
                switch (field.timeInterval.toUpperCase()) {
                    case TimeFrames.WEEK:
                        return (
                            <Flex align="center" gap="xs" w="100%">
                                {rule.operator ===
                                    FilterOperator.FROM_START_TO_LATEST_MONTH && (
                                    <Text
                                        color="dimmed"
                                        sx={{ whiteSpace: 'nowrap' }}
                                        size="xs"
                                    >
                                        {t(
                                            'components_common_filters_inputs.to_latest_month_hint',
                                        )}
                                    </Text>
                                )}
                                <Text
                                    color="dimmed"
                                    sx={{ whiteSpace: 'nowrap' }}
                                    size="xs"
                                >
                                    {t(
                                        'components_common_filters_inputs.week_commencing',
                                    )}
                                </Text>

                                <FilterWeekPicker
                                    placeholder={placeholder}
                                    disabled={disabled}
                                    minDate={cfgMin}
                                    maxDate={cfgMax}
                                    autoFocus={true}
                                    value={
                                        rule.values && rule.values[0]
                                            ? parseDate(
                                                  formatDate(
                                                      rule.values[0],
                                                      TimeFrames.WEEK,
                                                  ),
                                                  TimeFrames.WEEK,
                                              )
                                            : null
                                    }
                                    // FIXME: mantine v7
                                    // mantine does not set the first day of the week based on the locale
                                    // so we need to do it manually and always pass it as a prop
                                    firstDayOfWeek={getFirstDayOfWeek(
                                        startOfWeek,
                                    )}
                                    popoverProps={popoverProps}
                                    onChange={(value: Date | null) => {
                                        onChange({
                                            ...rule,
                                            values: value
                                                ? [
                                                      formatDate(
                                                          value,
                                                          TimeFrames.WEEK,
                                                      ),
                                                  ]
                                                : [],
                                        });
                                    }}
                                />
                            </Flex>
                        );
                    case TimeFrames.MONTH:
                        return (
                            <Flex direction="column" gap={4} w="100%">
                                {rule.operator ===
                                    FilterOperator.FROM_START_TO_LATEST_MONTH && (
                                    <Text color="dimmed" size="xs">
                                        {t(
                                            'components_common_filters_inputs.to_latest_month_hint',
                                        )}
                                    </Text>
                                )}
                                <FilterMonthAndYearPicker
                                    disabled={disabled}
                                    minDate={cfgMin}
                                    maxDate={cfgMax}
                                    // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                                    // @ts-ignore
                                    placeholder={placeholder}
                                    autoFocus={true}
                                    popoverProps={popoverProps}
                                    value={
                                        rule.values && rule.values[0]
                                            ? parseDate(
                                                  formatDate(
                                                      rule.values[0],
                                                      TimeFrames.MONTH,
                                                  ),
                                                  TimeFrames.MONTH,
                                              )
                                            : null
                                    }
                                    onChange={(value: Date | null) => {
                                        onChange({
                                            ...rule,
                                            values: [
                                                formatDate(
                                                    value,
                                                    TimeFrames.MONTH,
                                                ),
                                            ],
                                        });
                                    }}
                                />
                            </Flex>
                        );
                    case TimeFrames.QUARTER:
                        const ruleValue = rule.values?.[0];
                        const parsedValue = ruleValue
                            ? parseDate(ruleValue, TimeFrames.DAY)
                            : null;
                        return (
                            <FilterQuarterPicker
                                disabled={disabled}
                                minDate={cfgMin}
                                maxDate={cfgMax}
                                placeholder={placeholder}
                                autoFocus={true}
                                popoverProps={popoverProps}
                                value={parsedValue}
                                onChange={(newDate: Date | null) => {
                                    onChange({
                                        ...rule,
                                        values: [
                                            formatDate(newDate, TimeFrames.DAY),
                                        ],
                                    });
                                }}
                            />
                        );
                    case TimeFrames.YEAR:
                        return (
                            <FilterYearPicker
                                disabled={disabled}
                                minDate={cfgMin}
                                maxDate={cfgMax}
                                // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                                // @ts-ignore
                                placeholder={placeholder}
                                autoFocus={true}
                                popoverProps={popoverProps}
                                value={
                                    rule.values && rule.values[0]
                                        ? parseDate(
                                              formatDate(
                                                  rule.values[0],
                                                  TimeFrames.YEAR,
                                              ),
                                              TimeFrames.YEAR,
                                          )
                                        : null
                                }
                                onChange={(newDate: Date | null) => {
                                    onChange({
                                        ...rule,
                                        values: [
                                            formatDate(
                                                newDate,
                                                TimeFrames.YEAR,
                                            ),
                                        ],
                                    });
                                }}
                            />
                        );
                    default:
                        break;
                }
            }

            if (isTimestamp) {
                // For display only

                let value =
                    rule.values && rule.values[0]
                        ? dayjs(rule?.values?.[0]).toDate()
                        : dayjs().toDate(); // Create

                return (
                    <FilterDateTimePicker
                        disabled={disabled}
                        minDate={cfgMin}
                        maxDate={cfgMax}
                        // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                        // @ts-ignore
                        placeholder={placeholder}
                        autoFocus={true}
                        withSeconds
                        // FIXME: mantine v7
                        // mantine does not set the first day of the week based on the locale
                        // so we need to do it manually and always pass it as a prop
                        firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                        popoverProps={popoverProps}
                        value={value}
                        onChange={(v: Date | null) => {
                            onChange({
                                ...rule,
                                // format as an ISO string, not for display
                                values: v === null ? [] : [dayjs(v).format()],
                            });
                        }}
                    />
                );
            }

            return (
                <Flex direction="column" gap={4} w="100%">
                    {rule.operator ===
                        FilterOperator.FROM_START_TO_LATEST_MONTH && (
                        <Text color="dimmed" size="xs">
                            {t(
                                'components_common_filters_inputs.to_latest_month_hint',
                            )}
                        </Text>
                    )}
                    <FilterDatePicker
                        disabled={disabled}
                        minDate={cfgMin}
                        maxDate={cfgMax}
                        placeholder={placeholder}
                        // FIXME: mantine v7
                        // mantine does not set the first day of the week based on the locale
                        // so we need to do it manually and always pass it as a prop
                        firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                        popoverProps={popoverProps}
                        autoFocus={true}
                        value={
                            rule.values
                                ? parseDate(
                                      formatDate(
                                          rule.values[0],
                                          TimeFrames.DAY,
                                      ),
                                      TimeFrames.DAY,
                                  )
                                : null
                        }
                        onChange={(value: Date | null) => {
                            onChange({
                                ...rule,
                                values: value
                                    ? [formatDate(value, TimeFrames.DAY)]
                                    : [],
                            });
                        }}
                    />
                </Flex>
            );
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            const parsedValue = parseInt(rule.values?.[0], 10);
            return (
                <Flex gap="xs" w="100%">
                    <NumberInput
                        size="xs"
                        sx={{ flexShrink: 1, flexGrow: 1 }}
                        placeholder={placeholder}
                        disabled={disabled}
                        autoFocus={true}
                        value={isNaN(parsedValue) ? undefined : parsedValue}
                        min={0}
                        onChange={(value) => {
                            onChange({
                                ...rule,
                                values: value === '' ? [] : [value],
                            });
                        }}
                    />

                    <FilterUnitOfTimeAutoComplete
                        disabled={disabled}
                        sx={{ flexShrink: 0, flexGrow: 3 }}
                        isTimestamp={isTimestamp}
                        minUnitOfTime={
                            isDimension(field) && field.timeInterval
                                ? timeframeToUnitOfTime(field.timeInterval)
                                : undefined
                        }
                        unitOfTime={rule.settings?.unitOfTime}
                        completed={rule.settings?.completed || false}
                        withinPortal={popoverProps?.withinPortal}
                        onDropdownOpen={popoverProps?.onOpen}
                        onDropdownClose={popoverProps?.onClose}
                        onChange={(value) =>
                            onChange({
                                ...rule,
                                settings: {
                                    unitOfTime: value.unitOfTime,
                                    completed: value.completed,
                                },
                            })
                        }
                    />
                </Flex>
            );
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return (
                <FilterUnitOfTimeAutoComplete
                    w="100%"
                    disabled={disabled}
                    isTimestamp={isTimestamp}
                    unitOfTime={rule.settings?.unitOfTime}
                    minUnitOfTime={
                        isDimension(field) && field.timeInterval
                            ? timeframeToUnitOfTime(field.timeInterval)
                            : undefined
                    }
                    showOptionsInPlural={false}
                    showCompletedOptions={false}
                    autoFocus={!rule.settings?.unitOfTime}
                    completed={false}
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            settings: {
                                unitOfTime: value.unitOfTime,
                                completed: false,
                            },
                        })
                    }
                />
            );
        case FilterOperator.IN_BETWEEN:
            if (isTimestamp) {
                return (
                    <FilterDateTimeRangePicker
                        disabled={disabled}
                        filterMinDate={cfgMin}
                        filterMaxDate={cfgMax}
                        autoFocus={true}
                        firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                        value={
                            rule.values && rule.values[0] && rule.values[1]
                                ? [
                                      dayjs(rule.values[0]).toDate(),
                                      dayjs(rule.values[1]).toDate(),
                                  ]
                                : null
                        }
                        popoverProps={popoverProps}
                        onChange={(value: [Date, Date] | null) => {
                            onChange({
                                ...rule,
                                values: value
                                    ? [
                                          dayjs(value[0]).format(),
                                          dayjs(value[1]).format(),
                                      ]
                                    : [],
                            });
                        }}
                    />
                );
            }

            // Effective granularity for the "in between" range picker.
            // The user-chosen dateRangeGranularity (set via the date-range
            // constraint editor in dashboard config) is the only override.
            // Otherwise we always default to DAY — for dashboard filters
            // the user opts in to month/quarter/year pickers via the date
            // selector; in the explore page there is no date selector and
            // the value-range picker is always day-based.
            const rangeGranularity =
                dashboardRule.dateRangeGranularity ?? TimeFrames.DAY;

            return (
                <FilterDynamicDateRangePicker
                    rule={
                        rule as unknown as Parameters<
                            typeof FilterDynamicDateRangePicker
                        >[0]['rule']
                    }
                    onChange={
                        onChange as unknown as Parameters<
                            typeof FilterDynamicDateRangePicker
                        >[0]['onChange']
                    }
                    granularity={rangeGranularity}
                    filterMinDate={cfgMin}
                    filterMaxDate={cfgMax}
                    firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                    disabled={disabled}
                />
            );
        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default DateFilterInputs;

import {
    FilterOperator,
    TimeFrames,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Group, Stack, Switch, Text, type PopoverProps } from '@mantine/core';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FilterDatePicker from '../../common/Filters/FilterInputs/FilterDatePicker';
import FilterMonthAndYearPicker from '../../common/Filters/FilterInputs/FilterMonthAndYearPicker';
import FilterQuarterPicker from '../../common/Filters/FilterInputs/FilterQuarterPicker';
import FilterYearPicker from '../../common/Filters/FilterInputs/FilterYearPicker';
import useFiltersContext from '../../common/Filters/useFiltersContext';
import { getFirstDayOfWeek } from '../../common/Filters/utils/filterDateUtils';

type Props = {
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
};

const DateRangeConstraintEditor: FC<Props> = ({
    filterRule,
    popoverProps,
    onChangeFilterRule,
}) => {
    const { t } = useTranslation();
    const { startOfWeek } = useFiltersContext();

    // Granularity used by the min/max pickers.
    // - For IN_BETWEEN / NOT_IN_BETWEEN: the user-chosen dateRangeGranularity
    //   (set via the date selector) drives the picker type so e.g. a month
    //   range filter gets month pickers for min/max too.
    // - For every other operator the min/max are always day pickers. The
    //   date selector is hidden in those operators anyway, so the only sane
    //   default is DAY.
    const isRangeOperator =
        filterRule.operator === FilterOperator.IN_BETWEEN ||
        filterRule.operator === FilterOperator.NOT_IN_BETWEEN;
    const granularity = isRangeOperator
        ? filterRule.dateRangeGranularity ?? TimeFrames.DAY
        : TimeFrames.DAY;

    const normalizeBoundaryValue = (d: Date | null, isMax: boolean) => {
        if (!d) return undefined;
        const date = dayjs(d);
        if (granularity === TimeFrames.MONTH) {
            return (isMax ? date.endOf('month') : date.startOf('month')).format(
                'YYYY-MM-DD',
            );
        }
        if (granularity === TimeFrames.YEAR) {
            return (isMax ? date.endOf('year') : date.startOf('year')).format(
                'YYYY-MM-DD',
            );
        }
        if (granularity === TimeFrames.QUARTER) {
            return (
                isMax ? date.endOf('quarter') : date.startOf('quarter')
            ).format('YYYY-MM-DD');
        }
        return date.format('YYYY-MM-DD');
    };

    const handleMinChange = (d: Date | null) => {
        const minStr = normalizeBoundaryValue(d, false);
        let maxStr = filterRule.maxAllowedDate;
        if (minStr && maxStr && dayjs(minStr).isAfter(dayjs(maxStr))) {
            maxStr = undefined;
        }
        onChangeFilterRule({
            ...filterRule,
            minAllowedDate: minStr,
            maxAllowedDate: maxStr,
        });
    };

    const handleMaxChange = (d: Date | null) => {
        const maxStr = normalizeBoundaryValue(d, true);
        let minStr = filterRule.minAllowedDate;
        if (minStr && maxStr && dayjs(minStr).isAfter(dayjs(maxStr))) {
            minStr = undefined;
        }
        onChangeFilterRule({
            ...filterRule,
            minAllowedDate: minStr,
            maxAllowedDate: maxStr,
        });
    };

    const minDateValue = filterRule.minAllowedDate
        ? dayjs(filterRule.minAllowedDate).toDate()
        : null;
    const maxDateValue = filterRule.maxAllowedDate
        ? dayjs(filterRule.maxAllowedDate).toDate()
        : null;

    const showDynamicMaxSwitch =
        filterRule.operator === FilterOperator.IN_BETWEEN &&
        (granularity === TimeFrames.MONTH ||
            granularity === TimeFrames.QUARTER);

    return (
        <Stack spacing="xs" mt="xs">
            {showDynamicMaxSwitch && (
                <Switch
                    size="xs"
                    label={
                        <Text size="xs" fw={500}>
                            {t(
                                'components_dashboard_filter.configuration.date_range.dynamic_max_label',
                            )}
                        </Text>
                    }
                    description={t(
                        'components_dashboard_filter.configuration.date_range.dynamic_max_description',
                    )}
                    checked={!!filterRule.enableDynamicMaxAllowedDate}
                    onChange={(e) => {
                        const enabled = e.currentTarget.checked;
                        onChangeFilterRule({
                            ...filterRule,
                            enableDynamicMaxAllowedDate: enabled || undefined,
                            maxAllowedDate: enabled
                                ? undefined
                                : filterRule.maxAllowedDate,
                        });
                    }}
                />
            )}
            <Text size="xs" color="dimmed">
                {t('components_dashboard_filter.configuration.date_range.hint')}
            </Text>
            <Group
                grow
                noWrap
                align="flex-start"
                sx={{ '& > *': { minWidth: 0, flex: 1 } }}
            >
                {granularity === TimeFrames.MONTH ? (
                    <>
                        <FilterMonthAndYearPicker
                            clearable
                            label={t(
                                'components_dashboard_filter.configuration.date_range.min_label',
                            )}
                            value={minDateValue}
                            maxDate={maxDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMinChange}
                        />
                        <FilterMonthAndYearPicker
                            clearable
                            disabled={!!filterRule.enableDynamicMaxAllowedDate}
                            label={t(
                                'components_dashboard_filter.configuration.date_range.max_label',
                            )}
                            value={maxDateValue}
                            minDate={minDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMaxChange}
                        />
                    </>
                ) : granularity === TimeFrames.YEAR ? (
                    <>
                        <FilterYearPicker
                            clearable
                            label={t(
                                'components_dashboard_filter.configuration.date_range.min_label',
                            )}
                            value={minDateValue}
                            maxDate={maxDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMinChange}
                        />
                        <FilterYearPicker
                            clearable
                            label={t(
                                'components_dashboard_filter.configuration.date_range.max_label',
                            )}
                            value={maxDateValue}
                            minDate={minDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMaxChange}
                        />
                    </>
                ) : granularity === TimeFrames.QUARTER ? (
                    <>
                        <Stack spacing="xxs">
                            <Text size="xs" fw={500}>
                                {t(
                                    'components_dashboard_filter.configuration.date_range.min_label',
                                )}
                            </Text>
                            <FilterQuarterPicker
                                value={minDateValue}
                                maxDate={maxDateValue ?? undefined}
                                popoverProps={{
                                    shadow: 'sm',
                                    ...popoverProps,
                                }}
                                onChange={handleMinChange}
                            />
                        </Stack>
                        <Stack spacing="xxs">
                            <Text size="xs" fw={500}>
                                {t(
                                    'components_dashboard_filter.configuration.date_range.max_label',
                                )}
                            </Text>
                            <FilterQuarterPicker
                                disabled={
                                    !!filterRule.enableDynamicMaxAllowedDate
                                }
                                value={maxDateValue}
                                minDate={minDateValue ?? undefined}
                                popoverProps={{
                                    shadow: 'sm',
                                    ...popoverProps,
                                }}
                                onChange={handleMaxChange}
                            />
                        </Stack>
                    </>
                ) : (
                    <>
                        <FilterDatePicker
                            clearable
                            label={t(
                                'components_dashboard_filter.configuration.date_range.min_label',
                            )}
                            value={minDateValue}
                            maxDate={maxDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                            onChange={handleMinChange}
                        />
                        <FilterDatePicker
                            clearable
                            label={t(
                                'components_dashboard_filter.configuration.date_range.max_label',
                            )}
                            value={maxDateValue}
                            minDate={minDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                            onChange={handleMaxChange}
                        />
                    </>
                )}
            </Group>
        </Stack>
    );
};

export default DateRangeConstraintEditor;

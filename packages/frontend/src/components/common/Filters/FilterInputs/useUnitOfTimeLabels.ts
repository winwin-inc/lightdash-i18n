import {
    FilterOperator,
    getUnitsOfTimeGreaterOrEqual,
    isFilterRule,
    UnitOfTime,
    type BaseFilterRule,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const RELATIVE_TIME_OPERATORS = new Set<FilterOperator>([
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_NEXT,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.NOT_IN_THE_CURRENT,
]);

export const useUnitOfTimeLabels = () => {
    const { t } = useTranslation();

    const getUnitLabel = useCallback(
        (
            unitOfTime: UnitOfTime,
            isPlural: boolean,
            isCompleted: boolean,
        ): string => {
            const unitKey = isPlural
                ? `${unitOfTime}_plural`
                : unitOfTime;
            const unitLabel = t(
                `components_common_filters_inputs.unit_of_time.${unitKey}`,
            );

            if (isCompleted) {
                return t(
                    'components_common_filters_inputs.unit_of_time.completed',
                    { unit: unitLabel },
                );
            }

            return unitLabel;
        },
        [t],
    );

    const getUnitOfTimeOptions = useCallback(
        ({
            isTimestamp,
            minUnitOfTime,
            showCompletedOptions,
            showOptionsInPlural,
        }: {
            isTimestamp: boolean;
            minUnitOfTime?: UnitOfTime;
            showCompletedOptions: boolean;
            showOptionsInPlural: boolean;
        }) => {
            const dateIndex = Object.keys(UnitOfTime).indexOf(
                UnitOfTime.days,
            );

            const unitsOfTime = minUnitOfTime
                ? getUnitsOfTimeGreaterOrEqual(minUnitOfTime)
                : isTimestamp
                  ? Object.values(UnitOfTime)
                  : Object.values(UnitOfTime).slice(dateIndex);

            return unitsOfTime
                .reverse()
                .reduce<{ label: string; value: string }[]>(
                    (sum, unitOfTime) => {
                        const newOptions = [
                            ...sum,
                            {
                                label: getUnitLabel(
                                    unitOfTime,
                                    showOptionsInPlural,
                                    false,
                                ),
                                value: unitOfTime.toString(),
                            },
                        ];

                        if (showCompletedOptions) {
                            newOptions.push({
                                label: getUnitLabel(
                                    unitOfTime,
                                    showOptionsInPlural,
                                    true,
                                ),
                                value: `${unitOfTime}-completed`,
                            });
                        }

                        return newOptions;
                    },
                    [],
                );
        },
        [getUnitLabel],
    );

    const formatRelativeTimeDisplay = useCallback(
        (rule: BaseFilterRule): string | null => {
            if (!RELATIVE_TIME_OPERATORS.has(rule.operator)) {
                return null;
            }

            if (!isFilterRule(rule)) {
                return null;
            }

            const unitOfTime = rule.settings?.unitOfTime;
            if (!unitOfTime) {
                return null;
            }

            const amount = String(rule.values?.[0] ?? '');

            switch (rule.operator) {
                case FilterOperator.IN_THE_CURRENT:
                    return t(
                        'components_common_filters_inputs.relative_time_display.in_the_current',
                        {
                            unit: getUnitLabel(unitOfTime, false, false),
                        },
                    );
                case FilterOperator.NOT_IN_THE_CURRENT:
                    return t(
                        'components_common_filters_inputs.relative_time_display.not_in_the_current',
                        {
                            unit: getUnitLabel(unitOfTime, false, false),
                        },
                    );
                case FilterOperator.IN_THE_PAST: {
                    const isCompleted = rule.settings?.completed ?? false;
                    if (isCompleted) {
                        return t(
                            'components_common_filters_inputs.relative_time_display.in_the_past_completed',
                            {
                                amount,
                                unit: getUnitLabel(unitOfTime, false, false),
                            },
                        );
                    }
                    return t(
                        'components_common_filters_inputs.relative_time_display.in_the_past',
                        {
                            amount,
                            unit: getUnitLabel(unitOfTime, true, false),
                        },
                    );
                }
                case FilterOperator.NOT_IN_THE_PAST: {
                    const isCompleted = rule.settings?.completed ?? false;
                    if (isCompleted) {
                        return t(
                            'components_common_filters_inputs.relative_time_display.not_in_the_past_completed',
                            {
                                amount,
                                unit: getUnitLabel(unitOfTime, false, false),
                            },
                        );
                    }
                    return t(
                        'components_common_filters_inputs.relative_time_display.not_in_the_past',
                        {
                            amount,
                            unit: getUnitLabel(unitOfTime, true, false),
                        },
                    );
                }
                case FilterOperator.IN_THE_NEXT: {
                    const isCompleted = rule.settings?.completed ?? false;
                    if (isCompleted) {
                        return t(
                            'components_common_filters_inputs.relative_time_display.in_the_next_completed',
                            {
                                amount,
                                unit: getUnitLabel(unitOfTime, false, false),
                            },
                        );
                    }
                    return t(
                        'components_common_filters_inputs.relative_time_display.in_the_next',
                        {
                            amount,
                            unit: getUnitLabel(unitOfTime, true, false),
                        },
                    );
                }
                default:
                    return null;
            }
        },
        [getUnitLabel, t],
    );

    return {
        getUnitLabel,
        getUnitOfTimeOptions,
        formatRelativeTimeDisplay,
    };
};

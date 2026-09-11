import {
    TimeFrames,
    formatDate,
    isSingleDateDynamic,
    parseDate,
    resolveSingleDateValue,
    type BaseFilterRule,
    type DateRangeMode,
    type FilterRule,
    type SingleDateSetting,
} from '@lightdash/common';
import { Radio, Stack, Text, type PopoverProps } from '@mantine/core';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import {
    getSingleDateRuleWithFixedValues,
    resolveDisplayValues,
} from './utils';

type MonthEqualsRule = BaseFilterRule & {
    values?: (string | null)[];
    settings?: FilterRule['settings'] & {
        singleDate?: SingleDateSetting;
    };
};

type Props = {
    rule: MonthEqualsRule;
    onChange: (next: MonthEqualsRule) => void;
    filterMinDate?: Date;
    filterMaxDate?: Date;
    disabled?: boolean;
    placeholder?: string;
    popoverProps?: Omit<PopoverProps, 'children'>;
    /** true = 编辑模式（配置默认值），false / undefined = 查看模式 */
    isEditMode?: boolean;
};

const isMode = (value: string): value is DateRangeMode =>
    value === 'fixed' || value === 'dynamic';

const LAST_AVAILABLE_MONTH_SETTING: SingleDateSetting = {
    mode: 'dynamic',
    preset: 'lastAvailableMonth',
};

const FilterDynamicMonthPicker: FC<Props> = ({
    rule,
    onChange,
    filterMinDate,
    filterMaxDate,
    disabled,
    placeholder,
    popoverProps,
    isEditMode,
}) => {
    const { t, i18n } = useTranslation();
    const mode: DateRangeMode = isSingleDateDynamic(rule) ? 'dynamic' : 'fixed';

    const previewFormat = i18n.language.toLowerCase().startsWith('zh')
        ? 'YYYY年M月'
        : 'MMMM YYYY';

    const viewModeResolved = useMemo(() => {
        if (isEditMode || !isSingleDateDynamic(rule)) return null;
        return resolveDisplayValues(rule)?.[0] as string | undefined;
    }, [isEditMode, rule]);

    const displayValueStr =
        (viewModeResolved ??
            (isSingleDateDynamic(rule)
                ? resolveSingleDateValue(rule)
                : rule.values?.[0])) ||
        null;

    const monthValue = displayValueStr
        ? parseDate(
              formatDate(displayValueStr, TimeFrames.MONTH),
              TimeFrames.MONTH,
          )
        : null;

    const writeFixed = (value: Date | null) => {
        const nextValues = value ? [formatDate(value, TimeFrames.MONTH)] : [];
        const ruleWithValues: MonthEqualsRule = {
            ...rule,
            values: nextValues,
        };
        onChange(
            isEditMode
                ? (() => {
                      if (!rule.settings?.singleDate) return ruleWithValues;
                      const { singleDate: _drop, ...settings } = rule.settings;
                      return { ...ruleWithValues, settings };
                  })()
                : getSingleDateRuleWithFixedValues(ruleWithValues),
        );
    };

    const handleModeChange = (nextMode: DateRangeMode) => {
        if (nextMode === 'dynamic') {
            const resolved = resolveSingleDateValue({
                ...rule,
                settings: {
                    ...rule.settings,
                    singleDate: LAST_AVAILABLE_MONTH_SETTING,
                },
            });
            onChange({
                ...rule,
                values: resolved != null ? [resolved] : rule.values,
                settings: {
                    ...rule.settings,
                    singleDate: LAST_AVAILABLE_MONTH_SETTING,
                },
            });
            return;
        }
        // Switching to fixed: drop singleDate, keep current values
        if (!rule.settings) {
            onChange(rule);
            return;
        }
        const { singleDate: _drop, ...settings } = rule.settings;
        onChange({ ...rule, settings });
    };

    const renderFixedPicker = () => (
        <FilterMonthAndYearPicker
            disabled={disabled}
            minDate={filterMinDate}
            maxDate={filterMaxDate}
            // @ts-ignore - Mantine MonthPickerInput doesn't expose `placeholder`
            placeholder={placeholder}
            autoFocus={true}
            popoverProps={popoverProps}
            value={monthValue}
            onChange={writeFixed}
        />
    );

    // View mode: no Fixed/Dynamic radios; show resolved month, allow override
    if (!isEditMode) {
        return (
            <Stack spacing="xs" w="100%">
                {renderFixedPicker()}
            </Stack>
        );
    }

    const dynamicPreview =
        mode === 'dynamic' && displayValueStr
            ? dayjs(
                  parseDate(
                      formatDate(displayValueStr, TimeFrames.MONTH),
                      TimeFrames.MONTH,
                  ),
              ).format(previewFormat)
            : null;

    return (
        <Stack spacing="xs" w="100%">
            <Radio.Group
                value={mode}
                onChange={(value) => {
                    if (isMode(value)) handleModeChange(value);
                }}
            >
                <Stack spacing={4}>
                    <Radio
                        value="dynamic"
                        size="xs"
                        disabled={disabled}
                        label={t(
                            'components_common_filters_inputs.date_range.dynamic.custom_label',
                        )}
                    />
                    {mode === 'dynamic' && (
                        <Stack spacing={4} pl="lg">
                            <Text size="xs">
                                {t(
                                    'components_common_filters_inputs.single_date.preset.last_available_month',
                                )}
                            </Text>
                            {dynamicPreview && (
                                <Text size="xs" color="dimmed">
                                    {dynamicPreview}
                                </Text>
                            )}
                        </Stack>
                    )}
                    <Radio
                        value="fixed"
                        size="xs"
                        disabled={disabled}
                        label={t(
                            'components_common_filters_inputs.date_range.dynamic.fixed_label',
                        )}
                    />
                    {mode === 'fixed' && (
                        <Stack spacing={4} pl="lg">
                            {renderFixedPicker()}
                        </Stack>
                    )}
                </Stack>
            </Radio.Group>
        </Stack>
    );
};

export default FilterDynamicMonthPicker;

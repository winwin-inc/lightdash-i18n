import {
    TimeFrames,
    formatDate,
    isSingleDateDynamic,
    parseDate,
    resolveSingleDateValue,
    type BaseFilterRule,
    type FilterRule,
    type SingleDateSetting,
} from '@lightdash/common';
import { Stack, Text, type PopoverProps } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import {
    getSingleDateRuleWithFixedValues,
    resolveDisplayValues,
} from './utils';

type MonthEqualsRule = BaseFilterRule & {
    values?: (string | null)[];
    /** 规则级数据可用日（上月预设 cutoff，缺省 4 号） */
    dataAvailableFromDay?: number;
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

/**
 * 单值月份「是」筛选器的取值输入。
 *
 * 模式（动态日期 / 固定日期）的 Radio 在看板筛选器配置卡片层
 * （FilterSettings，与「在之间」同一行）；本组件只渲染当前模式的
 * 输入体：
 * - 动态：一行「上月」文案——预设语义与当前解析的说明统一放在
 *   约束编辑器「数据可用日」行的 ⓘ tooltip 里，此处不再重复；
 * - 固定：月份选择器。
 */
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
    const { t } = useTranslation();
    const isDynamic = isSingleDateDynamic(rule);

    const viewModeResolved = useMemo(() => {
        if (isEditMode || !isDynamic) return null;
        return resolveDisplayValues(rule)?.[0] as string | undefined;
    }, [isEditMode, isDynamic, rule]);

    const displayValueStr =
        (viewModeResolved ??
            (isDynamic ? resolveSingleDateValue(rule) : rule.values?.[0])) ||
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

    // View mode: no mode Radio; show resolved month, allow override
    if (!isEditMode) {
        return (
            <Stack spacing="xs" w="100%">
                {renderFixedPicker()}
            </Stack>
        );
    }

    // Edit mode + dynamic: preset label only; the semantics and the
    // currently resolved month live on the constraint editor's
    // data-available-day row tooltip.
    if (isDynamic) {
        return (
            <Stack spacing="xs" w="100%">
                <Text size="xs" c="dimmed">
                    {t(
                        'components_common_filters_inputs.single_date.preset.last_available_month_short',
                    )}
                </Text>
            </Stack>
        );
    }

    // Edit mode + fixed
    return (
        <Stack spacing="xs" w="100%">
            {renderFixedPicker()}
        </Stack>
    );
};

export default FilterDynamicMonthPicker;

import {
    DATA_MONTH_AVAILABLE_FROM_DAY,
    TimeFrames,
    formatDate,
    isSingleDateDynamic,
    parseDate,
    resolveSingleDateValue,
    type BaseFilterRule,
    type FilterRule,
    type SingleDateSetting,
} from '@lightdash/common';
import {
    Box,
    Stack,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../MantineIcon';
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

/**
 * 单值月份「是」筛选器的取值输入。
 *
 * 模式（动态日期 / 固定日期）的 Radio 在看板筛选器配置卡片层
 * （FilterSettings，与「在之间」同一行）；本组件只渲染当前模式的
 * 输入体：
 * - 动态：紧凑一行「上月 + ⓘ」——预设说明与当前解析结果收进 tooltip，
 *   不在正文铺开（对齐约束编辑器长文案进 tooltip 的拍板）；
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
    const { t, i18n } = useTranslation();
    const isDynamic = isSingleDateDynamic(rule);

    const previewFormat = i18n.language.toLowerCase().startsWith('zh')
        ? 'YYYY年M月'
        : 'MMMM YYYY';

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

    // Edit mode + dynamic: compact preset row; explanation and the resolved
    // month live in the ⓘ tooltip instead of inline hint lines.
    if (isDynamic) {
        const dynamicPreview = displayValueStr
            ? dayjs(monthValue).format(previewFormat)
            : null;
        return (
            <Stack spacing="xs" w="100%">
                <Text size="xs" c="dimmed">
                    {t(
                        'components_common_filters_inputs.single_date.preset.last_available_month_short',
                    )}
                    <Tooltip
                        withinPortal
                        variant="xs"
                        multiline
                        maw={280}
                        position="top"
                        label={t(
                            'components_common_filters_inputs.single_date.preset.last_available_month_tooltip',
                            {
                                day: DATA_MONTH_AVAILABLE_FROM_DAY,
                                value: dynamicPreview ?? '—',
                            },
                        )}
                    >
                        <Box
                            component="span"
                            display="inline-flex"
                            ml={4}
                            tabIndex={0}
                            sx={{
                                cursor: 'help',
                                outline: 'none',
                                verticalAlign: 'middle',
                            }}
                        >
                            <MantineIcon icon={IconHelpCircle} size="sm" />
                        </Box>
                    </Tooltip>
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

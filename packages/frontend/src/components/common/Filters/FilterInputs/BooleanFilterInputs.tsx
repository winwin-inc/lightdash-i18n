import {
    FilterOperator,
    isFilterRule,
    type BaseFilterRule,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { type FilterInputsProps } from '.';
import { useIsMobileDevice } from '../../../../hooks/useIsMobileDevice';
import { usePlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import DefaultFilterInputs from './DefaultFilterInputs';

const BooleanFilterInputs = <T extends BaseFilterRule>(
    props: FilterInputsProps<T>,
) => {
    const { t } = useTranslation();
    const { rule, onChange, disabled, filterType, popoverProps } = props;

    const isFilterRuleDisabled = isFilterRule(rule) && rule.disabled;

    const getPlaceholderByFilterTypeAndOperator =
        usePlaceholderByFilterTypeAndOperator();
    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: isFilterRuleDisabled,
    });

    // 检测是否为移动设备
    const isMobileDevice = useIsMobileDevice();

    switch (rule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
            const currentValue = rule.values?.[0]?.toString() ?? null;

            return (
                <Select
                    w={isMobileDevice ? '80vw' : '100%'}
                    size="xs"
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    disabled={disabled}
                    autoFocus={true}
                    initiallyOpened={currentValue === null && !disabled}
                    placeholder={placeholder}
                    data={[
                        {
                            value: 'true',
                            label: t(
                                'components_common_filters_inputs.select.true',
                            ),
                        },
                        {
                            value: 'false',
                            label: t(
                                'components_common_filters_inputs.select.false',
                            ),
                        },
                    ]}
                    value={currentValue}
                    styles={{
                        root: {
                            // 移动端：限制根元素宽度
                            ...(isMobileDevice && {
                                maxWidth: '80vw',
                                width: '80vw',
                            }),
                        },
                        input: {
                            // 移动端：更严格限制输入框宽度，避免超出屏幕
                            ...(isMobileDevice && {
                                maxWidth: '80vw',
                            }),
                        },
                        wrapper: {
                            // 移动端：限制包装器宽度
                            ...(isMobileDevice && {
                                maxWidth: '80vw',
                            }),
                        },
                        dropdown: {
                            // 移动端：使用更严格的宽度限制，确保不会超出屏幕右边界
                            ...(isMobileDevice && {
                                maxWidth: '80vw',
                                width: '80vw',
                            }),
                        },
                    }}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            values: value === null ? [] : [value === 'true'],
                        })
                    }
                />
            );

        default:
            return <DefaultFilterInputs {...props} />;
    }
};

export default BooleanFilterInputs;

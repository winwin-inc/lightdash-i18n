import { getUnitsOfTimeGreaterOrEqual, UnitOfTime } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsMobileDevice } from '../../../../hooks/useIsMobileDevice';

const getUnitOfTimeLabel = (
    unitOfTime: UnitOfTime,
    isPlural: boolean,
    isCompleted: boolean,
) => {
    return `${isCompleted ? 'completed ' : ''}${
        isPlural ? unitOfTime : unitOfTime.substring(0, unitOfTime.length - 1)
    }`;
};

const getUnitOfTimeOptions = ({
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
    const dateIndex = Object.keys(UnitOfTime).indexOf(UnitOfTime.days);

    const unitsOfTime = minUnitOfTime
        ? getUnitsOfTimeGreaterOrEqual(minUnitOfTime)
        : isTimestamp
        ? Object.values(UnitOfTime)
        : Object.values(UnitOfTime).slice(dateIndex);

    return unitsOfTime
        .reverse()
        .reduce<{ label: string; value: string }[]>((sum, unitOfTime) => {
            const newOptions = [
                ...sum,
                {
                    label: getUnitOfTimeLabel(
                        unitOfTime,
                        showOptionsInPlural,
                        false,
                    ),
                    value: unitOfTime.toString(),
                },
            ];

            if (showCompletedOptions) {
                newOptions.push({
                    label: getUnitOfTimeLabel(
                        unitOfTime,
                        showOptionsInPlural,
                        true,
                    ),
                    value: `${unitOfTime}-completed`,
                });
            }
            return newOptions;
        }, []);
};

interface Props extends Omit<SelectProps, 'data' | 'onChange'> {
    isTimestamp: boolean;
    unitOfTime?: UnitOfTime;
    minUnitOfTime?: UnitOfTime;
    showOptionsInPlural?: boolean;
    showCompletedOptions?: boolean;
    completed: boolean;
    onChange: (value: { unitOfTime: UnitOfTime; completed: boolean }) => void;
}

const FilterUnitOfTimeAutoComplete: FC<Props> = ({
    isTimestamp,
    unitOfTime,
    minUnitOfTime,
    showOptionsInPlural = true,
    showCompletedOptions = true,
    completed,
    onChange,
    ...rest
}) => {
    const { t } = useTranslation();

    const { options, selectValue } = useMemo(() => {
        const standardOptions = getUnitOfTimeOptions({
            isTimestamp,
            minUnitOfTime,
            showCompletedOptions,
            showOptionsInPlural,
        });

        // for a fresh filter (no unitOfTime), just return standard options
        if (!unitOfTime) {
            return {
                options: standardOptions,
                selectValue: '',
            };
        }

        // compute current value for existing filter
        const currentValue = `${unitOfTime}${completed ? '-completed' : ''}`;

        // check if current value exists in standard options
        const currentValueExists = standardOptions.some(
            (option) => option.value === currentValue,
        );

        // add current value to options if it doesn't exist
        const finalOptions = !currentValueExists
            ? [
                  ...standardOptions,
                  {
                      label: getUnitOfTimeLabel(
                          unitOfTime,
                          showOptionsInPlural,
                          completed,
                      ),
                      value: currentValue,
                  },
              ]
            : standardOptions;

        return {
            options: finalOptions,
            selectValue: currentValue,
        };
    }, [
        isTimestamp,
        minUnitOfTime,
        showCompletedOptions,
        showOptionsInPlural,
        unitOfTime,
        completed,
    ]);

    // 检测是否为移动设备
    const isMobileDevice = useIsMobileDevice();

    return (
        <Select
            searchable
            placeholder={t('components_common_filters_inputs.select_value')}
            size="xs"
            {...rest}
            value={selectValue}
            data={options}
            styles={{
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
            onChange={(value) => {
                if (value === null) return;

                const [unitOfTimeValue, isCompleted] = value.split('-');
                onChange({
                    unitOfTime: unitOfTimeValue as UnitOfTime,
                    completed: isCompleted === 'completed',
                });
            }}
        />
    );
};

export default FilterUnitOfTimeAutoComplete;

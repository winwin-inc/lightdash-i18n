import { type UnitOfTime } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsMobileDevice } from '../../../../hooks/useIsMobileDevice';
import { useUnitOfTimeLabels } from './useUnitOfTimeLabels';

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
    const { getUnitLabel, getUnitOfTimeOptions } = useUnitOfTimeLabels();

    const { options, selectValue } = useMemo(() => {
        const standardOptions = getUnitOfTimeOptions({
            isTimestamp,
            minUnitOfTime,
            showCompletedOptions,
            showOptionsInPlural,
        });

        if (!unitOfTime) {
            return {
                options: standardOptions,
                selectValue: '',
            };
        }

        const currentValue = `${unitOfTime}${completed ? '-completed' : ''}`;

        const currentValueExists = standardOptions.some(
            (option) => option.value === currentValue,
        );

        const finalOptions = !currentValueExists
            ? [
                  ...standardOptions,
                  {
                      label: getUnitLabel(
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
        completed,
        getUnitLabel,
        getUnitOfTimeOptions,
        isTimestamp,
        minUnitOfTime,
        showCompletedOptions,
        showOptionsInPlural,
        unitOfTime,
    ]);

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
                    ...(isMobileDevice && {
                        maxWidth: '80vw',
                    }),
                },
                wrapper: {
                    ...(isMobileDevice && {
                        maxWidth: '80vw',
                    }),
                },
                dropdown: {
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

import { Flex, Text } from '@mantine/core';
import { type DateInputProps, type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { mergeMaxDate, mergeMinDate } from '../utils/filterDateUtils';
import FilterDatePicker from './FilterDatePicker';

interface Props
    extends Omit<
        DateInputProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: [Date, Date] | null;
    onChange: (value: [Date, Date] | null) => void;
    firstDayOfWeek: DayOfWeek;
    filterMinDate?: Date;
    filterMaxDate?: Date;
}

const FilterDateRangePicker: FC<Props> = ({
    value,
    disabled,
    firstDayOfWeek,
    onChange,
    filterMinDate,
    filterMaxDate,
    ...rest
}) => {
    const { t } = useTranslation();

    const [date1, setDate1] = useState(value?.[0] ?? null);
    const [date2, setDate2] = useState(value?.[1] ?? null);

    return (
        <Flex align="center" w="100%" gap="xxs">
            <FilterDatePicker
                size="xs"
                disabled={disabled}
                placeholder={t(
                    'components_common_filters_inputs.date_picker.start_date',
                )}
                minDate={filterMinDate}
                maxDate={mergeMaxDate(
                    date2
                        ? dayjs(date2).subtract(1, 'day').toDate()
                        : undefined,
                    filterMaxDate,
                )}
                firstDayOfWeek={firstDayOfWeek}
                {...rest}
                value={date1}
                onChange={(newDate) => {
                    setDate1(newDate);

                    if (newDate && date2) {
                        onChange([newDate, date2]);
                    }
                }}
            />

            <Text color="dimmed" sx={{ whiteSpace: 'nowrap' }} size="xs">
                –
            </Text>

            <FilterDatePicker
                size="xs"
                disabled={disabled}
                placeholder={t(
                    'components_common_filters_inputs.date_picker.end_date',
                )}
                minDate={mergeMinDate(
                    date1 ? dayjs(date1).add(1, 'day').toDate() : undefined,
                    filterMinDate,
                )}
                maxDate={filterMaxDate}
                firstDayOfWeek={firstDayOfWeek}
                {...rest}
                value={date2}
                onChange={(newDate) => {
                    setDate2(newDate);

                    if (newDate && date1) {
                        onChange([date1, newDate]);
                    }
                }}
            />
        </Flex>
    );
};

export default FilterDateRangePicker;

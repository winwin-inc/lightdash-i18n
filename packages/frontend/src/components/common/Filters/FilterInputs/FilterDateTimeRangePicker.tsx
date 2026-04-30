import { Group, Text } from '@mantine/core';
import { type DateTimePickerProps, type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { mergeMaxDate, mergeMinDate } from '../utils/filterDateUtils';
import FilterDateTimePicker from './FilterDateTimePicker';

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: [Date, Date] | null;
    onChange: (value: [Date, Date] | null) => void;
    firstDayOfWeek: DayOfWeek;
    filterMinDate?: Date;
    filterMaxDate?: Date;
}

const FilterDateTimeRangePicker: FC<Props> = ({
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
        <Group noWrap align="start" w="100%" spacing="xs">
            <FilterDateTimePicker
                size="xs"
                withSeconds
                disabled={disabled}
                // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                // @ts-ignore
                placeholder={t(
                    'components_common_filters_inputs.date_picker.start_date',
                )}
                showTimezone={false}
                minDate={filterMinDate}
                maxDate={mergeMaxDate(
                    date2
                        ? dayjs(date2).subtract(1, 'second').toDate()
                        : undefined,
                    filterMaxDate,
                )}
                firstDayOfWeek={firstDayOfWeek}
                {...rest}
                value={date1}
                onChange={(newDate) => {
                    if (!date2 || dayjs(newDate).isBefore(dayjs(date2))) {
                        setDate1(newDate);

                        if (newDate && date2) {
                            onChange([newDate, date2]);
                        }
                    }
                }}
            />

            <Text color="dimmed" mt={7} sx={{ whiteSpace: 'nowrap' }} size="xs">
                –
            </Text>

            <FilterDateTimePicker
                size="xs"
                withSeconds
                disabled={disabled}
                // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                // @ts-ignore
                placeholder={t(
                    'components_common_filters_inputs.date_picker.end_date',
                )}
                minDate={mergeMinDate(
                    date1 ? dayjs(date1).add(1, 'second').toDate() : undefined,
                    filterMinDate,
                )}
                maxDate={filterMaxDate}
                firstDayOfWeek={firstDayOfWeek}
                {...rest}
                value={date2}
                onChange={(newDate) => {
                    if (!date1 || dayjs(newDate).isAfter(dayjs(date1))) {
                        setDate2(newDate);
                        if (newDate && date1) {
                            onChange([date1, newDate]);
                        }
                    }
                }}
            />
        </Group>
    );
};

export default FilterDateTimeRangePicker;

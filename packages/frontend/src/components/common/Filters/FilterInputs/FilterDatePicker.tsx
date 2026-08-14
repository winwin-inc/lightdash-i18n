import { DateInput, type DateInputProps, type DayOfWeek } from '@mantine/dates';
import { type FC } from 'react';

interface Props
    extends Omit<
        DateInputProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: Date | null;
    onChange: (value: Date | null) => void;
    firstDayOfWeek: DayOfWeek;
}

const FilterDatePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    ...rest
}) => {
    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{
                shadow: 'sm',
                withinPortal: true,
                ...rest.popoverProps,
            }}
            firstDayOfWeek={firstDayOfWeek}
            value={value}
            onChange={(date) => {
                onChange(date ?? null);
            }}
        />
    );
};

export default FilterDatePicker;

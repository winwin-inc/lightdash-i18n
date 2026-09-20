import { MonthPickerInput, type MonthPickerInputProps } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { mergeMaxDate, mergeMinDate } from '../utils/filterDateUtils';

type Props = Omit<MonthPickerInputProps, 'value' | 'onChange'> & {
    value: Date | null;
    onChange: (value: Date | null) => void;
};

const FilterMonthAndYearPicker: FC<Props> = ({
    value,
    onChange,
    minDate,
    maxDate,
    ...props
}) => {
    const [isPopoverOpen, { open, close, toggle }] = useDisclosure();
    const { i18n } = useTranslation();
    const valueFormat = i18n.language.toLowerCase().startsWith('zh')
        ? 'YYYY年M月'
        : 'MMMM YYYY';

    const yearValue = value ? dayjs(value).toDate() : null;
    const parentOnOpen = props.popoverProps?.onOpen;
    const parentOnClose = props.popoverProps?.onClose;

    // Controlled `opened` does not always fire Popover onOpen/onClose.
    // Tell the dashboard filter so it can disable trapFocus / click-outside.
    useEffect(() => {
        if (!isPopoverOpen) {
            return undefined;
        }
        parentOnOpen?.();
        return () => {
            parentOnClose?.();
        };
    }, [isPopoverOpen, parentOnOpen, parentOnClose]);

    return (
        <MonthPickerInput
            w="100%"
            size="xs"
            onClick={toggle}
            {...props}
            valueFormat={valueFormat}
            minDate={mergeMinDate(dayjs().year(1000).toDate(), minDate)}
            maxDate={mergeMaxDate(
                dayjs().year(9999).endOf('year').toDate(),
                maxDate,
            )}
            popoverProps={{
                shadow: 'md',
                withinPortal: true,
                zIndex: 1100,
                // Month and year picker does not manage its own state properly.
                // additional props are needed to make it work
                ...props.popoverProps,
                opened: isPopoverOpen,
                onOpen: open,
                onClose: close,
            }}
            value={yearValue}
            onChange={(date) => {
                if (Array.isArray(date)) return;
                onChange((date as Date | null) ?? null);
                if (date) close();
            }}
        />
    );
};

export default FilterMonthAndYearPicker;

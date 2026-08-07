import { TimeFrames, formatDate } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    type MantineTheme,
    Popover,
    Stack,
    type Sx,
    Text,
} from '@mantine/core';
import { MonthPicker, type MonthPickerProps } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { type FC, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

dayjs.extend(quarterOfYear);

type Props = Omit<MonthPickerProps, 'value' | 'onChange'> & {
    value: Date | null;
    onChange: (value: Date | null) => void;
    placeholder?: string;
    disabled?: boolean;
    popoverProps?: any;
    autoFocus?: boolean;
    minDate?: Date;
    maxDate?: Date;
};

const QUARTERS = [
    { value: '1', months: [0, 1, 2], label: 'Q1', range: 'Jan - Mar' },
    { value: '2', months: [3, 4, 5], label: 'Q2', range: 'Apr - Jun' },
    { value: '3', months: [6, 7, 8], label: 'Q3', range: 'Jul - Sep' },
    { value: '4', months: [9, 10, 11], label: 'Q4', range: 'Oct - Dec' },
];

const FilterQuarterPicker: FC<Props> = ({
    value,
    onChange,
    placeholder,
    disabled,
    popoverProps,
    minDate,
    maxDate,
}) => {
    const [opened, { open, close }] = useDisclosure(false);
    const { t } = useTranslation();

    placeholder =
        placeholder ||
        t(
            'components_common_filters_inputs.filter_quarter_picker.select_quarter',
        );

    // Parse date value - it may be an ISO string like "2025-01-01T00:00:00.000Z"
    const parsedDate = value ? dayjs(value) : null;
    const yearValue = parsedDate ? parsedDate.year() : new Date().getFullYear();

    // Determine the quarter based on the month of the date
    const monthValue = parsedDate ? parsedDate.month() : 0;
    const getQuarterFromMonth = useCallback((month: number): string => {
        const quarter = QUARTERS.find((q) => q.months.includes(month));
        return quarter ? quarter.value : '1';
    }, []);

    const [selectedYear, setSelectedYear] = useState<number>(yearValue);
    const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

    // Get quarter's first and last month based on a month
    const getQuarterMonths = (month: number): number[] => {
        const quarter = QUARTERS.find((q) => q.months.includes(month));
        return quarter ? quarter.months : [0, 1, 2];
    };

    const handleMonthSelect = (date: Date | null) => {
        if (!date) return;

        const monthStart = dayjs(date).startOf('month');
        if (minDate && monthStart.isBefore(dayjs(minDate).startOf('month'))) {
            return;
        }
        if (maxDate && monthStart.isAfter(dayjs(maxDate).startOf('month'))) {
            return;
        }

        // Use dayjs for date handling
        const dateObj = dayjs(date);
        const year = dateObj.year();
        setSelectedYear(year);

        const quarterDate = dateObj.startOf('quarter');

        onChange?.(quarterDate.toDate());
        close();
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onChange?.(null);
    };

    const getMonthControlProps = useCallback(
        (
            date: Date,
        ): {
            disabled?: boolean;
            sx?: Sx;
            onMouseEnter: () => void;
            onMouseLeave?: () => void;
        } => {
            const monthStart = dayjs(date).startOf('month');
            if (
                minDate &&
                monthStart.isBefore(dayjs(minDate).startOf('month'))
            ) {
                return {
                    disabled: true,
                    onMouseEnter: () => undefined,
                };
            }
            if (
                maxDate &&
                monthStart.isAfter(dayjs(maxDate).startOf('month'))
            ) {
                return {
                    disabled: true,
                    onMouseEnter: () => undefined,
                };
            }

            const month = date.getMonth();
            const year = date.getFullYear();

            // If this is the selected quarter's months, highlight them
            if (
                parsedDate &&
                year === yearValue &&
                getQuarterMonths(monthValue).includes(month)
            ) {
                return {
                    sx: (theme: MantineTheme) => ({
                        backgroundColor: theme.colors.blue[2],
                        '&:hover': {
                            backgroundColor: theme.colors.blue[2],
                        },
                    }),
                    onMouseEnter: () => setHoveredMonth(month),
                };
            }

            // If this is the hovered month's quarter, highlight all months in quarter
            if (
                hoveredMonth !== null &&
                getQuarterMonths(hoveredMonth).includes(month)
            ) {
                return {
                    sx: (theme: MantineTheme) => ({
                        backgroundColor: theme.colors.blue[1],
                        '&:hover': {
                            backgroundColor: theme.colors.blue[1],
                        },
                    }),
                    onMouseEnter: () => setHoveredMonth(month),
                };
            }

            return {
                onMouseEnter: () => setHoveredMonth(month),
                onMouseLeave: () => setHoveredMonth(null),
            };
        },
        [hoveredMonth, maxDate, minDate, monthValue, parsedDate, yearValue],
    );

    return (
        <Popover
            opened={opened}
            onClose={close}
            position="bottom"
            shadow="md"
            withinPortal
            {...popoverProps}
        >
            <Popover.Target>
                {/*
                 * TODO: replace this manual Box+Box+ActionIcon with Mantine's
                 * <TextInput rightSection={...}/> once we figure out how to
                 * stop Mantine from re-opening the popover when the clear
                 * button is clicked. For now this mimics the look-and-feel
                 * of size="xs" so the clear button can be a true sibling
                 * of the click target.
                 */}
                <Box
                    onClick={disabled ? undefined : open}
                    style={{
                        position: 'relative',
                        cursor: disabled ? 'default' : 'pointer',
                    }}
                >
                    <Box
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            height: 30, // mantine size="xs" input height
                            padding: '0 32px 0 8px',
                            fontSize: 12, // mantine xs font size
                            backgroundColor: 'var(--mantine-color-default)',
                            border: '1px solid var(--mantine-color-default-border)',
                            borderRadius: 'var(--mantine-radius-default)',
                            color: value
                                ? 'var(--mantine-color-text)'
                                : 'var(--mantine-color-placeholder)',
                        }}
                    >
                        {value
                            ? formatDate(value, TimeFrames.QUARTER)
                            : placeholder}
                    </Box>
                    {value && !disabled && (
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={handleClear}
                            aria-label={t(
                                'components_common_filters_inputs.filter_quarter_picker.clear',
                            )}
                            style={{
                                position: 'absolute',
                                right: 4,
                                top: '50%',
                                transform: 'translateY(-50%)',
                            }}
                        >
                            <IconX size={14} />
                        </ActionIcon>
                    )}
                </Box>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack spacing="xs">
                    <MonthPicker
                        defaultDate={new Date(selectedYear, 0)}
                        value={null}
                        onChange={handleMonthSelect}
                        getMonthControlProps={getMonthControlProps}
                        onMouseLeave={() => setHoveredMonth(null)}
                    />
                    {hoveredMonth !== null && (
                        <Text size="xs" align="center">
                            {selectedYear}-Q{getQuarterFromMonth(hoveredMonth)}
                        </Text>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterQuarterPicker;

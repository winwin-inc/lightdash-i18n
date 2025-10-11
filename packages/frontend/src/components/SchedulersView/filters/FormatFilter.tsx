import { SchedulerFormat } from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import classes from './FormatFilter.module.css';

type FormatFilterProps = Pick<
    ReturnType<typeof useSchedulerFilters>,
    'selectedFormats' | 'setSelectedFormats'
>;

const FormatFilter: FC<FormatFilterProps> = ({
    selectedFormats,
    setSelectedFormats,
}) => {
    const { t } = useTranslation();

    const allFormats = Object.values(SchedulerFormat);
    const hasSelectedFormats = selectedFormats.length > 0;

    const FORMAT_LABELS: Record<SchedulerFormat, string> = {
        [SchedulerFormat.CSV]: t(
            'components_schedulers_view_filters_format_filter.csv',
        ),
        [SchedulerFormat.XLSX]: t(
            'components_schedulers_view_filters_format_filter.xlsx',
        ),
        [SchedulerFormat.IMAGE]: t(
            'components_schedulers_view_filters_format_filter.image',
        ),
        [SchedulerFormat.GSHEETS]: t(
            'components_schedulers_view_filters_format_filter.gsheets',
        ),
    };

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={t(
                        'components_schedulers_view_filters_format_filter.filter_by_format',
                    )}
                >
                    <Button
                        h={32}
                        c="gray.7"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelectedFormats
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedFormats ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                    styles={{
                                        root: {
                                            minWidth: 18,
                                            height: 18,
                                            padding: '0 4px',
                                        },
                                    }}
                                >
                                    {selectedFormats.length}
                                </Badge>
                            ) : null
                        }
                    >
                        {t(
                            'components_schedulers_view_filters_format_filter.format',
                        )}
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="dark.3" fw={600}>
                        {t(
                            'components_schedulers_view_filters_format_filter.filter_by',
                        )}
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {allFormats.map((format) => (
                                <Checkbox
                                    key={format}
                                    label={FORMAT_LABELS[format]}
                                    checked={selectedFormats.includes(format)}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (selectedFormats.includes(format)) {
                                            setSelectedFormats(
                                                selectedFormats.filter(
                                                    (f) => f !== format,
                                                ),
                                            );
                                        } else {
                                            setSelectedFormats([
                                                ...selectedFormats,
                                                format,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default FormatFilter;

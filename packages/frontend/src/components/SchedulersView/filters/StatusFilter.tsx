import { SchedulerJobStatus } from '@lightdash/common';
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

import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import classes from './FormatFilter.module.css';

type StatusFilterProps = Pick<
    ReturnType<typeof useLogsFilters>,
    'selectedStatuses' | 'setSelectedStatuses'
>;

const StatusFilter: FC<StatusFilterProps> = ({
    selectedStatuses,
    setSelectedStatuses,
}) => {
    const { t } = useTranslation();

    const allStatuses = Object.values(SchedulerJobStatus);
    const hasSelectedStatuses = selectedStatuses.length > 0;

    const STATUS_LABELS: Record<SchedulerJobStatus, string> = {
        [SchedulerJobStatus.SCHEDULED]: t(
            'components_schedulers_view_filters_status_filter.scheduled',
        ),
        [SchedulerJobStatus.STARTED]: t(
            'components_schedulers_view_filters_status_filter.started',
        ),
        [SchedulerJobStatus.COMPLETED]: t(
            'components_schedulers_view_filters_status_filter.completed',
        ),
        [SchedulerJobStatus.ERROR]: t(
            'components_schedulers_view_filters_status_filter.error',
        ),
    };

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={t(
                        'components_schedulers_view_filters_status_filter.filter_by_logs_status',
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
                            hasSelectedStatuses
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedStatuses ? (
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
                                    {selectedStatuses.length}
                                </Badge>
                            ) : null
                        }
                    >
                        {t(
                            'components_schedulers_view_filters_status_filter.status',
                        )}
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="dark.3" fw={600}>
                        {t(
                            'components_schedulers_view_filters_status_filter.filter_by',
                        )}
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {allStatuses.map((status) => (
                                <Checkbox
                                    key={status}
                                    label={STATUS_LABELS[status]}
                                    checked={selectedStatuses.includes(status)}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (selectedStatuses.includes(status)) {
                                            setSelectedStatuses(
                                                selectedStatuses.filter(
                                                    (s) => s !== status,
                                                ),
                                            );
                                        } else {
                                            setSelectedStatuses([
                                                ...selectedStatuses,
                                                status,
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

export default StatusFilter;

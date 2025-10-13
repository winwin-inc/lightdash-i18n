import { Box, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import MantineIcon from '../../common/MantineIcon';
import classes from './ResourceTypeFilter.module.css';

type ResourceTypeFilterProps = Pick<
    ReturnType<typeof useSchedulerFilters>,
    'selectedResourceType' | 'setSelectedResourceType'
>;

export const ResourceTypeFilter = ({
    selectedResourceType,
    setSelectedResourceType,
}: ResourceTypeFilterProps) => {
    const { t } = useTranslation();

    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };

    const data = [
        {
            value: 'all',
            label: (
                <Tooltip
                    label={t(
                        'components_schedulers_view_filters_resource_type_filter.show_all_schedulers',
                    )}
                    withinPortal
                >
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t(
                                'components_schedulers_view_filters_resource_type_filter.all',
                            )}
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'chart',
            label: (
                <Tooltip
                    variant="xs"
                    label={t(
                        'components_schedulers_view_filters_resource_type_filter.show_chart_schedulers',
                    )}
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon icon={IconChartBar} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'dashboard',
            label: (
                <Tooltip
                    variant="xs"
                    label={t(
                        'components_schedulers_view_filters_resource_type_filter.show_dashboard_schedulers',
                    )}
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            {...iconProps}
                        />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={selectedResourceType}
            onChange={(value) =>
                setSelectedResourceType(value as 'all' | 'chart' | 'dashboard')
            }
            classNames={{
                root: classes.segmentedControl,
                indicator: classes.indicator,
                label: classes.label,
            }}
            data={data}
        />
    );
};

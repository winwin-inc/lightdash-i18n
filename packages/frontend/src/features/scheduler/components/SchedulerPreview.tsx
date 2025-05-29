import {
    applyDimensionOverrides,
    type Dashboard,
    type DashboardScheduler,
    type SchedulerFilterRule,
} from '@lightdash/common';
import { Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useExportDashboard } from '../../../hooks/dashboard/useDashboard';
import { PreviewAndCustomizeScreenshot } from '../../preview';
import { CUSTOM_WIDTH_OPTIONS } from '../constants';

type Props = {
    dashboard: Dashboard;
    schedulerFilters: SchedulerFilterRule[] | undefined;
    customViewportWidth: DashboardScheduler['customViewportWidth'];
    onChange: (previewChoice: string | undefined) => void;
};

export const SchedulerPreview: FC<Props> = ({
    dashboard,
    schedulerFilters,
    customViewportWidth,
    onChange,
}) => {
    const { t } = useTranslation();

    const [previewChoice, setPreviewChoice] = useState<
        typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined
    >(customViewportWidth?.toString() ?? CUSTOM_WIDTH_OPTIONS[1].value);
    const exportDashboardMutation = useExportDashboard();

    const getSchedulerFilterOverridesQueryString = useCallback(() => {
        if (schedulerFilters) {
            const overriddenDimensions = applyDimensionOverrides(
                dashboard.filters,
                schedulerFilters,
            );

            const filtersParam = encodeURIComponent(
                JSON.stringify({
                    dimensions: overriddenDimensions,
                    metrics: [],
                    tableCalculations: [],
                }),
            );
            return `?filters=${filtersParam}`;
        }
        return '';
    }, [dashboard.filters, schedulerFilters]);

    const handlePreviewClick = useCallback(async () => {
        await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: getSchedulerFilterOverridesQueryString(),
            isPreview: true,
        });
    }, [
        dashboard,
        exportDashboardMutation,
        previewChoice,
        getSchedulerFilterOverridesQueryString,
    ]);

    return (
        <Stack p="md">
            <Group spacing="xs">
                <Text fw={600}>{t('features_scheduler_preview.title')}</Text>
                <Tooltip
                    multiline
                    withinPortal
                    maw={350}
                    label={t('features_scheduler_preview.tooltip.label')}
                >
                    <MantineIcon icon={IconInfoCircle} />
                </Tooltip>
            </Group>
            <PreviewAndCustomizeScreenshot
                exportMutation={exportDashboardMutation}
                previewChoice={previewChoice}
                setPreviewChoice={(pc: string | undefined) => {
                    setPreviewChoice(() => {
                        onChange(
                            pc === CUSTOM_WIDTH_OPTIONS[1].value
                                ? undefined
                                : pc,
                        );
                        return pc;
                    });
                }}
                onPreviewClick={handlePreviewClick}
            />
        </Stack>
    );
};

import { FeatureFlags, type ApiError } from '@lightdash/common';
import { Button, Group, Title, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../api';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import LoadingState from '../common/LoadingState';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { CreateCustomMetricsPullRequestModal } from './CreateCustomMetricsPullRequestModal';
import CustomMetricsTable, {
    type CustomMetricData,
} from './CustomMetricsTable';

const getCustomMetrics = async (projectUuid: string) => {
    return lightdashApi<CustomMetricData[]>({
        url: `/projects/${projectUuid}/custom-metrics`,
        method: 'GET',
        body: undefined,
    });
};

const useCustomMetrics = (projectUuid: string) =>
    useQuery<CustomMetricData[], ApiError>({
        queryKey: ['custom-metrics'],
        queryFn: () => getCustomMetrics(projectUuid),
    });

const CustomSqlPanel: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { t } = useTranslation();
    const [isOpen, setOpen] = React.useState(false);
    const [checked, setChecked] = React.useState<string[]>([]);
    const { data, isInitialLoading } = useCustomMetrics(projectUuid);

    const isCustomSQLEnabled = useFeatureFlagEnabled(
        FeatureFlags.CustomSQLEnabled,
    );

    if (!isCustomSQLEnabled) {
        return null;
    }

    if (isInitialLoading) {
        return (
            <LoadingState
                title={t(
                    'components_custom_sql_panel.sql_panel.loading_custom_sql',
                )}
            />
        );
    }
    // todo: disable button if no custom metrics are selected Or if gitintegration is not enabled
    return (
        <SettingsCard style={{ overflow: 'visible' }} p={0} shadow="none">
            <Group
                align="center"
                p="md"
                spacing="xs"
                sx={{
                    flexGrow: 1,
                }}
            >
                <Title order={5}>
                    {t('components_custom_sql_panel.sql_panel.custom_sql')}
                </Title>
                <Tooltip
                    label={t(
                        'components_custom_sql_panel.sql_panel.tooltip.label',
                    )}
                >
                    <Button size="xs" onClick={() => setOpen(true)} ml="auto">
                        {t(
                            'components_custom_sql_panel.sql_panel.tooltip.content',
                        )}
                    </Button>
                </Tooltip>
            </Group>
            {data && data.length > 0 ? (
                <CustomMetricsTable
                    customMetrics={data}
                    onSelectedCustomMetricsChange={(data2) => setChecked(data2)}
                />
            ) : (
                <ResourceEmptyState
                    title={t(
                        'components_custom_sql_panel.sql_panel.no_custom_metrics',
                    )}
                />
            )}

            {isOpen && (
                <CreateCustomMetricsPullRequestModal
                    opened={isOpen}
                    onClose={() => setOpen(false)}
                    projectUuid={projectUuid}
                    customMetrics={checked}
                />
            )}
        </SettingsCard>
    );
};

export default CustomSqlPanel;

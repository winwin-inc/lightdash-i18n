import { ActionIcon, Group, Stack, Tabs, Title, Tooltip } from '@mantine/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useSchedulerLogs } from '../../features/scheduler/hooks/useScheduler';
import { useTableTabStyles } from '../../hooks/styles/useTableTabStyles';
import useToaster from '../../hooks/toaster/useToaster';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import { SettingsCard } from '../common/Settings/SettingsCard';
import Logs from './LogsView';
import Schedulers from './SchedulersView';

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isInitialLoading } = useSchedulerLogs(projectUuid);
    const tableTabStyles = useTableTabStyles();
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { t } = useTranslation();

    const handleRefresh = async () => {
        await queryClient.invalidateQueries(['schedulerLogs']);

        showToastSuccess({
            title: t('components_schedulers_view.toast.success'),
        });
    };

    if (isInitialLoading) {
        return <LoadingState title={t('components_schedulers_view.loading')} />;
    }
    return (
        <Stack spacing="sm">
            <Group spacing="xs" align="center" pr="md">
                <Title order={5}>{t('components_schedulers_view.scheduled_deliveries')}</Title>
                <Tooltip label={t('components_schedulers_view.click_to_refresh')}>
                    <ActionIcon onClick={handleRefresh}>
                        <MantineIcon
                            icon={IconRefresh}
                            size="lg"
                            color="gray.6"
                            stroke={2}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Tabs
                classNames={tableTabStyles.classes}
                keepMounted={false}
                defaultValue="scheduled-deliveries"
            >
                <Tabs.List>
                    <Tabs.Tab
                        value="scheduled-deliveries"
                        icon={
                            <MantineIcon
                                icon={IconSend}
                                size="md"
                                color="gray.7"
                            />
                        }
                    >
                        {t('components_schedulers_view.tabs.all_schedulers')}
                    </Tabs.Tab>
                    <Tabs.Tab
                        value="run-history"
                        icon={
                            <MantineIcon
                                icon={IconClock}
                                size="md"
                                color="gray.7"
                            />
                        }
                    >
                        {t('components_schedulers_view.tabs.run_history')}
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="scheduled-deliveries">
                    <SettingsCard
                        style={{ overflow: 'visible' }}
                        p={0}
                        shadow="none"
                    >
                        <Schedulers projectUuid={projectUuid} />
                    </SettingsCard>
                </Tabs.Panel>
                <Tabs.Panel value="run-history">
                    <SettingsCard
                        style={{ overflow: 'visible' }}
                        p={0}
                        shadow="none"
                    >
                        {data && data.schedulers.length > 0 ? (
                            data.logs.length > 0 ? (
                                <Logs {...data} projectUuid={projectUuid} />
                            ) : (
                                <ResourceEmptyState
                                    title={t('components_schedulers_view.tabs.no_schedulers_jobs.title')}
                                    description={t('components_schedulers_view.tabs.no_schedulers_jobs.description')}
                                />
                            )
                        ) : (
                            <ResourceEmptyState
                                title={t('components_schedulers_view.tabs.no_schedulers_deliver.title')}
                                description={t('components_schedulers_view.tabs.no_schedulers_deliver.description')}
                            />
                        )}
                    </SettingsCard>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default SchedulersView;

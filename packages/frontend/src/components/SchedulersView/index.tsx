import {
    ActionIcon,
    Card,
    Group,
    Stack,
    Tabs,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useSchedulerLogs } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../../hooks/toaster/useToaster';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import LogsTable from './LogsTable';
import SchedulersTable from './SchedulersTable';
import classes from './SchedulersView.module.css';

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isInitialLoading } = useSchedulerLogs({
        projectUuid,
        paginateArgs: { page: 1, pageSize: 1 },
    });
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { t } = useTranslation();

    // Extract data from paginated response
    const schedulersData = data?.pages?.[0]?.data;

    const handleRefresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries(['schedulerLogs']),
            queryClient.invalidateQueries(['paginatedSchedulers']),
        ]);

        showToastSuccess({
            title: t('components_schedulers_view.toast.success'),
        });
    };

    if (isInitialLoading) {
        return <LoadingState title={t('components_schedulers_view.loading')} />;
    }
    return (
        <Card>
            <Stack gap="sm">
                <Tabs
                    keepMounted={false}
                    defaultValue="scheduled-deliveries"
                    variant="pills"
                    classNames={{
                        list: classes.tabsList,
                        tab: classes.tab,
                        tabSection: classes.tabSection,
                        panel: classes.panel,
                    }}
                >
                    <Group
                        gap="xs"
                        align="center"
                        justify="space-between"
                        className={classes.header}
                    >
                        <Title order={5}>
                            {t(
                                'components_schedulers_view.scheduled_deliveries',
                            )}
                        </Title>
                        <Tooltip
                            label={t(
                                'components_schedulers_view.click_to_refresh',
                            )}
                        >
                            <ActionIcon
                                onClick={handleRefresh}
                                variant="subtle"
                                size="xs"
                            >
                                <MantineIcon
                                    icon={IconRefresh}
                                    color="gray.6"
                                    stroke={2}
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <Tabs.List>
                        <Tabs.Tab
                            value="scheduled-deliveries"
                            leftSection={<MantineIcon icon={IconSend} />}
                        >
                            {t(
                                'components_schedulers_view.tabs.all_schedulers',
                            )}
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="run-history"
                            leftSection={<MantineIcon icon={IconClock} />}
                        >
                            {t('components_schedulers_view.tabs.run_history')}
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="scheduled-deliveries">
                        <SchedulersTable projectUuid={projectUuid} />
                    </Tabs.Panel>
                    <Tabs.Panel value="run-history">
                        {schedulersData &&
                        schedulersData.schedulers.length > 0 ? (
                            schedulersData.logs.length > 0 ? (
                                <LogsTable projectUuid={projectUuid} />
                            ) : (
                                <ResourceEmptyState
                                    title={t(
                                        'components_schedulers_view.tabs.no_schedulers_jobs.title',
                                    )}
                                    description={t(
                                        'components_schedulers_view.tabs.no_schedulers_jobs.description',
                                    )}
                                />
                            )
                        ) : (
                            <ResourceEmptyState
                                title={t(
                                    'components_schedulers_view.tabs.no_schedulers_deliver.title',
                                )}
                                description={t(
                                    'components_schedulers_view.tabs.no_schedulers_deliver.description',
                                )}
                            />
                        )}
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Card>
    );
};

export default SchedulersView;

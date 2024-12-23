import { ContentType, LightdashMode } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams } from 'react-router-dom';

import LoadingState from '../components/common/LoadingState';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

const SavedDashboards = () => {
    const history = useHistory();
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: dashboards = [] } =
        useDashboards(projectUuid);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    const { health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: spaces, isInitialLoading: isLoadingSpaces } =
        useSpaceSummaries(projectUuid);
    const hasNoSpaces = spaces && spaces.length === 0;

    const userCanCreateDashboards = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
    );

    if (isInitialLoading || isLoadingSpaces) {
        return (
            <LoadingState
                title={t('pages_saved_dashboards.loading_dashboards')}
            />
        );
    }

    const handleCreateDashboard = () => {
        setIsCreateDashboardOpen(true);
    };

    return (
        <Page
            title={t('pages_saved_dashboards.dashboards')}
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack spacing="xxl" w="100%">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            {
                                title: t(
                                    'pages_saved_dashboards.bread_crumbs.home',
                                ),
                                to: '/home',
                            },
                            {
                                title: t(
                                    'pages_saved_dashboards.bread_crumbs.all_dashboards',
                                ),
                                active: true,
                            },
                        ]}
                    />

                    {dashboards.length > 0 &&
                        userCanCreateDashboards &&
                        !isDemo && (
                            <Button
                                leftIcon={<IconPlus size={18} />}
                                onClick={handleCreateDashboard}
                                disabled={hasNoSpaces}
                            >
                                {t('pages_saved_dashboards.create_dashbord')}
                            </Button>
                        )}
                </Group>

                <InfiniteResourceTable
                    filters={{
                        projectUuid,
                        contentTypes: [ContentType.DASHBOARD],
                    }}
                />
            </Stack>

            <DashboardCreateModal
                projectUuid={projectUuid}
                defaultSpaceUuid={spaces?.[0]?.uuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </Page>
    );
};

export default SavedDashboards;

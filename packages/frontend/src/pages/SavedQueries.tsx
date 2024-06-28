import {
    LightdashMode,
    ResourceViewItemType,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams } from 'react-router-dom';

import LoadingState from '../components/common/LoadingState';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import { useCharts } from '../hooks/useCharts';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import { useApp } from '../providers/AppProvider';

const SavedQueries: FC = () => {
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: savedQueries = [] } =
        useCharts(projectUuid);

    const { user, health } = useApp();
    const cannotView = user.data?.ability?.cannot('view', 'SavedChart');

    const history = useHistory();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    if (isInitialLoading && !cannotView) {
        return <LoadingState title={t('pages_saved_queries.loading_charts')} />;
    }

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    return (
        <Page
            title={t('pages_saved_queries.saved_charts')}
            withFixedContent
            withPaddedContent
        >
            <Stack spacing="xl">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            {
                                title: t(
                                    'pages_saved_queries.bread_crumbs.home',
                                ),
                                to: '/home',
                            },
                            {
                                title: t(
                                    'pages_saved_queries.bread_crumbs.all_saved_charts',
                                ),
                                active: true,
                            },
                        ]}
                    />

                    {savedQueries.length > 0 &&
                    !isDemo &&
                    userCanCreateCharts ? (
                        <Button
                            leftIcon={<IconPlus size={18} />}
                            onClick={handleCreateChart}
                        >
                            {t('pages_saved_queries.create_chart')}
                        </Button>
                    ) : undefined}
                </Group>

                <ResourceView
                    items={wrapResourceView(
                        savedQueries,
                        ResourceViewItemType.CHART,
                    )}
                    listProps={{
                        defaultSort: { updatedAt: SortDirection.DESC },
                    }}
                    emptyStateProps={{
                        icon: <IconChartBar size={30} />,
                        title: t('pages_saved_queries.no_charts_added_yet'),
                        action:
                            !isDemo && userCanCreateCharts ? (
                                <Button onClick={handleCreateChart}>
                                    {t('pages_saved_queries.create_chart')}
                                </Button>
                            ) : undefined,
                    }}
                />
            </Stack>
        </Page>
    );
};

export default SavedQueries;

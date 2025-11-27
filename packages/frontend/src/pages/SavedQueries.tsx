import { ContentType, LightdashMode } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { useProject } from '../hooks/useProject';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../providers/App/useApp';

const SavedQueries: FC = () => {
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const project = useProject(projectUuid);
    const isCustomerUse = project.data?.isCustomerUse ?? false;

    const { health } = useApp();
    const navigate = useNavigate();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    const handleCreateChart = () => {
        void navigate(`/projects/${projectUuid}/tables`);
    };

    return (
        <Page
            title={t('pages_saved_queries.saved_charts')}
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
                    {!isDemo && userCanCreateCharts ? (
                        <Button
                            leftIcon={<IconPlus size={18} />}
                            onClick={handleCreateChart}
                        >
                            {t('pages_saved_queries.create_chart')}
                        </Button>
                    ) : undefined}
                </Group>

                {projectUuid ? (
                    <InfiniteResourceTable
                        isCustomerUse={isCustomerUse}
                        filters={{
                            projectUuid,
                            contentTypes: [ContentType.CHART],
                        }}
                    />
                ) : null}
            </Stack>
        </Page>
    );
};

export default SavedQueries;

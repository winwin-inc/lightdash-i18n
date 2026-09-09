import { subject } from '@casl/ability';
import { ContentType, FeatureFlags } from '@lightdash/common';
import { Group, Stack, Button } from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const SavedApps = () => {
    const { t } = useTranslation();
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

    if (!projectUuid) {
        return null;
    }

    if (dataAppsFlag.isLoading) {
        return null;
    }

    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Page
                title={t('pages_saved_apps.title')}
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
            >
                <Stack gap="xxl" w="100%">
                    <Group justify="space-between">
                        <PageBreadcrumbs
                            items={[
                                {
                                    title: t('pages_saved_apps.breadcrumb_home'),
                                    to: '/home',
                                },
                                {
                                    title: t(
                                        'pages_saved_apps.breadcrumb_all',
                                    ),
                                    active: true,
                                },
                            ]}
                        />

                        <Can
                            I="create"
                            this={subject('DataApp', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/apps/generate`}
                                leftSection={<IconPlus size={18} />}
                            >
                                {t('pages_saved_apps.create')}
                            </Button>
                        </Can>
                    </Group>

                    <InfiniteResourceTable
                        // showDataAppVersionStatus — STUB until InfiniteResourceTable column is ported
                        filters={{
                            projectUuid,
                            contentTypes: [ContentType.DATA_APP],
                            // includePersonalDataApps / dataAppVizsFilter — STUB until ContentArgs wired
                        }}
                        isCustomerUse={false}
                    />
                </Stack>
            </Page>
        </FavoritesProvider>
    );
};

export default SavedApps;

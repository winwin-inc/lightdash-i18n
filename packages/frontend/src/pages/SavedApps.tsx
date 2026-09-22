import { subject } from '@casl/ability';
import { ContentType, FeatureFlags } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine-8/core';
import { IconUpload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import AppUploadModal from '../features/apps/components/AppUploadModal';
import { canAdminUploadDataApp } from '../features/apps/utils/canAdminUploadDataApp';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const SavedApps = () => {
    const { t } = useTranslation();
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const [searchParams, setSearchParams] = useSearchParams();
    const [uploadOpen, setUploadOpen] = useState(
        searchParams.get('upload') === '1',
    );

    const canView =
        !!user.data?.ability?.can(
            'view',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) || !!user.data?.ability?.can('view', 'DataApp');
    const canUpload =
        !!projectUuid && canAdminUploadDataApp(user.data, projectUuid);

    useEffect(() => {
        if (searchParams.get('upload') === '1' && canUpload) {
            setUploadOpen(true);
            const next = new URLSearchParams(searchParams);
            next.delete('upload');
            setSearchParams(next, { replace: true });
        }
    }, [canUpload, searchParams, setSearchParams]);

    if (!projectUuid) {
        return null;
    }

    if (dataAppsFlag.isLoading) {
        return null;
    }

    if (!dataAppsFlag.data?.enabled || !canView) {
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
                                    title: t('pages_saved_apps.breadcrumb_all'),
                                    active: true,
                                },
                            ]}
                        />

                        {canUpload && (
                            <Button
                                leftSection={<IconUpload size={18} />}
                                onClick={() => setUploadOpen(true)}
                            >
                                {t('pages_saved_apps.upload')}
                            </Button>
                        )}
                    </Group>

                    <InfiniteResourceTable
                        filters={{
                            projectUuid,
                            contentTypes: [ContentType.DATA_APP],
                        }}
                        isCustomerUse={false}
                    />
                </Stack>
            </Page>
            {canUpload && (
                <AppUploadModal
                    opened={uploadOpen}
                    projectUuid={projectUuid}
                    onClose={() => setUploadOpen(false)}
                />
            )}
        </FavoritesProvider>
    );
};

export default SavedApps;

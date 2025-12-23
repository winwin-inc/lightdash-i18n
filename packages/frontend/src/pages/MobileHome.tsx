import {
    ResourceItemCategory,
    ResourceViewItemType,
    wrapResource,
} from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import ResourceView from '../components/common/ResourceView';
import { ResourceSortDirection } from '../components/common/ResourceView/types';
import ForbiddenPanel from '../components/ForbiddenPanel';
import PageSpinner from '../components/PageSpinner';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import { useProjectSavedChartStatus } from '../hooks/useOnboardingStatus';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../hooks/useProject';
import useApp from '../providers/App/useApp';

const MobileHome: FC = () => {
    const { t } = useTranslation();
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const savedChartStatus = useProjectSavedChartStatus(selectedProjectUuid);
    const project = useProject(selectedProjectUuid);
    const pinnedItems = usePinnedItems(
        selectedProjectUuid,
        project.data?.pinnedListUuid,
    );

    const isCustomerUse = project.data?.isCustomerUse ?? false;

    const {
        data: mostPopularAndRecentlyUpdated,
        isInitialLoading: isMostPopularAndRecentlyUpdatedLoading,
    } = useMostPopularAndRecentlyUpdated(selectedProjectUuid);

    const { user } = useApp();
    const items = useMemo(() => {
        const mostPopularItems =
            mostPopularAndRecentlyUpdated?.mostPopular.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.MOST_POPULAR,
            })) ?? [];
        const pinnedItemsWithCategory =
            pinnedItems.data?.map((item) => ({
                ...item,
                category: ResourceItemCategory.PINNED,
            })) ?? [];

        return isCustomerUse
            ? pinnedItemsWithCategory
            : [...pinnedItemsWithCategory, ...mostPopularItems];
    }, [mostPopularAndRecentlyUpdated, pinnedItems, isCustomerUse]);

    const isLoading =
        project.isInitialLoading ||
        savedChartStatus.isInitialLoading ||
        isMostPopularAndRecentlyUpdatedLoading ||
        pinnedItems.isInitialLoading;
    const error = project.error || savedChartStatus.error;

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
        return <PageSpinner />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (!project.data) {
        return <ErrorState />;
    }

    return (
        <Stack spacing="md" m="lg">
            <Stack justify="flex-start" spacing="xs">
                <Title order={3}>
                    {`${t('pages_mobile_home.welcome.part_1')}${
                        user.data?.firstName
                            ? ', ' + user.data?.firstName
                            : t('pages_mobile_home.welcome.part_2')
                    }!`}{' '}
                </Title>
            </Stack>
            <ResourceView
                items={items}
                tabs={
                    pinnedItems.data && pinnedItems.data.length > 0
                        ? [
                              {
                                  id: 'pinned',
                                  name: t('pages_mobile_home.tabs.pinned'),
                                  filter: (item) =>
                                      'category' in item &&
                                      item.category ===
                                          ResourceItemCategory.PINNED,
                              },
                              {
                                  id: 'most-popular',
                                  name: t(
                                      'pages_mobile_home.tabs.most_popular',
                                  ),
                                  filter: (item) =>
                                      'category' in item &&
                                      item.category ===
                                          ResourceItemCategory.MOST_POPULAR,
                              },
                          ]
                        : undefined
                }
                listProps={{
                    defaultSort: { updatedAt: ResourceSortDirection.DESC },
                    defaultColumnVisibility: {
                        space: false,
                        updatedAt: false,
                        actions: false,
                    },
                }}
                emptyStateProps={{
                    icon: <IconLayoutDashboard size={30} />,
                    title: t('pages_mobile_home.empty'),
                }}
            />
        </Stack>
    );
};

export default MobileHome;

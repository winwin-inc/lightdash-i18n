import {
    LightdashMode,
    ResourceItemCategory,
    ResourceViewItemType,
    wrapResource,
    type MostPopularAndRecentlyUpdated,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import MantineLinkButton from '../../common/MantineLinkButton';
import ResourceView from '../../common/ResourceView';

interface Props {
    data: MostPopularAndRecentlyUpdated | undefined;
    projectUuid: string;
}

export const MostPopularAndRecentlyUpdatedPanel: FC<Props> = ({
    data,
    projectUuid,
}) => {
    const MAX_NUMBER_OF_ITEMS_IN_PANEL = 10;
    const navigate = useNavigate();
    const { health } = useApp();
    const { t } = useTranslation();

    const mostPopularAndRecentlyUpdatedItems = useMemo(() => {
        const mostPopularItems =
            data?.mostPopular.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.MOST_POPULAR,
            })) ?? [];
        const recentlyUpdatedItems =
            data?.recentlyUpdated.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.RECENTLY_UPDATED,
            })) ?? [];
        return [...mostPopularItems, ...recentlyUpdatedItems];
    }, [data?.mostPopular, data?.recentlyUpdated]);

    const handleCreateChart = () => {
        void navigate(`/projects/${projectUuid}/tables`);
    };

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    return (
        <ResourceView
            items={mostPopularAndRecentlyUpdatedItems}
            maxItems={MAX_NUMBER_OF_ITEMS_IN_PANEL}
            tabs={[
                {
                    id: 'most-popular',
                    name: t(
                        'components_most_popular_and_rencently_updated_panel.tabs.tab1.name',
                    ),
                    filter: (item) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.MOST_POPULAR,
                },
                {
                    id: 'recently-updated',
                    name: t(
                        'components_most_popular_and_rencently_updated_panel.tabs.tab2.name',
                    ),
                    filter: (item) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.RECENTLY_UPDATED,
                },
            ]}
            listProps={{
                enableSorting: false,
                defaultColumnVisibility: { space: false },
            }}
            headerProps={
                mostPopularAndRecentlyUpdatedItems.length === 0
                    ? {
                          title: t(
                              'components_most_popular_and_rencently_updated_panel.header.title',
                          ),
                          action: (
                              <MantineLinkButton
                                  color="gray.6"
                                  compact
                                  variant="subtle"
                                  target="_blank"
                                  href="https://docs.lightdash.com/get-started/exploring-data/intro"
                              >
                                  {t(
                                      'components_most_popular_and_rencently_updated_panel.header.learn',
                                  )}
                              </MantineLinkButton>
                          ),
                      }
                    : undefined
            }
            emptyStateProps={{
                icon: <MantineIcon icon={IconChartBar} size={30} />,
                title: userCanCreateCharts
                    ? t(
                          'components_most_popular_and_rencently_updated_panel.empty.can_create.title',
                      )
                    : t(
                          'components_most_popular_and_rencently_updated_panel.empty.can_create.description',
                      ),
                description: userCanCreateCharts
                    ? t(
                          'components_most_popular_and_rencently_updated_panel.empty.cannot_create.title',
                      )
                    : t(
                          'components_most_popular_and_rencently_updated_panel.empty.cannot_create.description',
                      ),
                action:
                    !isDemo && userCanCreateCharts ? (
                        <Button
                            leftIcon={<MantineIcon icon={IconPlus} size={18} />}
                            onClick={handleCreateChart}
                        >
                            {t(
                                'components_most_popular_and_rencently_updated_panel.empty.create',
                            )}
                        </Button>
                    ) : undefined,
            }}
        />
    );
};

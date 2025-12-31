import {
    assertUnreachable,
    DashboardTileTypes,
    type DashboardTile,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
    type ResponsiveGridLayoutProps,
} from '../../../../../components/DashboardTabs/gridUtils';
import LoomTile from '../../../../../components/DashboardTiles/DashboardLoomTile';
import SqlChartTile from '../../../../../components/DashboardTiles/DashboardSqlChartTile';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { LockedDashboardModal } from '../../../../../components/common/modal/LockedDashboardModal';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedDashboard } from '../hooks';
import EmbedDashboardChartTile from './EmbedDashboardChartTile';
import EmbedDashboardHeader from './EmbedDashboardHeader';

import { Group, Tabs, Title } from '@mantine/core';
import '../../../../../styles/react-grid.css';
import { EmbedMarkdownTile } from './EmbedMarkdownTile';

const ResponsiveGridLayout = WidthProvider(Responsive);

const EmbedDashboardGrid: FC<{
    filteredTiles: DashboardTile[];
    layouts: { lg: Layout[]; md: Layout[]; sm: Layout[] };
    dashboard: any;
    projectUuid: string;
    hasRequiredDashboardFiltersToSet: boolean;
    isTabEmpty?: boolean;
    gridProps: ResponsiveGridLayoutProps;
}> = ({
    filteredTiles,
    layouts,
    dashboard,
    projectUuid,
    hasRequiredDashboardFiltersToSet,
    isTabEmpty,
    gridProps,
}) => {
    const { t } = useTranslation();

    return (
        <Group grow pt="sm" px="xs">
            {isTabEmpty ? (
                <div
                    style={{
                        marginTop: '40px',
                        textAlign: 'center',
                    }}
                >
                    <SuboptimalState
                        title={t('ai_embed_dashboard.tab_empty')}
                        description={t(
                            'ai_embed_dashboard.tab_empty_description',
                        )}
                    />
                </div>
            ) : (
                <ResponsiveGridLayout
                    {...gridProps}
                    layouts={layouts}
                    className={`react-grid-layout-dashboard ${
                        hasRequiredDashboardFiltersToSet ? 'locked' : ''
                    }`}
                >
                    {filteredTiles.map((tile, index) => (
                        <div key={tile.uuid}>
                            {tile.type === DashboardTileTypes.SAVED_CHART ? (
                                <EmbedDashboardChartTile
                                    projectUuid={projectUuid}
                                    dashboardSlug={dashboard.slug}
                                    key={tile.uuid}
                                    minimal
                                    tile={tile}
                                    isEditMode={false}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
                                    canExportCsv={dashboard.canExportCsv}
                                    canExportImages={dashboard.canExportImages}
                                    locked={hasRequiredDashboardFiltersToSet}
                                    tileIndex={index}
                                />
                            ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                                <EmbedMarkdownTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={false}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
                                    tileIndex={index}
                                    dashboardSlug={dashboard.slug}
                                />
                            ) : tile.type === DashboardTileTypes.LOOM ? (
                                <LoomTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={false}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
                                />
                            ) : tile.type === DashboardTileTypes.SQL_CHART ? (
                                <SqlChartTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={false}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
                                />
                            ) : (
                                assertUnreachable(
                                    tile,
                                    `Dashboard tile type is not recognised`,
                                )
                            )}
                        </div>
                    ))}
                </ResponsiveGridLayout>
            )}
        </Group>
    );
};

const EmbedDashboard: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
    const { t } = useTranslation();
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const setActiveTab = useDashboardContext((c) => c.setActiveTab);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);

    const { embedToken, mode } = useEmbed();
    const navigate = useNavigate();
    const { pathname, search } = useLocation();

    if (!embedToken) {
        throw new Error(t('ai_embed_dashboard.embed_token'));
    }

    const { data: dashboard, error: dashboardError } =
        useEmbedDashboard(projectUuid);

    // Handle 403 Forbidden error - redirect to no permission page
    useEffect(() => {
        if (
            dashboardError?.error?.statusCode === 403 &&
            dashboardError.error.message?.includes('dashboard')
        ) {
            void navigate('/no-dashboard-access', { replace: true });
        }
    }, [dashboardError, navigate]);

    useEffect(() => {
        if (dashboard) {
            setDashboardTiles(dashboard.tiles);
        }
    }, [dashboard, setDashboardTiles]);

    const setEmbedDashboard = useDashboardContext((c) => c.setEmbedDashboard);
    useEffect(() => {
        if (dashboard) {
            setEmbedDashboard(dashboard);
        }
    }, [dashboard, setEmbedDashboard]);
    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );

    const hasRequiredDashboardFiltersToSet =
        requiredDashboardFilters.length > 0;
    const hasChartTiles =
        useMemo(
            () =>
                dashboard?.tiles.some(
                    (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                ),
            [dashboard],
        ) || false;

    // Sort tabs by order
    const sortedTabs = useMemo(() => {
        if (!dashboard?.tabs || dashboard.tabs.length === 0) {
            return [];
        }
        return dashboard.tabs.sort((a, b) => a.order - b.order);
    }, [dashboard?.tabs]);

    // Set active tab to first tab if no active tab is set and no tab in URL
    useEffect(() => {
        if (
            sortedTabs.length > 0 &&
            !activeTab &&
            !pathname.includes('/tabs/')
        ) {
            setActiveTab(sortedTabs[0]);
        }
    }, [sortedTabs, activeTab, pathname, setActiveTab]);

    // Filter tiles by active tab
    const filteredTiles = useMemo(() => {
        if (!dashboard?.tiles) {
            return [];
        }

        let tiles: typeof dashboard.tiles;

        // If no tabs or only one tab, show all tiles
        if (sortedTabs.length <= 1) {
            tiles = dashboard.tiles;
        } else {
            // Make sure we have a tab selected
            const tab = activeTab || sortedTabs[0];

            // If there are tabs, filter tiles by active tab
            if (tab) {
                tiles = dashboard.tiles.filter((tile) => {
                    // Show tiles that belong to the active tab
                    const tileBelongsToActiveTab = tile.tabUuid === tab.uuid;

                    // Show tiles that don't belong to any tab (legacy tiles) on the first tab
                    const tileHasNoTab = !tile.tabUuid;
                    const isFirstTab = tab.uuid === sortedTabs[0]?.uuid;

                    return (
                        tileBelongsToActiveTab || (tileHasNoTab && isFirstTab)
                    );
                });
            } else {
                tiles = [];
            }
        }

        // Sort tiles by y (row) then x (column) for consistent left-to-right, top-to-bottom order
        return tiles.sort((a, b) => {
            if (a.y === b.y) {
                return a.x - b.x;
            }
            return a.y - b.y;
        });
    }, [sortedTabs, activeTab, dashboard]);

    // Check if tabs should be enabled (more than one tab)
    const tabsEnabled = sortedTabs.length > 1;
    const MAGIC_SCROLL_AREA_HEIGHT = 40;

    const gridProps = getResponsiveGridLayoutProps({ enableAnimation: false });
    const layouts = useMemo(
        () => ({
            lg: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.lg),
            ),
            md: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.md),
            ),
            sm: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.sm),
            ),
        }),
        [filteredTiles, gridProps.cols],
    );

    if (!projectUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('ai_embed_dashboard.loading')}
                    loading
                />
            </div>
        );
    }
    if (dashboardError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('ai_embed_dashboard.loading')}
                    loading
                />
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('ai_embed_dashboard.loading')}
                    loading
                />
            </div>
        );
    }

    if (dashboard.tiles.length === 0) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('ai_embed_dashboard.loading')}
                    loading
                />
            </div>
        );
    }

    // Check if current tab is empty
    const isTabEmpty = tabsEnabled && filteredTiles.length === 0;

    // Sync tabs with URL when user changes tab for iframes.
    // SDK mode does not sync URL when user changes tab because
    // the SDK app uses the same URL as the embedding app.
    const handleTabChange = (tabUuid: string) => {
        const tab = sortedTabs.find((item) => item.uuid === tabUuid);
        if (tab) {
            setActiveTab(tab);

            if (mode === 'direct') {
                const newParams = new URLSearchParams(search);
                const currentPath = pathname;

                // Update URL to include tab UUID
                const newPath = currentPath.includes('/tabs/')
                    ? currentPath.replace(/\/tabs\/[^/]+$/, `/tabs/${tab.uuid}`)
                    : `${currentPath}/tabs/${tab.uuid}`;

                void navigate(
                    {
                        pathname: newPath,
                        search: newParams.toString(),
                    },
                    { replace: true },
                );
            }
        }
    };

    return (
        <div style={containerStyles ?? { height: '100vh', overflowY: 'auto' }}>
            <EmbedDashboardHeader
                dashboard={dashboard}
                projectUuid={projectUuid}
            />

            <LockedDashboardModal
                opened={hasRequiredDashboardFiltersToSet && !!hasChartTiles}
            />

            {tabsEnabled ? (
                <Tabs
                    value={activeTab?.uuid}
                    onTabChange={handleTabChange}
                    mt="md"
                    styles={{
                        tabsList: {
                            flexWrap: 'nowrap',
                            height: MAGIC_SCROLL_AREA_HEIGHT - 1,
                        },
                    }}
                    variant="outline"
                >
                    <Tabs.List bg="gray.0" px="lg">
                        {sortedTabs.map((tab) => (
                            <Tabs.Tab
                                key={tab.uuid}
                                value={tab.uuid}
                                bg={
                                    activeTab?.uuid === tab.uuid
                                        ? 'white'
                                        : 'gray.0'
                                }
                            >
                                <Title
                                    fw={500}
                                    order={6}
                                    color="gray.7"
                                    truncate
                                    maw={`calc(${
                                        100 / (sortedTabs?.length || 1)
                                    }vw)`}
                                >
                                    {tab.name}
                                </Title>
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                    <EmbedDashboardGrid
                        filteredTiles={filteredTiles}
                        layouts={layouts}
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                        hasRequiredDashboardFiltersToSet={
                            hasRequiredDashboardFiltersToSet
                        }
                        isTabEmpty={isTabEmpty}
                        gridProps={gridProps}
                    />
                </Tabs>
            ) : (
                <EmbedDashboardGrid
                    filteredTiles={filteredTiles}
                    layouts={layouts}
                    dashboard={dashboard}
                    projectUuid={projectUuid}
                    hasRequiredDashboardFiltersToSet={
                        hasRequiredDashboardFiltersToSet
                    }
                    gridProps={gridProps}
                />
            )}
        </div>
    );
};

export default EmbedDashboard;

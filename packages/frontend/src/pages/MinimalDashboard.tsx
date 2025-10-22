import type {
    DashboardFilterRule,
    DashboardTab,
    ParametersValuesMap,
} from '@lightdash/common';
import {
    assertUnreachable,
    DashboardTileTypes,
    isDashboardScheduler,
    SessionStorageKeys,
} from '@lightdash/common';
import { Group } from '@mantine/core';
import { useSessionStorage } from '@mantine/hooks';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DashboardFilter from '../components/DashboardFilter';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from '../components/DashboardTabs/gridUtils';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import SqlChartTile from '../components/DashboardTiles/DashboardSqlChartTile';
import MinimalDashboardTabs from '../components/MinimalDashboardTabs';
import { useScheduler } from '../features/scheduler/hooks/useScheduler';
import { useDateZoomGranularitySearch } from '../hooks/useExplorerRoute';
import useSearchParams from '../hooks/useSearchParams';
import DashboardProvider from '../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const MinimalDashboard: FC = () => {
    const { t } = useTranslation();

    const schedulerUuid = useSearchParams('schedulerUuid');
    const schedulerTabs = useSearchParams('selectedTabs');

    const { projectUuid, dashboardUuid, tabUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        tabUuid?: string;
    }>();

    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardError = useDashboardContext((c) => c.dashboardError);

    const [activeTab, setActiveTab] = useState<DashboardTab | null>(null);

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);

    const hasTilesThatSupportFilters = useDashboardContext(
        (c) => c.hasTilesThatSupportFilters,
    );

    useEffect(() => {
        const matchedTab =
            dashboard?.tabs.find((tab) => tab.uuid === tabUuid) ??
            dashboard?.tabs[0];
        setActiveTab(matchedTab || null);
    }, [tabUuid, dashboard?.tabs]);

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(dashboard?.tiles ?? []);
    }, [isDashboardLoading, dashboard, dashboardTiles, setDashboardTiles]);

    const schedulerTabsSelected = useMemo(() => {
        if (schedulerTabs) {
            return JSON.parse(schedulerTabs);
        }
        return undefined;
    }, [schedulerTabs]);

    const [sendNowSchedulerFilters] = useSessionStorage<
        DashboardFilterRule[] | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_FILTERS,
    });

    const { data: scheduler, error: schedulerError } = useScheduler(
        schedulerUuid,
        {
            enabled: !!schedulerUuid && !sendNowSchedulerFilters,
        },
    );

    const generateTabUrl = useCallback(
        (tabId: string) =>
            `/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${tabId}`,
        [projectUuid, dashboardUuid],
    );

    const sortedTabs = useMemo(
        () => dashboard?.tabs.sort((a, b) => a.order - b.order) ?? [],
        [dashboard?.tabs],
    );

    const tabsWithUrls = useMemo(() => {
        return sortedTabs.map((tab, index) => {
            const prevTab = sortedTabs[index - 1];
            const nextTab = sortedTabs[index + 1];

            return {
                ...tab,
                prevUrl: prevTab ? generateTabUrl(prevTab.uuid) : null,
                nextUrl: nextTab ? generateTabUrl(nextTab.uuid) : null,
                selfUrl: generateTabUrl(tab.uuid),
            };
        });
    }, [sortedTabs, generateTabUrl]);

    const gridProps = getResponsiveGridLayoutProps({
        stackVerticallyOnSmallestBreakpoint: true,
    });

    const layouts = useMemo(() => {
        const tiles =
            dashboard?.tiles.filter((tile) =>
                // If there are selected tabs when sending now/scheduling, aggregate ALL tiles into one view.
                schedulerTabsSelected
                    ? schedulerTabsSelected.includes(tile.tabUuid)
                    : // This is when viewed a dashboard with tabs in mobile mode - you can navigate between tabs.
                      !activeTab || activeTab.uuid === tile.tabUuid,
            ) ?? [];

        return {
            lg: tiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.lg),
            ),
            md: tiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.md),
            ),
        };
    }, [dashboard?.tiles, schedulerTabsSelected, activeTab, gridProps.cols]);

    const filteredDashboardTiles = useMemo(() => {
        return (
            dashboard?.tiles.filter((tile) =>
                // If there are selected tabs when sending now/scheduling, aggregate ALL tiles into one view.
                schedulerTabsSelected
                    ? schedulerTabsSelected.includes(tile.tabUuid)
                    : // This is when viewed a dashboard with tabs in mobile mode - you can navigate between tabs.
                      !activeTab || activeTab.uuid === tile.tabUuid,
            ) ?? []
        );
    }, [dashboard?.tiles, schedulerTabsSelected, activeTab]);

    const isTabEmpty =
        activeTab &&
        !dashboard?.tiles?.find((tile) => tile.tabUuid === activeTab.uuid);

    const canNavigateBetweenTabs =
        !schedulerTabsSelected && tabsWithUrls.length > 0;

    if (dashboardError || schedulerError) {
        if (dashboardError) return <>{dashboardError.error.message}</>;
        if (schedulerError) return <>{schedulerError.error.message}</>;
    }

    if (!dashboard) {
        return <>{t('pages_minimal_dashboard.loading')}</>;
    }

    if (schedulerUuid && !scheduler) {
        return <>{t('pages_minimal_dashboard.loading')}</>;
    }

    if (dashboard.tiles.length === 0) {
        return <>{t('pages_minimal_dashboard.no_tiles')}</>;
    }

    return (
        <>
            {/* dashboard global filters */}
            {hasTilesThatSupportFilters && sortedTabs.length === 0 && (
                <Group
                    position="apart"
                    align="flex-start"
                    noWrap
                    px={'md'}
                    mt={'md'}
                >
                    <Group
                        position="apart"
                        align="flex-start"
                        noWrap
                        grow
                        sx={{
                            overflow: 'auto',
                        }}
                    >
                        <DashboardFilter
                            isEditMode={false}
                            activeTabUuid={activeTab?.uuid}
                            filterType="global"
                        />
                    </Group>
                </Group>
            )}

            {/* This is when viewing a dashboard with tabs in mobile mode - you can navigate between tabs. */}
            {canNavigateBetweenTabs && (
                <MinimalDashboardTabs
                    tabs={tabsWithUrls}
                    activeTabId={activeTab?.uuid || null}
                />
            )}

            {/* dashboard tab filters */}
            {hasTilesThatSupportFilters && activeTab?.uuid && (
                <Group
                    position="apart"
                    align="flex-start"
                    noWrap
                    px={'md'}
                    mt={'md'}
                >
                    <Group
                        position="apart"
                        align="flex-start"
                        noWrap
                        grow
                        sx={{
                            overflow: 'auto',
                        }}
                    >
                        <DashboardFilter
                            isEditMode={false}
                            activeTabUuid={activeTab?.uuid}
                            filterType="tab"
                        />
                    </Group>
                </Group>
            )}

            {isTabEmpty ? (
                <SuboptimalState
                    icon={IconLayoutDashboard}
                    title={t('pages_minimal_dashboard.tab_is_empty')}
                    sx={{ marginTop: '40px' }}
                />
            ) : (
                <ResponsiveGridLayout {...gridProps} layouts={layouts}>
                    {filteredDashboardTiles.map((tile) => (
                        <div key={tile.uuid}>
                            {tile.type === DashboardTileTypes.SAVED_CHART ? (
                                <ChartTile
                                    key={tile.uuid}
                                    minimal
                                    tile={tile}
                                    isEditMode={false}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
                                />
                            ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                                <MarkdownTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={false}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
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
        </>
    );
};

const MinimalDashboardPage: FC = () => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        tabUuid?: string;
    }>();

    const schedulerUuid = useSearchParams('schedulerUuid');

    const [sendNowSchedulerFilters] = useSessionStorage<
        DashboardFilterRule[] | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_FILTERS,
    });

    const [sendNowSchedulerParameters] = useSessionStorage<
        ParametersValuesMap | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_PARAMETERS,
    });

    const dateZoom = useDateZoomGranularitySearch();

    const { data: scheduler } = useScheduler(schedulerUuid, {
        enabled: !!schedulerUuid && !sendNowSchedulerFilters,
    });

    const schedulerFilters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.filters;
        }

        return sendNowSchedulerFilters;
    }, [scheduler, schedulerUuid, sendNowSchedulerFilters]);

    const schedulerParameters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.parameters;
        }

        return sendNowSchedulerParameters;
    }, [scheduler, schedulerUuid, sendNowSchedulerParameters]);

    return (
        <DashboardProvider
            projectUuid={projectUuid}
            schedulerFilters={schedulerFilters}
            schedulerParameters={schedulerParameters}
            dateZoom={dateZoom}
            defaultInvalidateCache={true}
        >
            <MinimalDashboard />
        </DashboardProvider>
    );
};

export default MinimalDashboardPage;

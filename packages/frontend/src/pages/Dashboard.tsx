import {
    ContentType,
    DashboardTileTypes,
    ECHARTS_DEFAULT_COLORS,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type Dashboard as IDashboard,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Flex,
    Group,
    Modal,
    Popover,
    ScrollArea,
    Stack,
    Switch,
    Text,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { captureException, useProfiler } from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { type Layout } from 'react-grid-layout';
import { useTranslation } from 'react-i18next';
import { useBlocker, useNavigate, useParams } from 'react-router';

import DashboardFilter from '../components/DashboardFilter';
import DashboardTabs from '../components/DashboardTabs';
import PinnedParameters from '../components/PinnedParameters';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import DashboardDuplicateModal from '../components/common/modal/DashboardDuplicateModal';
import { DashboardExportModal } from '../components/common/modal/DashboardExportModal';
// import useApp from '../providers/App/useApp';
// import { useDashboardCommentsCheck } from '../features/comments';
import { DateZoom } from '../features/dateZoom';
import { Parameters } from '../features/parameters';
import {
    appendNewTilesToBottom,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import { emptyFilters } from '../hooks/dashboard/useDashboardFilters';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useContentAction } from '../hooks/useContent';
import { useSpaceSummaries } from '../hooks/useSpaces';
import DashboardProvider from '../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import useFullscreen from '../providers/Fullscreen/useFullscreen';
import '../styles/react-grid.css';

// 预设颜色调色板
const COLOR_PALETTE_PRESETS = [
    {
        name: 'echarts',
        colors: ECHARTS_DEFAULT_COLORS,
    },
    {
        name: 'default',
        colors: [
            '#5470c6',
            '#91cc75',
            '#fac858',
            '#ee6666',
            '#73c0de',
            '#3ba272',
            '#fc8452',
            '#9a60b4',
            '#ea7ccc',
            '#33ff7d',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
    },
    {
        name: 'modern',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#2D2E30',
            '#4A4B4D',
            '#6B6C6E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FFAA00',
        ],
    },
    {
        name: 'retro',
        colors: [
            '#FF6B35',
            '#ECB88A',
            '#D4A373',
            '#BC8A5F',
            '#A47148',
            '#8A5A39',
            '#6F4E37',
            '#544334',
            '#393731',
            '#2E2E2E',
            '#F4D06F',
            '#FFD700',
            '#C0BABC',
            '#A9A9A9',
            '#808080',
            '#696969',
            '#556B2F',
            '#6B8E23',
            '#8FBC8B',
            '#BDB76B',
        ],
    },
    {
        name: 'business',
        colors: [
            '#1A237E',
            '#283593',
            '#303F9F',
            '#3949AB',
            '#3F51B5',
            '#5C6BC0',
            '#7986CB',
            '#9FA8DA',
            '#C5CAE9',
            '#E8EAF6',
            '#4CAF50',
            '#66BB6A',
            '#81C784',
            '#A5D6A7',
            '#C8E6C9',
            '#FFA726',
            '#FFB74D',
            '#FFCC80',
            '#FFE0B2',
            '#FFF3E0',
        ],
    },
    {
        name: 'lightdash',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FF7A00',
            '#00FFAA',
            '#FF00AA',
            '#FFAA00',
        ],
    },
    {
        name: 'dataMatrix',
        colors: [
            '#FF00FF',
            '#00FFFF',
            '#FFFF00',
            '#FF0080',
            '#00FF00',
            '#00FF80',
            '#8000FF',
            '#FF8000',
            '#FF0088',
            '#00FF88',
            '#0088FF',
            '#88FF00',
            '#FF8800',
            '#8800FF',
            '#0088FF',
            '#FF00CC',
            '#CCFF00',
            '#00CCFF',
            '#CC00FF',
            '#FFCC00',
        ],
    },
];

const Dashboard: FC = () => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { projectUuid, dashboardUuid, mode } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
    }>();
    const { data: spaces } = useSpaceSummaries(projectUuid, true);

    const { clearIsEditingDashboardChart, clearDashboardStorage } =
        useDashboardStorage();

    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardError = useDashboardContext((c) => c.dashboardError);

    // Handle 403 Forbidden error - redirect to no permission page
    useEffect(() => {
        if (
            dashboardError?.error?.statusCode === 403 &&
            dashboardError.error.message?.includes('dashboard')
        ) {
            void navigate('/no-dashboard-access', { replace: true });
        }
    }, [dashboardError, navigate]);

    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );
    const hasRequiredDashboardFiltersToSet =
        requiredDashboardFilters.length > 0;
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);

    const haveTabsChanged = useDashboardContext((c) => c.haveTabsChanged);
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const activeTab = useDashboardContext((c) => c.activeTab);

    // filter enabled state
    const isGlobalFilterEnabled = useDashboardContext(
        (c) => c.isGlobalFilterEnabled,
    );
    const isTabFilterEnabled = useDashboardContext((c) => c.isTabFilterEnabled);
    const showGlobalAddFilterButton = useDashboardContext(
        (c) => c.showGlobalAddFilterButton,
    );
    const showTabAddFilterButton = useDashboardContext(
        (c) => c.showTabAddFilterButton,
    );
    const haveFilterEnabledStatesChanged = useDashboardContext(
        (c) => c.haveFilterEnabledStatesChanged,
    );
    const setHaveFilterEnabledStatesChanged = useDashboardContext(
        (c) => c.setHaveFilterEnabledStatesChanged,
    );
    const haveShowAddFilterButtonStatesChanged = useDashboardContext(
        (c) => c.haveShowAddFilterButtonStatesChanged,
    );
    const setHaveShowAddFilterButtonStatesChanged = useDashboardContext(
        (c) => c.setHaveShowAddFilterButtonStatesChanged,
    );

    // global filters
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );

    // tab filters
    const dashboardTabFilters = useDashboardContext((c) => c.tabFilters);
    const dashboardTabTemporaryFilters = useDashboardContext(
        (c) => c.tabTemporaryFilters,
    );
    const haveTabFiltersChanged = useDashboardContext((c) =>
        Object.values(c.haveTabFiltersChanged).some((value) => value),
    );
    const setHaveTabFiltersChanged = useDashboardContext(
        (c) => c.setHaveTabFiltersChanged,
    );
    const resetTabFilters = useDashboardContext((c) => c.resetTabFilters);
    const setTabTemporaryFilters = useDashboardContext(
        (c) => c.setTabTemporaryFilters,
    );
    const setTabFilters = useDashboardContext((c) => c.setTabFilters);

    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const areAllChartsLoaded = useDashboardContext((c) => c.areAllChartsLoaded);
    const missingRequiredParameters = useDashboardContext(
        (c) => c.missingRequiredParameters,
    );
    const refreshDashboardVersion = useDashboardContext(
        (c) => c.refreshDashboardVersion,
    );

    const isEditMode = useMemo(() => mode === 'edit', [mode]);

    // 看板颜色同步状态
    const [syncChartColors, setSyncChartColors] = useState<boolean>(
        dashboard?.config?.syncChartColors ?? false,
    );
    const [dashboardColorPalette, setDashboardColorPalette] = useState<
        string[]
    >(dashboard?.config?.colorPalette ?? ECHARTS_DEFAULT_COLORS);
    const [syncChartTileUuids, setSyncChartTileUuids] = useState<string[]>(
        dashboard?.config?.syncChartTileUuids ?? [],
    );

    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    const parametersHaveChanged = useDashboardContext(
        (c) => c.parametersHaveChanged,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const clearAllParameters = useDashboardContext((c) => c.clearAllParameters);
    const hasDateZoomDisabledChanged = useMemo(() => {
        return (
            (dashboard?.config?.isDateZoomDisabled || false) !==
            isDateZoomDisabled
        );
    }, [dashboard, isDateZoomDisabled]);
    const hasSyncChartColorsChanged = useMemo(() => {
        return (
            (dashboard?.config?.syncChartColors ?? false) !== syncChartColors
        );
    }, [dashboard, syncChartColors]);
    const hasSyncChartTileUuidsChanged = useMemo(() => {
        const savedUuids = dashboard?.config?.syncChartTileUuids ?? [];
        const currentUuids = syncChartTileUuids ?? [];
        return (
            savedUuids.length !== currentUuids.length ||
            savedUuids.some((id) => !currentUuids.includes(id)) ||
            currentUuids.some((id) => !savedUuids.includes(id))
        );
    }, [dashboard, syncChartTileUuids]);
    const hasColorPaletteChanged = useMemo(() => {
        const savedPalette = dashboard?.config?.colorPalette;
        const currentPalette = dashboardColorPalette;
        if (!savedPalette && !currentPalette) return false;
        if (!savedPalette || !currentPalette) return true;
        return savedPalette.join(',') !== currentPalette.join(',');
    }, [dashboard, dashboardColorPalette]);
    const oldestCacheTime = useDashboardContext((c) => c.oldestCacheTime);
    const dashboardParameters = useDashboardContext(
        (c) => c.dashboardParameters,
    );
    const pinnedParameters = useDashboardContext((c) => c.pinnedParameters);
    const toggleParameterPin = useDashboardContext((c) => c.toggleParameterPin);
    const havePinnedParametersChanged = useDashboardContext(
        (c) => c.havePinnedParametersChanged,
    );
    const setHavePinnedParametersChanged = useDashboardContext(
        (c) => c.setHavePinnedParametersChanged,
    );
    const setPinnedParameters = useDashboardContext(
        (c) => c.setPinnedParameters,
    );

    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    const parameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );

    const referencedParameters = useMemo(() => {
        return Object.fromEntries(
            Object.entries(parameterDefinitions).filter(([key]) =>
                parameterReferences.has(key),
            ),
        );
    }, [parameterDefinitions, parameterReferences]);

    const {
        enabled: isFullScreenFeatureEnabled,
        isFullscreen,
        toggleFullscreen,
    } = useFullscreen();
    const { showToastError } = useToaster();

    const { data: organization } = useOrganization();
    const hasTemporaryFilters = useMemo(
        () =>
            dashboardTemporaryFilters.dimensions.length > 0 ||
            dashboardTemporaryFilters.metrics.length > 0,
        [dashboardTemporaryFilters],
    );
    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(dashboardUuid);

    const { mutateAsync: contentAction, isLoading: isContentActionLoading } =
        useContentAction(projectUuid);

    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isDuplicateModalOpen, duplicateModalHandlers] = useDisclosure();
    const [isExportDashboardModalOpen, exportDashboardModalHandlers] =
        useDisclosure();

    // tabs state
    const [addingTab, setAddingTab] = useState<boolean>(false);

    const hasDashboardTiles = dashboardTiles && dashboardTiles.length > 0;

    // 获取图表类型的 tiles（用于颜色同步选择）
    const chartTiles = useMemo(() => {
        if (!dashboardTiles) return [];
        return dashboardTiles.filter(
            (
                tile,
            ): tile is DashboardTile & {
                type:
                    | DashboardTileTypes.SAVED_CHART
                    | DashboardTileTypes.SQL_CHART;
            } => {
                if (
                    tile.type !== DashboardTileTypes.SAVED_CHART &&
                    tile.type !== DashboardTileTypes.SQL_CHART
                ) {
                    return false;
                }
                const name = (
                    tile.properties.title ||
                    tile.properties.chartName ||
                    ''
                ).trim();
                return name.length > 0;
            },
        );
    }, [dashboardTiles]);

    const tabNameMap = useMemo(() => {
        if (!dashboardTabs) return new Map<string, string>();
        return new Map(dashboardTabs.map((tab) => [tab.uuid, tab.name]));
    }, [dashboardTabs]);

    // 按 tab 分组图表 tiles，保持 tab 顺序
    const chartTilesByTab = useMemo(() => {
        const groups: Array<{
            tabUuid: string | undefined;
            tabName: string | undefined;
            tiles: typeof chartTiles;
        }> = [];
        const tabOrder = dashboardTabs?.map((tab) => tab.uuid) ?? [];
        const grouped = new Map<string | undefined, typeof chartTiles>();
        for (const tile of chartTiles) {
            const key = tile.tabUuid || undefined;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(tile);
        }
        // 按 tab 顺序排列
        for (const tabUuid of tabOrder) {
            const tiles = grouped.get(tabUuid);
            if (tiles) {
                groups.push({
                    tabUuid,
                    tabName: tabNameMap.get(tabUuid),
                    tiles,
                });
                grouped.delete(tabUuid);
            }
        }
        // 无 tab 的放最后
        const noTab = grouped.get(undefined);
        if (noTab) {
            groups.push({
                tabUuid: undefined,
                tabName: undefined,
                tiles: noTab,
            });
        }
        return groups;
    }, [chartTiles, dashboardTabs, tabNameMap]);

    const tabsEnabled = dashboardTabs && dashboardTabs.length > 0;

    const defaultTab = dashboardTabs?.[0];

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(dashboard?.tiles ?? []);
        setDashboardTabs(dashboard?.tabs ?? []);
        setSavedParameters(dashboard?.parameters ?? {});
    }, [
        isDashboardLoading,
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTabs,
        setSavedParameters,
    ]);

    // 同步 syncChartColors 状态
    useEffect(() => {
        if (isDashboardLoading) return;
        if (!isEditMode) return;

        setSyncChartColors(dashboard?.config?.syncChartColors ?? false);
    }, [isDashboardLoading, isEditMode, dashboard?.config?.syncChartColors]);

    // 同步 colorPalette 状态
    useEffect(() => {
        if (isDashboardLoading) return;

        // 编辑模式和查看模式都需要同步 colorPalette
        setDashboardColorPalette(
            dashboard?.config?.colorPalette ??
                organization?.chartColors ??
                ECHARTS_DEFAULT_COLORS,
        );
    }, [
        isDashboardLoading,
        dashboard?.config?.colorPalette,
        organization?.chartColors,
    ]);

    // 同步 syncChartTileUuids 状态
    useEffect(() => {
        if (isDashboardLoading) return;
        if (!isEditMode) return;

        setSyncChartTileUuids(dashboard?.config?.syncChartTileUuids ?? []);
    }, [isDashboardLoading, isEditMode, dashboard?.config?.syncChartTileUuids]);

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles === undefined) return;

        clearIsEditingDashboardChart();

        const unsavedDashboardTilesRaw = sessionStorage.getItem(
            'unsavedDashboardTiles',
        );
        if (unsavedDashboardTilesRaw) {
            sessionStorage.removeItem('unsavedDashboardTiles');

            try {
                const unsavedDashboardTiles = JSON.parse(
                    unsavedDashboardTilesRaw,
                );
                // If there are unsaved tiles, add them to the dashboard
                setDashboardTiles(unsavedDashboardTiles);

                setHaveTilesChanged(!!unsavedDashboardTiles);
            } catch {
                showToastError({
                    title: t('pages_dashboard.toast_chart_error.title'),
                    subtitle: t('pages_dashboard.toast_chart_error.subtitle'),
                });
                captureException(
                    `Error parsing chart in dashboard. Attempted to parse: ${unsavedDashboardTilesRaw} `,
                );
            }
        }

        const unsavedDashboardTabsRaw = sessionStorage.getItem('dashboardTabs');

        sessionStorage.removeItem('dashboardTabs');

        if (unsavedDashboardTabsRaw) {
            try {
                const unsavedDashboardTabs = JSON.parse(
                    unsavedDashboardTabsRaw,
                );
                setDashboardTabs(unsavedDashboardTabs);
                setHaveTabsChanged(!!unsavedDashboardTabs);
            } catch {
                showToastError({
                    title: t('pages_dashboard.toast_tabs_error.title'),
                    subtitle: t('pages_dashboard.toast_tabs_error.subtitle'),
                });
                captureException(
                    `Error parsing tabs in dashboard. Attempted to parse: ${unsavedDashboardTabsRaw} `,
                );
            }
        }
    }, [
        isDashboardLoading,
        dashboardTiles,
        activeTab,
        setHaveTilesChanged,
        setDashboardTiles,
        setDashboardTabs,
        setHaveTabsChanged,
        clearIsEditingDashboardChart,
        showToastError,
        t,
    ]);

    const [gridWidth, setGridWidth] = useState(0);

    useEffect(() => {
        if (isSuccess) {
            if (dashboardTabs.length > 1) {
                void navigate(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${activeTab?.uuid}`,
                    { replace: true },
                );
            } else {
                void navigate(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
                    { replace: true },
                );
            }
        }
    }, [
        dashboardUuid,
        navigate,
        isSuccess,
        projectUuid,
        dashboardTabs,
        activeTab,
    ]);

    // 监听路由模式变化，当切换到 view 模式后重置状态
    useEffect(() => {
        if (isSuccess && mode === 'view') {
            setHaveTilesChanged(false);
            setHaveFiltersChanged(false);
            setHaveTabFiltersChanged({});
            setHaveFilterEnabledStatesChanged(false);
            setHaveShowAddFilterButtonStatesChanged(false);
            setDashboardTemporaryFilters({
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            });
            setTabTemporaryFilters({});
            reset();
        }
    }, [
        isSuccess,
        mode,
        reset,
        setHaveFiltersChanged,
        setHaveTilesChanged,
        setHaveTabFiltersChanged,
        setHaveFilterEnabledStatesChanged,
        setHaveShowAddFilterButtonStatesChanged,
        setTabTemporaryFilters,
        setHavePinnedParametersChanged,
        setDashboardTemporaryFilters,
        dashboardTabs,
        activeTab,
    ]);

    const handleToggleFullscreen = useCallback(async () => {
        if (!isFullScreenFeatureEnabled) return;

        const willBeFullscreen = !isFullscreen;

        if (document.fullscreenElement && !willBeFullscreen) {
            await document.exitFullscreen();
        } else if (
            document.fullscreenEnabled &&
            !document.fullscreenElement &&
            willBeFullscreen
        ) {
            await document.documentElement.requestFullscreen();
        }

        toggleFullscreen();
    }, [isFullScreenFeatureEnabled, isFullscreen, toggleFullscreen]);

    useEffect(() => {
        if (!isFullScreenFeatureEnabled) return;

        const onFullscreenChange = () => {
            if (isFullscreen && !document.fullscreenElement) {
                toggleFullscreen(false);
            } else if (!isFullscreen && document.fullscreenElement) {
                toggleFullscreen(true);
            }
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);

        return () =>
            document.removeEventListener(
                'fullscreenchange',
                onFullscreenChange,
            );
    });

    const handleParameterChange = useDashboardContext((c) => c.setParameter);

    const handleUpdateTiles = useCallback(
        async (layout: Layout[]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.map((tile) => {
                    const layoutTile = layout.find(({ i }) => i === tile.uuid);
                    if (
                        layoutTile &&
                        (tile.x !== layoutTile.x ||
                            tile.y !== layoutTile.y ||
                            tile.h !== layoutTile.h ||
                            tile.w !== layoutTile.w)
                    ) {
                        return {
                            ...tile,
                            x: layoutTile.x,
                            y: layoutTile.y,
                            h: layoutTile.h,
                            w: layoutTile.w,
                        };
                    }
                    return tile;
                }),
            );

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleAddTiles = useCallback(
        async (tiles: IDashboard['tiles'][number][]) => {
            let newTiles = tiles;
            if (tabsEnabled) {
                newTiles = tiles.map((tile: DashboardTile) => ({
                    ...tile,
                    tabUuid: activeTab ? activeTab.uuid : defaultTab?.uuid,
                }));
                setHaveTabsChanged(true);
            }
            setDashboardTiles((currentDashboardTiles) =>
                appendNewTilesToBottom(currentDashboardTiles, newTiles),
            );

            setHaveTilesChanged(true);
        },
        [
            activeTab,
            defaultTab,
            tabsEnabled,
            setDashboardTiles,
            setHaveTilesChanged,
            setHaveTabsChanged,
        ],
    );

    const handleDeleteTile = useCallback(
        async (tile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.filter(
                    (filteredTile) => filteredTile.uuid !== tile.uuid,
                ),
            );

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleBatchDeleteTiles = (
        tilesToDelete: IDashboard['tiles'][number][],
    ) => {
        setDashboardTiles((currentDashboardTiles) =>
            currentDashboardTiles?.filter(
                (tile) => !tilesToDelete.includes(tile),
            ),
        );
        setHaveTilesChanged(true);
    };

    const handleEditTiles = useCallback(
        (updatedTile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.map((tile) =>
                    tile.uuid === updatedTile.uuid ? updatedTile : tile,
                ),
            );
            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleCancel = useCallback(() => {
        if (!dashboard) return;

        sessionStorage.clear();

        setDashboardTiles(dashboard.tiles);
        setHaveTilesChanged(false);
        setHaveTabsChanged(false);
        setDashboardTabs(dashboard.tabs);
        setSavedParameters(dashboard.parameters ?? {});
        setPinnedParameters(dashboard.config?.pinnedParameters ?? []);
        setHavePinnedParametersChanged(false);
        setDashboardFilters(dashboard.filters);
        setHaveFiltersChanged(false);
        setHaveTabFiltersChanged({});
        setHaveFilterEnabledStatesChanged(false);
        setHaveShowAddFilterButtonStatesChanged(false);

        if (dashboardTabs.length > 0) {
            void navigate(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${activeTab?.uuid}`,
                { replace: true },
            );
        } else {
            void navigate(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
                { replace: true },
            );
        }

        setTimeout(() => {
            setTabFilters(
                dashboard.tabs.reduce((acc, tab) => {
                    acc[tab.uuid] = tab.filters || emptyFilters;
                    return acc;
                }, {} as Record<string, DashboardFilters>),
            );
        }, 100);
    }, [
        dashboard,
        dashboardUuid,
        navigate,
        projectUuid,
        setDashboardTiles,
        setHaveFiltersChanged,
        setDashboardFilters,
        setTabFilters,
        setHaveTilesChanged,
        setHaveTabsChanged,
        setDashboardTabs,
        dashboardTabs,
        activeTab,
        setSavedParameters,
        setPinnedParameters,
        setHaveTabFiltersChanged,
        setHavePinnedParametersChanged,
        setHaveFilterEnabledStatesChanged,
        setHaveShowAddFilterButtonStatesChanged,
    ]);

    const handleMoveDashboardToSpace = useCallback(
        async (spaceUuid: string) => {
            if (!dashboard) return;

            await contentAction({
                action: {
                    type: 'move',
                    targetSpaceUuid: spaceUuid,
                },
                item: {
                    uuid: dashboard.uuid,
                    contentType: ContentType.DASHBOARD,
                },
            });
        },
        [dashboard, contentAction],
    );

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (
                isEditMode &&
                (haveTilesChanged ||
                    haveFiltersChanged ||
                    haveTabFiltersChanged ||
                    haveFilterEnabledStatesChanged ||
                    haveShowAddFilterButtonStatesChanged)
            ) {
                const message = t('pages_dashboard.reload_message');
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => window.removeEventListener('beforeunload', checkReload);
    }, [
        haveTilesChanged,
        haveFiltersChanged,
        haveTabFiltersChanged,
        haveFilterEnabledStatesChanged,
        haveShowAddFilterButtonStatesChanged,
        isEditMode,
        t,
    ]);

    // Block navigating away if there are unsaved changes
    const blocker = useBlocker(({ nextLocation }) => {
        if (
            isEditMode &&
            (haveTilesChanged ||
                haveFiltersChanged ||
                haveTabsChanged ||
                haveTabFiltersChanged ||
                haveFilterEnabledStatesChanged ||
                haveShowAddFilterButtonStatesChanged) &&
            !nextLocation.pathname.includes(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
            ) &&
            // Allow user to add a new table
            !sessionStorage.getItem('unsavedDashboardTiles')
        ) {
            return true; //blocks navigation
        }
        return false; // allow navigation
    });

    const handleEnterEditMode = useCallback(async () => {
        resetDashboardFilters();
        resetTabFilters(activeTab?.uuid || '');

        await refreshDashboardVersion();

        // Defer the redirect
        void Promise.resolve().then(() => {
            return navigate(
                {
                    pathname:
                        dashboardTabs.length > 0
                            ? `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit/tabs/${activeTab?.uuid}`
                            : `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
                    search: '',
                },
                { replace: true },
            );
        });
    }, [
        projectUuid,
        dashboardUuid,
        resetDashboardFilters,
        resetTabFilters,
        refreshDashboardVersion,
        navigate,
        activeTab?.uuid,
        dashboardTabs.length,
    ]);

    const hasTilesThatSupportFilters = useDashboardContext(
        (c) => c.hasTilesThatSupportFilters,
    );

    if (dashboardError) {
        return t('pages_dashboard.loading');
    }
    if (dashboard === undefined) {
        return (
            <Box mt="md">
                <SuboptimalState title={t('pages_dashboard.loading')} loading />
            </Box>
        );
    }

    const formatRequiredFilters = (filters: DashboardFilterRule[]) => {
        return filters.map((filter) => {
            if (filter.required) {
                return {
                    ...filter,
                    disabled: true,
                    values: [],
                };
            }
            return filter;
        });
    };

    const getTabsConfig = () => {
        return dashboardTabs.map((tab) => {
            const tabFilters = dashboardTabFilters[tab.uuid] || emptyFilters;
            const tabTemporaryFilters =
                dashboardTabTemporaryFilters[tab.uuid] || emptyFilters;

            const dimensionFilters = [
                ...tabFilters.dimensions,
                ...tabTemporaryFilters.dimensions,
            ];
            const requiredFiltersWithoutValues =
                formatRequiredFilters(dimensionFilters);

            return {
                ...tab,
                filters: {
                    dimensions: requiredFiltersWithoutValues,
                    metrics: [
                        ...tabFilters.metrics,
                        ...tabTemporaryFilters.metrics,
                    ],
                    tableCalculations: [
                        ...tabFilters.tableCalculations,
                        ...tabTemporaryFilters.tableCalculations,
                    ],
                },
            };
        });
    };

    const hasSaveDashboardChanged = () => {
        // global filter
        const dimensionFilters = [
            ...dashboardFilters.dimensions,
            ...dashboardTemporaryFilters.dimensions,
        ];

        // Reset value for required filter on save dashboard
        const requiredFiltersWithoutValues = dimensionFilters.map((filter) => {
            if (filter.required) {
                return {
                    ...filter,
                    disabled: true,
                    values: [],
                };
            }
            return filter;
        });

        // tabs config
        const tabsConfig = getTabsConfig();

        mutate({
            tiles: dashboardTiles || [],
            filters: {
                dimensions: requiredFiltersWithoutValues,
                metrics: [
                    ...dashboardFilters.metrics,
                    ...dashboardTemporaryFilters.metrics,
                ],
                tableCalculations: [
                    ...dashboardFilters.tableCalculations,
                    ...dashboardTemporaryFilters.tableCalculations,
                ],
            },
            name: dashboard.name,
            tabs: tabsConfig,
            config: {
                isDateZoomDisabled,
                ...(isGlobalFilterEnabled !== undefined && {
                    isGlobalFilterEnabled,
                }),
                ...(Object.keys(isTabFilterEnabled).length > 0 && {
                    tabFilterEnabled: isTabFilterEnabled,
                }),
                ...(showGlobalAddFilterButton !== undefined && {
                    showGlobalAddFilterButton,
                }),
                ...(Object.keys(showTabAddFilterButton).length > 0 && {
                    showTabAddFilterButton,
                }),
                syncChartColors,
                ...(syncChartColors &&
                    dashboardColorPalette && {
                        colorPalette: dashboardColorPalette,
                    }),
                ...(syncChartColors &&
                    syncChartTileUuids.length > 0 && {
                        syncChartTileUuids,
                    }),
            },
            parameters: dashboardParameters,
        });
    };

    return (
        <>
            {blocker.state === 'blocked' && (
                <Modal
                    opened
                    onClose={() => {
                        blocker.reset();
                    }}
                    title={null}
                    withCloseButton={false}
                    closeOnClickOutside={false}
                >
                    <Stack>
                        <Group wrap="nowrap" gap="xs">
                            <MantineIcon
                                icon={IconAlertCircle}
                                color="red"
                                size={50}
                            />
                            <Text fw={500}>
                                {t('pages_dashboard.modal.content')}
                            </Text>
                        </Group>

                        <Group justify="flex-end">
                            <Button
                                onClick={() => {
                                    blocker.reset();
                                }}
                            >
                                {t('pages_dashboard.modal.stay')}
                            </Button>
                            <Button
                                color="red"
                                onClick={() => {
                                    clearDashboardStorage();
                                    blocker.proceed();
                                }}
                            >
                                {t('pages_dashboard.modal.leave')}
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            )}

            <Page
                title={dashboard.name}
                header={
                    <DashboardHeader
                        spaces={spaces}
                        dashboard={dashboard}
                        organizationUuid={organization?.organizationUuid}
                        isEditMode={isEditMode}
                        isSaving={isSaving}
                        oldestCacheTime={oldestCacheTime}
                        isFullscreen={isFullscreen}
                        activeTabUuid={activeTab?.uuid}
                        dashboardTabs={dashboardTabs}
                        isFullScreenFeatureEnabled={isFullScreenFeatureEnabled}
                        onToggleFullscreen={handleToggleFullscreen}
                        hasDashboardChanged={
                            haveTilesChanged ||
                            haveFiltersChanged ||
                            hasTemporaryFilters ||
                            haveTabsChanged ||
                            haveTabFiltersChanged ||
                            hasDateZoomDisabledChanged ||
                            hasSyncChartColorsChanged ||
                            hasSyncChartTileUuidsChanged ||
                            hasColorPaletteChanged ||
                            parametersHaveChanged ||
                            havePinnedParametersChanged ||
                            haveFilterEnabledStatesChanged ||
                            haveShowAddFilterButtonStatesChanged
                        }
                        onAddTiles={handleAddTiles}
                        onSaveDashboard={hasSaveDashboardChanged}
                        onCancel={handleCancel}
                        onMoveToSpace={handleMoveDashboardToSpace}
                        isMovingDashboardToSpace={isContentActionLoading}
                        onDuplicate={duplicateModalHandlers.open}
                        onDelete={deleteModalHandlers.open}
                        onExport={exportDashboardModalHandlers.open}
                        setAddingTab={setAddingTab}
                        onEditClicked={handleEnterEditMode}
                    />
                }
                withFullHeight={true}
            >
                <Group
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                    px={'lg'}
                >
                    {/* This Group will take up remaining space (and not push DateZoom) */}
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                        grow
                        style={{
                            overflow: 'auto',
                        }}
                    >
                        {hasTilesThatSupportFilters && (
                            <DashboardFilter
                                isEditMode={isEditMode}
                                activeTabUuid={activeTab?.uuid}
                                filterScope="global"
                            />
                        )}
                    </Group>
                    {/* DateZoom section will adjust width dynamically */}
                    {hasDashboardTiles && isEditMode && (
                        <Group gap="xs" style={{ marginLeft: 'auto' }}>
                            <Switch
                                label={t(
                                    'features_date_zoom.sync_chart_colors',
                                    'Sync chart colors',
                                )}
                                checked={syncChartColors}
                                onChange={(e) =>
                                    setSyncChartColors(e.currentTarget.checked)
                                }
                            />
                            {syncChartColors && isEditMode && (
                                <Popover width={300} position="bottom">
                                    <Popover.Target>
                                        <Button size="xs" variant="outline">
                                            {t(
                                                'dashboard.color_palette',
                                                'Colors',
                                            )}
                                        </Button>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        <Text size="sm" fw={500} mb="xs">
                                            {t(
                                                'dashboard.select_color_palette',
                                                'Select color palette',
                                            )}
                                        </Text>
                                        <Stack>
                                            {COLOR_PALETTE_PRESETS.map(
                                                (preset) => {
                                                    const isSelected =
                                                        dashboardColorPalette &&
                                                        dashboardColorPalette.join(
                                                            ',',
                                                        ) ===
                                                            preset.colors.join(
                                                                ',',
                                                            );
                                                    return (
                                                        <Button
                                                            key={preset.name}
                                                            size="xs"
                                                            variant={
                                                                isSelected
                                                                    ? 'filled'
                                                                    : 'outline'
                                                            }
                                                            onClick={() =>
                                                                setDashboardColorPalette(
                                                                    preset.colors,
                                                                )
                                                            }
                                                        >
                                                            <Group
                                                                gap={4}
                                                                wrap="nowrap"
                                                            >
                                                                <Text
                                                                    size="xs"
                                                                    mr="xs"
                                                                >
                                                                    {t(
                                                                        `dashboard.palettes.${preset.name}`,
                                                                        preset.name,
                                                                    )}
                                                                </Text>
                                                                {preset.colors
                                                                    .slice(
                                                                        0,
                                                                        10,
                                                                    )
                                                                    .map(
                                                                        (
                                                                            color,
                                                                            idx,
                                                                        ) => (
                                                                            <Box
                                                                                key={
                                                                                    idx
                                                                                }
                                                                                w={
                                                                                    10
                                                                                }
                                                                                h={
                                                                                    10
                                                                                }
                                                                                bg={
                                                                                    color
                                                                                }
                                                                                style={{
                                                                                    borderRadius: 2,
                                                                                }}
                                                                            />
                                                                        ),
                                                                    )}
                                                            </Group>
                                                        </Button>
                                                    );
                                                },
                                            )}
                                        </Stack>
                                    </Popover.Dropdown>
                                </Popover>
                            )}
                            {syncChartColors &&
                                isEditMode &&
                                chartTiles.length > 0 && (
                                    <Popover width={400} position="bottom">
                                        <Popover.Target>
                                            <Button size="xs" variant="outline">
                                                {t(
                                                    'dashboard.select_charts',
                                                    'Select charts',
                                                )}
                                            </Button>
                                        </Popover.Target>
                                        <Popover.Dropdown>
                                            <Text size="sm" fw={500} mb="xs">
                                                {t(
                                                    'dashboard.sync_chart_colors_for',
                                                    'Sync chart colors for:',
                                                )}
                                            </Text>
                                            <ScrollArea.Autosize mah={400}>
                                                <Stack>
                                                    {chartTilesByTab.map(
                                                        (group, groupIdx) => (
                                                            <Box
                                                                key={
                                                                    group.tabUuid ??
                                                                    'no-tab'
                                                                }
                                                            >
                                                                {chartTilesByTab.length >
                                                                    1 && (
                                                                    <Divider
                                                                        label={
                                                                            group.tabName ??
                                                                            t(
                                                                                'dashboard.no_tab',
                                                                                'No tab',
                                                                            )
                                                                        }
                                                                        labelPosition="left"
                                                                        mt={
                                                                            groupIdx >
                                                                            0
                                                                                ? 'xs'
                                                                                : 0
                                                                        }
                                                                        mb="xs"
                                                                    />
                                                                )}
                                                                <Stack gap="xs">
                                                                    {group.tiles.map(
                                                                        (
                                                                            tile,
                                                                        ) => {
                                                                            const chartName =
                                                                                tile
                                                                                    .properties
                                                                                    .title ||
                                                                                tile
                                                                                    .properties
                                                                                    .chartName ||
                                                                                'Untitled chart';
                                                                            const isSelected =
                                                                                syncChartTileUuids.includes(
                                                                                    tile.uuid,
                                                                                );
                                                                            return (
                                                                                <Switch
                                                                                    key={
                                                                                        tile.uuid
                                                                                    }
                                                                                    label={
                                                                                        chartName
                                                                                    }
                                                                                    checked={
                                                                                        isSelected
                                                                                    }
                                                                                    onChange={(
                                                                                        e,
                                                                                    ) => {
                                                                                        const checked =
                                                                                            e
                                                                                                .currentTarget
                                                                                                .checked;
                                                                                        if (
                                                                                            checked
                                                                                        ) {
                                                                                            setSyncChartTileUuids(
                                                                                                [
                                                                                                    ...syncChartTileUuids,
                                                                                                    tile.uuid,
                                                                                                ],
                                                                                            );
                                                                                        } else {
                                                                                            setSyncChartTileUuids(
                                                                                                syncChartTileUuids.filter(
                                                                                                    (
                                                                                                        uuid,
                                                                                                    ) =>
                                                                                                        uuid !==
                                                                                                        tile.uuid,
                                                                                                ),
                                                                                            );
                                                                                        }
                                                                                    }}
                                                                                />
                                                                            );
                                                                        },
                                                                    )}
                                                                </Stack>
                                                            </Box>
                                                        ),
                                                    )}
                                                </Stack>
                                            </ScrollArea.Autosize>
                                            {syncChartTileUuids.length > 0 && (
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    mt="xs"
                                                    onClick={() =>
                                                        setSyncChartTileUuids(
                                                            [],
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'dashboard.clear_all',
                                                        'Clear all',
                                                    )}
                                                </Button>
                                            )}
                                        </Popover.Dropdown>
                                    </Popover>
                                )}
                            <Group ml="md">
                                <DateZoom isEditMode={isEditMode} />
                            </Group>
                        </Group>
                    )}
                </Group>
                {hasDashboardTiles && (
                    <Group gap="xs" align="flex-start" wrap="nowrap" px={'lg'}>
                        <Parameters
                            isEditMode={isEditMode}
                            parameterValues={parameterValues}
                            onParameterChange={handleParameterChange}
                            onClearAll={clearAllParameters}
                            parameters={referencedParameters}
                            isLoading={!areAllChartsLoaded}
                            missingRequiredParameters={
                                missingRequiredParameters
                            }
                            pinnedParameters={pinnedParameters}
                            onParameterPin={toggleParameterPin}
                        />
                        <PinnedParameters isEditMode={isEditMode} />
                    </Group>
                )}
                <Flex style={{ flexGrow: 1, flexDirection: 'column' }}>
                    <DashboardTabs
                        isEditMode={isEditMode}
                        hasTilesThatSupportFilters={hasTilesThatSupportFilters}
                        hasRequiredDashboardFiltersToSet={
                            hasRequiredDashboardFiltersToSet
                        }
                        addingTab={addingTab}
                        dashboardTiles={dashboardTiles}
                        handleAddTiles={handleAddTiles}
                        handleUpdateTiles={handleUpdateTiles}
                        handleDeleteTile={handleDeleteTile}
                        handleBatchDeleteTiles={handleBatchDeleteTiles}
                        handleEditTile={handleEditTiles}
                        setGridWidth={setGridWidth}
                        activeTab={activeTab}
                        setAddingTab={setAddingTab}
                    />
                </Flex>
                {isDeleteModalOpen && (
                    <DashboardDeleteModal
                        opened
                        uuid={dashboard.uuid}
                        onClose={deleteModalHandlers.close}
                        onConfirm={() => {
                            void navigate(
                                `/projects/${projectUuid}/dashboards`,
                                {
                                    replace: true,
                                },
                            );
                        }}
                    />
                )}
                {isExportDashboardModalOpen && (
                    <DashboardExportModal
                        opened={isExportDashboardModalOpen}
                        onClose={exportDashboardModalHandlers.close}
                        dashboard={dashboard}
                        gridWidth={gridWidth}
                    />
                )}
                {isDuplicateModalOpen && (
                    <DashboardDuplicateModal
                        opened={isDuplicateModalOpen}
                        uuid={dashboard.uuid}
                        onClose={duplicateModalHandlers.close}
                        onConfirm={duplicateModalHandlers.close}
                    />
                )}
            </Page>
        </>
    );
};

const DashboardPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    // const { user } = useApp();
    // const dashboardCommentsCheck = useDashboardCommentsCheck(user?.data);

    useProfiler('Dashboard');

    return (
        <DashboardProvider
            projectUuid={projectUuid}
            // TODO: hide comments feature for now, need to enable it later
            dashboardCommentsCheck={{
                canViewDashboardComments: false,
                canCreateDashboardComments: false,
            }}
        >
            <Dashboard />
        </DashboardProvider>
    );
};

export default DashboardPage;

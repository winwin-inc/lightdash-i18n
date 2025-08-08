import {
    DashboardTileTypes,
    DateGranularity,
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    getItemId,
    isDashboardChartTileType,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardFiltersFromSearchParam,
    type FilterableDimension,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SchedulerFilterRule,
    type SortField,
} from '@lightdash/common';
import min from 'lodash/min';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDeepCompareEffect, useMount } from 'react-use';
import { getConditionalRuleLabelFromItem } from '../../components/common/Filters/FilterInputs/utils';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
} from '../../hooks/dashboard/useDashboard';
import useDashboardFilter, {
    emptyFilters,
} from '../../hooks/dashboard/useDashboardFilters';
import useDashboardFilterForTab, {
    isEmptyTabFilters,
} from '../../hooks/dashboard/useDashboardTabFilters';
import {
    hasSavedFiltersOverrides,
    useSavedDashboardFiltersOverrides,
} from '../../hooks/useSavedDashboardFiltersOverrides';
import DashboardContext from './context';
import { type SqlChartTileMetadata } from './types';

const DashboardProvider: React.FC<
    React.PropsWithChildren<{
        schedulerFilters?: SchedulerFilterRule[] | undefined;
        dateZoom?: DateGranularity | undefined;
        projectUuid?: string;
        embedToken?: string;
        dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
        defaultInvalidateCache?: boolean;
    }>
> = ({
    schedulerFilters,
    dateZoom,
    projectUuid,
    embedToken,
    dashboardCommentsCheck,
    defaultInvalidateCache,
    children,
}) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();

    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>() as {
        dashboardUuid: string;
    };

    const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

    // Embedded dashboards will not be using this query hook to load the dashboard,
    // so we need to set the dashboard manually
    const [embedDashboard, setEmbedDashboard] = useState<Dashboard>();
    const {
        data: dashboard,
        isInitialLoading: isDashboardLoading,
        error: dashboardError,
    } = useDashboardQuery(dashboardUuid, {
        select: (d) => {
            if (schedulerFilters) {
                const overriddenDimensions = applyDimensionOverrides(
                    d.filters,
                    schedulerFilters,
                );

                return {
                    ...d,
                    filters: {
                        ...d.filters,
                        dimensions: overriddenDimensions,
                    },
                };
            }
            return d;
        },
    });

    const { data: dashboardComments } = useGetComments(
        dashboardUuid,
        !!dashboardCommentsCheck &&
            !!dashboardCommentsCheck.canViewDashboardComments,
    );
    const hasTileComments = useCallback(
        (tileUuid: string) =>
            !!(
                dashboardComments &&
                dashboardComments[tileUuid] &&
                dashboardComments[tileUuid].length > 0
            ),
        [dashboardComments],
    );

    const [dashboardTiles, setDashboardTiles] = useState<Dashboard['tiles']>();
    const [haveTilesChanged, setHaveTilesChanged] = useState<boolean>(false);
    const [haveTabsChanged, setHaveTabsChanged] = useState<boolean>(false);
    const [dashboardTabs, setDashboardTabs] = useState<Dashboard['tabs']>([]);

    // filter enabled states - initialize from dashboard config
    const [isGlobalFilterEnabled, setIsGlobalFilterEnabled] =
        useState<boolean>(true);
    const [isTabFilterEnabled, setIsTabFilterEnabled] = useState<
        Record<string, boolean>
    >({});

    // Initialize filter enabled states from dashboard config when dashboard loads
    useEffect(() => {
        if (dashboard?.config) {
            setIsGlobalFilterEnabled(
                (dashboard.config as any).isGlobalFilterEnabled ?? true,
            );
            setIsTabFilterEnabled(
                (dashboard.config as any).tabFilterEnabled ?? {},
            );
        }
    }, [dashboard?.config]);

    // Track filter enabled state changes
    const [haveFilterEnabledStatesChanged, setHaveFilterEnabledStatesChanged] =
        useState<boolean>(false);

    // Check if filter enabled states have changed from dashboard config
    useEffect(() => {
        if (dashboard?.config) {
            const hasGlobalFilterEnabledChanged =
                (dashboard.config as any).isGlobalFilterEnabled !==
                isGlobalFilterEnabled;
            const hasTabFilterEnabledChanged =
                JSON.stringify(
                    (dashboard.config as any).tabFilterEnabled || {},
                ) !== JSON.stringify(isTabFilterEnabled);

            setHaveFilterEnabledStatesChanged(
                hasGlobalFilterEnabledChanged || hasTabFilterEnabledChanged,
            );
        }
    }, [dashboard?.config, isGlobalFilterEnabled, isTabFilterEnabled]);

    const { overridesForSavedDashboardFilters } =
        useSavedDashboardFiltersOverrides();

    // dashboard filter
    const {
        allFilters,
        dashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        setOriginalDashboardFilters,
        dashboardTemporaryFilters,
        setDashboardTemporaryFilters,
        resetDashboardFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        addMetricDashboardFilter,
        removeDimensionDashboardFilter,
    } = useDashboardFilter({
        dashboard,
        isFilterEnabled: isGlobalFilterEnabled,
    });

    // dashboard tab filter
    const {
        tabFilters,
        setTabFilters,
        tabTemporaryFilters,
        setTabTemporaryFilters,
        haveTabFiltersChanged,
        setHaveTabFiltersChanged,

        getActiveTabFilters,
        getActiveTabTemporaryFilters,
        getMergedFiltersForTab,

        addTabDimensionFilter,
        updateTabDimensionFilter,
        removeTabDimensionFilter,
        resetTabFilters,
    } = useDashboardFilterForTab({
        dashboard,
        allFilters,
        isFilterEnabled: (tabUuid: string) =>
            isTabFilterEnabled[tabUuid] ?? true,
    });

    const [resultsCacheTimes, setResultsCacheTimes] = useState<Date[]>([]);
    const [invalidateCache, setInvalidateCache] = useState<boolean>(
        defaultInvalidateCache === true,
    );

    const [chartSort, setChartSort] = useState<Record<string, SortField[]>>({});

    const [sqlChartTilesMetadata, setSqlChartTilesMetadata] = useState<
        Record<string, SqlChartTileMetadata>
    >({});

    const [dateZoomGranularity, setDateZoomGranularity] = useState<
        DateGranularity | undefined
    >(dateZoom);

    // Allows users to disable date zoom on view mode,
    // by default it is enabled
    const [isDateZoomDisabled, setIsDateZoomDisabled] =
        useState<boolean>(false);
    useEffect(() => {
        if (dashboard?.config?.isDateZoomDisabled === true) {
            setIsDateZoomDisabled(true);
        }
    }, [dashboard]);

    const [parameters, setParameters] = useState<
        Record<string, string | string[]>
    >({});

    const setParameter = useCallback(
        (key: string, value: string | string[] | null) => {
            if (value === null) {
                setParameters((prev) => {
                    const newParams = { ...prev };
                    delete newParams[key];
                    return newParams;
                });
            } else {
                setParameters((prev) => ({
                    ...prev,
                    [key]: value,
                }));
            }
        },
        [],
    );

    // Track parameter references from each tile
    const [tileParameterReferences, setTileParameterReferences] = useState<
        Record<string, string[]>
    >({});

    // Track which tiles have loaded (to know when all are complete)
    const [loadedTiles, setLoadedTiles] = useState<Set<string>>(new Set());

    const addParameterReferences = useCallback(
        (tileUuid: string, references: string[]) => {
            setTileParameterReferences((prev) => ({
                ...prev,
                [tileUuid]: references,
            }));
            setLoadedTiles((prev) => new Set(prev).add(tileUuid));
        },
        [],
    );

    // Calculate aggregated parameter references from all tiles
    const dashboardParameterReferences = useMemo(() => {
        const allReferences = Object.values(tileParameterReferences).flat();
        return new Set(allReferences);
    }, [tileParameterReferences]);

    // Determine if all chart tiles have loaded their parameter references
    const areAllChartsLoaded = useMemo(() => {
        if (!dashboardTiles) return false;

        const chartTileUuids = dashboardTiles
            .filter(isDashboardChartTileType)
            .map((tile) => tile.uuid);

        return chartTileUuids.every((tileUuid) => loadedTiles.has(tileUuid));
    }, [dashboardTiles, loadedTiles]);

    // Reset parameter references and loaded tiles when dashboard tiles change
    useEffect(() => {
        if (dashboardTiles) {
            setTileParameterReferences({});
            setLoadedTiles(new Set());
        }
    }, [dashboardTiles]);

    const [chartsWithDateZoomApplied, setChartsWithDateZoomApplied] =
        useState<Set<string>>();

    // Update dashboard url date zoom change
    useEffect(() => {
        const newParams = new URLSearchParams(search);
        if (dateZoomGranularity === undefined) {
            newParams.delete('dateZoom');
        } else {
            newParams.set('dateZoom', dateZoomGranularity.toLowerCase());
        }

        void navigate(
            {
                pathname,
                search: newParams.toString(),
            },
            { replace: true },
        );
    }, [dateZoomGranularity, search, navigate, pathname]);

    const savedChartUuidsAndTileUuids = useMemo(
        () =>
            dashboardTiles
                ?.filter(isDashboardChartTileType)
                .reduce<SavedChartsInfoForDashboardAvailableFilters>(
                    (acc, tile) => {
                        if (tile.properties.savedChartUuid) {
                            acc.push({
                                tileUuid: tile.uuid,
                                savedChartUuid: tile.properties.savedChartUuid,
                            });
                        }
                        return acc;
                    },
                    [],
                ),
        [dashboardTiles],
    );

    useEffect(() => {
        if (dashboard) {
            // global filters
            if (dashboardFilters === emptyFilters) {
                let updatedDashboardFilters;

                if (
                    hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
                ) {
                    updatedDashboardFilters = {
                        ...dashboard.filters,
                        dimensions: applyDimensionOverrides(
                            dashboard.filters,
                            overridesForSavedDashboardFilters,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    updatedDashboardFilters = dashboard.filters;
                    setHaveFiltersChanged(false);
                }

                setDashboardFilters(updatedDashboardFilters);
            }
            setOriginalDashboardFilters(dashboard.filters);

            // tab filters
            if (dashboard.tabs.length > 0 && isEmptyTabFilters(tabFilters)) {
                const updatedTabFilters = dashboard.tabs.reduce((acc, tab) => {
                    acc[tab.uuid] = tab.filters || emptyFilters;
                    return acc;
                }, {} as Record<string, DashboardFilters>);

                setTabFilters(updatedTabFilters);
            }
        }
    }, [
        dashboard,
        dashboardFilters,
        overridesForSavedDashboardFilters,
        tabFilters,
        setDashboardFilters,
        setHaveFiltersChanged,
        setOriginalDashboardFilters,
        setTabFilters,
    ]);

    // Updates url with temp and overridden filters and deep compare to avoid unnecessary re-renders for dashboardTemporaryFilters
    useDeepCompareEffect(() => {
        const newParams = new URLSearchParams(search);

        // temp filters
        if (
            dashboardTemporaryFilters?.dimensions?.length === 0 &&
            dashboardTemporaryFilters?.metrics?.length === 0
        ) {
            newParams.delete('tempFilters');
        } else {
            newParams.set(
                'tempFilters',
                JSON.stringify(
                    compressDashboardFiltersToParam(dashboardTemporaryFilters),
                ),
            );
        }

        // overridden filters
        if (overridesForSavedDashboardFilters?.dimensions?.length === 0) {
            newParams.delete('filters');
        } else if (overridesForSavedDashboardFilters?.dimensions?.length > 0) {
            newParams.set(
                'filters',
                JSON.stringify(
                    compressDashboardFiltersToParam(
                        overridesForSavedDashboardFilters,
                    ),
                ),
            );
        }

        // tab filters
        if (isEmptyTabFilters(tabTemporaryFilters)) {
            newParams.delete('tempTabFilters');
        } else {
            newParams.set(
                'tempTabFilters',
                JSON.stringify(
                    Object.entries(tabTemporaryFilters).reduce(
                        (acc, [tabUuid, tabFilter]) => {
                            acc[tabUuid] =
                                compressDashboardFiltersToParam(tabFilter);
                            return acc;
                        },
                        {} as Record<string, DashboardFiltersFromSearchParam>,
                    ),
                ),
            );
        }

        void navigate(
            {
                pathname,
                search: newParams.toString(),
            },
            { replace: true },
        );
    }, [
        dashboardFilters,
        dashboardTemporaryFilters,
        tabFilters,
        tabTemporaryFilters,
        pathname,
        overridesForSavedDashboardFilters,
        search,
        navigate,
    ]);

    useEffect(() => {
        if (
            dashboard?.filters &&
            hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
        ) {
            setDashboardFilters((prevFilters) => ({
                ...prevFilters,
                dimensions: applyDimensionOverrides(
                    prevFilters,
                    overridesForSavedDashboardFilters,
                ),
            }));
        }
    }, [
        dashboard?.filters,
        overridesForSavedDashboardFilters,
        setDashboardFilters,
    ]);

    // Gets filters and dateZoom from URL and storage after redirect
    useMount(() => {
        const searchParams = new URLSearchParams(search);

        // Date zoom
        const dateZoomParam = searchParams.get('dateZoom');
        if (dateZoomParam) {
            const dateZoomUrl = Object.values(DateGranularity).find(
                (granularity) =>
                    granularity.toLowerCase() === dateZoomParam?.toLowerCase(),
            );
            if (dateZoomUrl) setDateZoomGranularity(dateZoomUrl);
        }

        // Temp filters
        const tempFilterSearchParam = searchParams.get('tempFilters');
        const unsavedDashboardFiltersRaw = sessionStorage.getItem(
            'unsavedDashboardFilters',
        );

        sessionStorage.removeItem('unsavedDashboardFilters');
        if (unsavedDashboardFiltersRaw) {
            const unsavedDashboardFilters = JSON.parse(
                unsavedDashboardFiltersRaw,
            );
            // TODO: this should probably merge with the filters
            // from the database. This will break if they diverge,
            // meaning there is a subtle race condition here
            setDashboardFilters(unsavedDashboardFilters);
        }
        if (tempFilterSearchParam) {
            setDashboardTemporaryFilters(
                convertDashboardFiltersParamToDashboardFilters(
                    JSON.parse(tempFilterSearchParam),
                ),
            );
        }

        // Tab filters
        const tempTabFilterSearchParam = searchParams.get('tempTabFilters');
        if (tempTabFilterSearchParam) {
            const filters = JSON.parse(tempTabFilterSearchParam);

            setTabTemporaryFilters(
                Object.entries(filters).reduce((acc, [tabUuid, tabFilter]) => {
                    acc[tabUuid] =
                        convertDashboardFiltersParamToDashboardFilters(
                            tabFilter as DashboardFiltersFromSearchParam,
                        );
                    return acc;
                }, {} as Record<string, DashboardFilters>),
            );
        }
    });

    const {
        isInitialLoading: isLoadingDashboardFilters,
        isFetching: isFetchingDashboardFilters,
        data: dashboardAvailableFiltersData,
    } = useDashboardsAvailableFilters(
        savedChartUuidsAndTileUuids ?? [],
        projectUuid,
        embedToken,
    );

    const filterableFieldsByTileUuid = useMemo(() => {
        // If this is an embed dashboard, we skip the dashboard check
        if (
            (!dashboard && !embedToken) ||
            !dashboardTiles ||
            !dashboardAvailableFiltersData
        )
            return;

        const filterFieldsMapping = savedChartUuidsAndTileUuids?.reduce<
            Record<string, FilterableDimension[]>
        >((acc, { tileUuid }) => {
            const filterFields =
                dashboardAvailableFiltersData.savedQueryFilters[tileUuid]?.map(
                    (index) =>
                        dashboardAvailableFiltersData.allFilterableFields[
                            index
                        ],
                );

            if (filterFields) {
                acc[tileUuid] = filterFields;
            }

            return acc;
        }, {});

        return filterFieldsMapping;
    }, [
        dashboard,
        dashboardTiles,
        dashboardAvailableFiltersData,
        savedChartUuidsAndTileUuids,
        embedToken,
    ]);

    const allFilterableFieldsMap = useMemo(() => {
        return dashboardAvailableFiltersData?.allFilterableFields &&
            dashboardAvailableFiltersData.allFilterableFields.length > 0
            ? dashboardAvailableFiltersData.allFilterableFields.reduce<
                  Record<string, FilterableDimension>
              >(
                  (sum, field) => ({
                      ...sum,
                      [getItemId(field)]: field,
                  }),
                  {},
              )
            : {};
    }, [dashboardAvailableFiltersData]);

    const hasTilesThatSupportFilters = useMemo(() => {
        const tileTypesThatSupportFilters = [
            DashboardTileTypes.SQL_CHART,
            DashboardTileTypes.SAVED_CHART,
        ];
        return !!dashboardTiles?.some(({ type }) =>
            tileTypesThatSupportFilters.includes(type),
        );
    }, [dashboardTiles]);

    const addResultsCacheTime = useCallback((cacheMetadata?: CacheMetadata) => {
        if (
            cacheMetadata &&
            cacheMetadata.cacheHit &&
            cacheMetadata.cacheUpdatedTime
        ) {
            setResultsCacheTimes((old) =>
                cacheMetadata.cacheUpdatedTime
                    ? [...old, cacheMetadata.cacheUpdatedTime]
                    : [...old],
            );
        }
    }, []);

    const clearCacheAndFetch = useCallback(() => {
        setResultsCacheTimes([]);

        // Causes results refetch
        setInvalidateCache(true);
    }, []);

    const updateSqlChartTilesMetadata = useCallback(
        (tileUuid: string, metadata: SqlChartTileMetadata) => {
            setSqlChartTilesMetadata((prev) => ({
                ...prev,
                [tileUuid]: metadata,
            }));
        },
        [],
    );

    const oldestCacheTime = useMemo(
        () => min(resultsCacheTimes),
        [resultsCacheTimes],
    );

    // Filters that are required to have a value set
    const requiredDashboardFilters = useMemo(
        () =>
            dashboardFilters.dimensions
                // Get filters that are required to have a value set (required) and that have no default value set (disabled)
                .filter((f) => f.required && f.disabled)
                .reduce<Pick<DashboardFilterRule, 'id' | 'label'>[]>(
                    (acc, f) => {
                        const field = allFilterableFieldsMap[f.target.fieldId];

                        let label = '';

                        if (f.label) {
                            label = f.label;
                        } else if (field) {
                            label = getConditionalRuleLabelFromItem(
                                f,
                                field,
                            ).field;
                        }

                        return [
                            ...acc,
                            {
                                id: f.id,
                                label,
                            },
                        ];
                    },
                    [],
                ),
        [dashboardFilters.dimensions, allFilterableFieldsMap],
    );

    const value = {
        projectUuid,
        isDashboardLoading,
        dashboard: dashboard || embedDashboard,
        setEmbedDashboard,
        dashboardError,
        dashboardTiles,
        setDashboardTiles,
        haveTilesChanged,
        setHaveTilesChanged,
        haveTabsChanged,
        setHaveTabsChanged,
        dashboardTabs,
        setDashboardTabs,
        setDashboardTemporaryFilters,
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        resetDashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        addResultsCacheTime,
        oldestCacheTime,
        invalidateCache,
        clearCacheAndFetch,
        isAutoRefresh,
        setIsAutoRefresh,
        allFilterableFieldsMap,
        allFilterableFields: dashboardAvailableFiltersData?.allFilterableFields,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        filterableFieldsByTileUuid,
        allFilters,
        hasTilesThatSupportFilters,
        chartSort,
        setChartSort,
        sqlChartTilesMetadata,
        updateSqlChartTilesMetadata,
        dateZoomGranularity,
        setDateZoomGranularity,
        chartsWithDateZoomApplied,
        setChartsWithDateZoomApplied,
        dashboardCommentsCheck,
        dashboardComments,
        hasTileComments,
        requiredDashboardFilters,
        isDateZoomDisabled,
        setIsDateZoomDisabled,
        parameters,
        setParameter,
        dashboardParameterReferences,
        addParameterReferences,
        areAllChartsLoaded,
        tabFilters,
        setTabFilters,
        tabTemporaryFilters,
        setTabTemporaryFilters,
        haveTabFiltersChanged,
        setHaveTabFiltersChanged,
        getActiveTabFilters,
        getActiveTabTemporaryFilters,
        getMergedFiltersForTab,
        addTabDimensionFilter,
        updateTabDimensionFilter,
        removeTabDimensionFilter,
        resetTabFilters,
        isGlobalFilterEnabled,
        setIsGlobalFilterEnabled,
        isTabFilterEnabled,
        setIsTabFilterEnabled,
        haveFilterEnabledStatesChanged,
        setHaveFilterEnabledStatesChanged,
    };
    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};

export default DashboardProvider;

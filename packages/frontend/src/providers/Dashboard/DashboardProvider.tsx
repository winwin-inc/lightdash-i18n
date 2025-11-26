import {
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    DashboardTileTypes,
    DateGranularity,
    getItemId,
    isDashboardChartTileType,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardFiltersFromSearchParam,
    type DashboardParameters,
    type FilterableDimension,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SortField,
} from '@lightdash/common';
import clone from 'lodash/clone';
import isEqual from 'lodash/isEqual';
import min from 'lodash/min';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDeepCompareEffect, useMount } from 'react-use';
import { useConditionalRuleLabelFromItem } from '../../components/common/Filters/FilterInputs/utils';
import { type SdkFilter } from '../../ee/features/embed/EmbedDashboard/types';
import { convertSdkFilterToDashboardFilter } from '../../ee/features/embed/EmbedDashboard/utils';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import { useEmbedEventEmitter } from '../../ee/features/embed/hooks/useEmbedEventEmitter';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
import { useParameters } from '../../features/parameters';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
    useDashboardVersionRefresh,
} from '../../hooks/dashboard/useDashboard';
import {
    emptyFilters,
    useDashboardFilters,
} from '../../hooks/dashboard/useDashboardFilters';
import { useDashboardFilterState } from '../../hooks/dashboard/useDashboardFilterState';
import {
    isEmptyTabFilters,
    useDashboardTabFilters,
} from '../../hooks/dashboard/useDashboardTabFilters';
import { useProject } from '../../hooks/useProject';
import { hasSavedFiltersOverrides } from '../../hooks/useSavedDashboardFiltersOverrides';
import { useUserCategories } from '../../hooks/useUserCategories';
import {
    initializeCategoryFilterValuesByPermission,
    isCategoryField,
    updateCategoryFilterCascade,
} from '../../utils/categoryFilters';
import DashboardContext from './context';
import { type SqlChartTileMetadata } from './types';

const DashboardProvider: React.FC<
    React.PropsWithChildren<{
        schedulerFilters?: DashboardFilterRule[] | undefined;
        schedulerParameters?: ParametersValuesMap | undefined;
        dateZoom?: DateGranularity | undefined;
        projectUuid?: string;
        embedToken?: string;
        dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
        defaultInvalidateCache?: boolean;
        sdkFilters?: SdkFilter[];
    }>
> = ({
    schedulerFilters,
    schedulerParameters,
    dateZoom,
    projectUuid,
    embedToken,
    dashboardCommentsCheck,
    defaultInvalidateCache,
    children,
}) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();

    const getConditionalRuleLabelFromItem = useConditionalRuleLabelFromItem();

    const { dashboardUuid, tabUuid, mode } = useParams<{
        dashboardUuid: string;
        tabUuid?: string;
        mode?: string;
    }>() as {
        dashboardUuid: string;
        tabUuid?: string;
        mode?: string;
    };

    // 判断是否是编辑模式：从 URL 参数 mode 或 pathname 判断
    // 当点击编辑看板时，URL 会变成 /projects/.../dashboards/.../edit，mode 会是 'edit'
    const isEditMode = useMemo(() => {
        if (mode === 'edit') return true;
        // 备用判断：检查 pathname 是否包含 '/edit'
        return pathname.includes('/edit');
    }, [mode, pathname]);

    const {
        mutateAsync: versionRefresh,
        isLoading: isRefreshingDashboardVersion,
    } = useDashboardVersionRefresh(dashboardUuid);

    const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

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
    const [activeTab, setActiveTab] = useState<
        Dashboard['tabs'][number] | undefined
    >();

    // dashboard filter state
    const {
        isGlobalFilterEnabled,
        setIsGlobalFilterEnabled,
        isTabFilterEnabled,
        setIsTabFilterEnabled,
        haveFilterEnabledStatesChanged,
        setHaveFilterEnabledStatesChanged,
        showGlobalAddFilterButton,
        setShowGlobalAddFilterButton,
        showTabAddFilterButton,
        setShowTabAddFilterButton,
        haveShowAddFilterButtonStatesChanged,
        setHaveShowAddFilterButtonStatesChanged,
    } = useDashboardFilterState({ dashboard });

    // Get project info to check if customer use mode is enabled
    const { data: project } = useProject(projectUuid);

    // Get user categories for category filter initialization (only in customer use mode)
    const isCustomerUse = project?.isCustomerUse ?? false;
    const { data: userCategories } = useUserCategories({
        enabled: !!projectUuid && isCustomerUse,
    });

    // dashboard filters
    const {
        embedDashboard,
        setEmbedDashboard,
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
        updateDimensionDashboardFilter: originalUpdateDimensionDashboardFilter,
        addMetricDashboardFilter,
        removeDimensionDashboardFilter,
        overridesForSavedDashboardFilters,
        applyInteractivityFiltering,
    } = useDashboardFilters({
        dashboard,
        isFilterEnabled: isGlobalFilterEnabled,
    });

    const initializeCategoryFiltersSequentially = useCallback(
        (filters: DashboardFilters): DashboardFilters => {
            if (!isCustomerUse || !userCategories) return filters;

            let workingFilters = filters;
            let hasChanges = false;

            const validatedDimensions = filters.dimensions.map((filter) => {
                const initializedFilter =
                    initializeCategoryFilterValuesByPermission(
                        filter,
                        workingFilters,
                        userCategories,
                    );
                if (initializedFilter) {
                    hasChanges = true;
                    workingFilters = {
                        ...workingFilters,
                        dimensions: workingFilters.dimensions.map((dimension) =>
                            dimension.id === filter.id
                                ? initializedFilter
                                : dimension,
                        ),
                    };
                    return initializedFilter;
                }
                return filter;
            });

            if (!hasChanges) return filters;

            return {
                ...workingFilters,
                dimensions: validatedDimensions,
            };
        },
        [isCustomerUse, userCategories],
    );

    // Wrap updateDimensionDashboardFilter to handle category filter cascade
    const updateDimensionDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isEditMode: boolean,
        ) => {
            // First update the filter
            originalUpdateDimensionDashboardFilter(
                item,
                index,
                isTemporary,
                isEditMode,
            );

            // Then handle category filter cascade if needed (only in customer use mode)
            if (isCustomerUse && userCategories && !isEditMode) {
                if (isCategoryField(item)) {
                    const newValue =
                        item.values && item.values.length > 0
                            ? String(item.values[0])
                            : null;

                    // Update filters with cascade logic
                    setDashboardFilters((prevFilters) => {
                        const cascaded = updateCategoryFilterCascade(
                            prevFilters,
                            item,
                            newValue,
                            userCategories,
                        );
                        return initializeCategoryFiltersSequentially(cascaded);
                    });
                }
            }
        },
        [
            originalUpdateDimensionDashboardFilter,
            isCustomerUse,
            userCategories,
            setDashboardFilters,
            initializeCategoryFiltersSequentially,
        ],
    );

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
    } = useDashboardTabFilters({
        dashboard,
        dashboardFilters,
        dashboardTemporaryFilters,
        isFilterEnabled: (uuid: string) => isTabFilterEnabled[uuid] ?? true,
    });

    // Wrap updateTabDimensionFilter to handle category filter cascade
    const wrappedUpdateTabDimensionFilter = useCallback(
        (
            tabUuid: string,
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
        ) => {
            // First update the filter
            updateTabDimensionFilter(tabUuid, item, index, isTemporary);

            // Then handle category filter cascade if needed (only in customer use mode & view mode)
            if (isCustomerUse && userCategories && !isEditMode) {
                if (isCategoryField(item)) {
                    const newValue =
                        item.values && item.values.length > 0
                            ? String(item.values[0])
                            : null;

                    // Update tab filters with cascade logic
                    setTabFilters((prevTabFilters) => {
                        const tabFilter = prevTabFilters[tabUuid]
                            ? clone(prevTabFilters[tabUuid])
                            : emptyFilters;
                        const updatedTabFilter = updateCategoryFilterCascade(
                            tabFilter,
                            item,
                            newValue,
                            userCategories,
                        );
                        const initializedTabFilter =
                            initializeCategoryFiltersSequentially(
                                updatedTabFilter,
                            );
                        return {
                            ...prevTabFilters,
                            [tabUuid]: initializedTabFilter,
                        };
                    });
                }
            }
        },
        [
            updateTabDimensionFilter,
            isCustomerUse,
            userCategories,
            setTabFilters,
            isEditMode,
            initializeCategoryFiltersSequentially,
        ],
    );

    const [resultsCacheTimes, setResultsCacheTimes] = useState<Date[]>([]);
    const [invalidateCache, setInvalidateCache] = useState<boolean>(
        defaultInvalidateCache === true,
    );

    // Event system for filter change tracking
    const { dispatchEmbedEvent } = useEmbedEventEmitter();
    const embed = useEmbed();
    const previousFiltersRef = useRef<DashboardFilters | null>(null);

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

    // Initialize filter enabled states from dashboard config when dashboard loads
    useEffect(() => {
        if (dashboard?.config?.isDateZoomDisabled === true) {
            setIsDateZoomDisabled(true);
        }
        if (dashboard?.config?.isGlobalFilterEnabled !== undefined) {
            setIsGlobalFilterEnabled(dashboard.config.isGlobalFilterEnabled);
        }
        if (dashboard?.config?.showGlobalAddFilterButton !== undefined) {
            setShowGlobalAddFilterButton(
                dashboard.config.showGlobalAddFilterButton,
            );
        }
        if (dashboard?.config?.showTabAddFilterButton) {
            setShowTabAddFilterButton(dashboard.config.showTabAddFilterButton);
        }
    }, [
        dashboard,
        setIsGlobalFilterEnabled,
        setShowGlobalAddFilterButton,
        setShowTabAddFilterButton,
    ]);

    const [parameterDefinitions, setParameterDefinitions] =
        useState<ParameterDefinitions>({});

    const addParameterDefinitions = useCallback(
        (parameters: ParameterDefinitions) => {
            setParameterDefinitions((prev) => ({
                ...prev,
                ...parameters,
            }));
        },
        [],
    );

    // Saved parameters are the parameters that are saved on the server
    const [savedParameters, setSavedParameters] = useState<DashboardParameters>(
        {},
    );
    // parameters that are currently applied to the dashboard
    const [parameters, setParameters] = useState<DashboardParameters>({});
    const [parametersHaveChanged, setParametersHaveChanged] =
        useState<boolean>(false);

    // Pinned parameters state
    const [pinnedParameters, setPinnedParametersState] = useState<string[]>([]);
    const [havePinnedParametersChanged, setHavePinnedParametersChanged] =
        useState<boolean>(false);

    // Set parameters to saved parameters when they are loaded
    useEffect(() => {
        if (savedParameters) {
            setParameters(savedParameters);
        }
    }, [savedParameters]);

    // Set pinned parameters when dashboard is loaded
    useEffect(() => {
        if (dashboard?.config?.pinnedParameters !== undefined) {
            setPinnedParametersState(dashboard.config.pinnedParameters);
        } else if (dashboard?.config !== undefined) {
            // Initialize empty array if dashboard has config but no pinnedParameters
            setPinnedParametersState([]);
        }
    }, [dashboard?.config?.pinnedParameters, dashboard?.config]);

    // Set active tab when dashboard and tabs are loaded
    useEffect(() => {
        if (dashboardTabs && dashboardTabs.length > 0) {
            const matchedTab =
                dashboardTabs.find((item) => item.uuid === tabUuid) ??
                dashboardTabs[0];

            setActiveTab(matchedTab);
        }
    }, [dashboardTabs, tabUuid]);

    // Apply scheduler parameters when provided (for scheduled deliveries)
    useEffect(() => {
        if (schedulerParameters) {
            // Convert ParametersValuesMap to DashboardParameters format
            const dashboardParams: DashboardParameters = Object.fromEntries(
                Object.entries(schedulerParameters).map(([key, value]) => [
                    key,
                    {
                        parameterName: key,
                        value,
                    },
                ]),
            );
            setSavedParameters(dashboardParams);
        }
    }, [schedulerParameters]);

    // Set parametersHaveChanged to true if parameters have changed
    useEffect(() => {
        if (!isEqual(parameters, savedParameters)) {
            setParametersHaveChanged(true);
        }
    }, [parameters, savedParameters]);

    const setParameter = useCallback(
        (key: string, value: ParameterValue | null) => {
            if (
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0)
            ) {
                setParameters((prev) => {
                    const newParams = { ...prev };
                    delete newParams[key];
                    return newParams;
                });
            } else {
                setParameters((prev) => ({
                    ...prev,
                    [key]: {
                        parameterName: key,
                        value,
                    },
                }));
            }
        },
        [],
    );

    const clearAllParameters = useCallback(() => {
        setParameters({});
    }, []);

    const setPinnedParameters = useCallback((pinnedParams: string[]) => {
        setPinnedParametersState(pinnedParams);
        setHavePinnedParametersChanged(true);
    }, []);

    const toggleParameterPin = useCallback((parameterKey: string) => {
        setPinnedParametersState((prev) => {
            const isCurrentlyPinned = prev.includes(parameterKey);
            const newPinnedParams = isCurrentlyPinned
                ? prev.filter((key) => key !== parameterKey)
                : [...prev, parameterKey];
            return newPinnedParams;
        });
        setHavePinnedParametersChanged(true);
    }, []);

    const parameterValues = useMemo(() => {
        return Object.entries(parameters).reduce((acc, [key, parameter]) => {
            if (
                parameter.value !== null &&
                parameter.value !== undefined &&
                parameter.value !== ''
            ) {
                acc[key] = parameter.value;
            }
            return acc;
        }, {} as ParametersValuesMap);
    }, [parameters]);

    const selectedParametersCount = useMemo(() => {
        return Object.values(parameterValues).filter(
            (value) => value !== null && value !== '' && value !== undefined,
        ).length;
    }, [parameterValues]);

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

    const { data: projectParameters } = useParameters(
        projectUuid,
        Array.from(dashboardParameterReferences ?? []),
        {
            enabled: !!projectUuid && !!dashboardParameterReferences,
        },
    );

    useEffect(() => {
        if (projectParameters) {
            addParameterDefinitions(projectParameters);
        }
    }, [projectParameters, addParameterDefinitions]);

    // Determine if all chart tiles have loaded their parameter references
    const areAllChartsLoaded = useMemo(() => {
        if (!dashboardTiles) return false;

        // If tabs exist, but no active tab is specified, tiles are not loaded
        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab)
            return false;

        const chartTileUuids = dashboardTiles
            .filter(isDashboardChartTileType)
            .filter((tile) => {
                // If no active tab specified, include all tiles (backwards compatibility)
                if (!activeTab) return true;

                // If tabs exist, only include tiles from the active tab or no tabUuid
                return !tile.tabUuid || tile.tabUuid === activeTab.uuid;
            })
            .map((tile) => tile.uuid);

        return chartTileUuids.every((tileUuid) => loadedTiles.has(tileUuid));
    }, [dashboardTiles, loadedTiles, activeTab, dashboardTabs]);

    const missingRequiredParameters = useMemo(() => {
        // If no parameter references, return empty array
        if (!dashboardParameterReferences.size) return [];

        // Missing required parameters are the ones that are not set and don't have a default value
        return Array.from(dashboardParameterReferences).filter(
            (parameterName) =>
                !parameters[parameterName] &&
                !parameterDefinitions[parameterName]?.default,
        );
    }, [dashboardParameterReferences, parameters, parameterDefinitions]);

    // Remove parameter references for tiles that are no longer in the dashboard
    useEffect(() => {
        if (dashboardTiles) {
            setTileParameterReferences((old) => {
                if (!dashboardTiles) return {};
                const tileIds = new Set(
                    dashboardTiles.map((tile) => tile.uuid),
                );
                return Object.fromEntries(
                    Object.entries(old).filter(([tileId]) =>
                        tileIds.has(tileId),
                    ),
                );
            });
        }
    }, [dashboardTiles]);

    const [chartsWithDateZoomApplied, setChartsWithDateZoomApplied] =
        useState<Set<string>>();

    // Update dashboard url date zoom change
    // Only sync URL in regular dashboards or 'direct' embed mode (not 'sdk' mode)
    useEffect(() => {
        if (embed.mode === 'sdk') {
            return;
        }

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
    }, [dateZoomGranularity, search, navigate, pathname, embed.mode]);

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

    // Apply filters on dashboard load in order of precedence:
    // 1. Start with base dashboard filters
    // 2. Apply overrides for iframe embed or replace SDK filters in SDK mode
    // 3. Apply interactivity filtering (embedded dashboards only)
    //
    // This happens on the first load when emptyFilters is the initial value of dashboardFilters
    useEffect(() => {
        const currentDashboard = dashboard || embedDashboard;

        if (!currentDashboard) return;

        if (dashboardFilters === emptyFilters) {
            let overrides = clone(overridesForSavedDashboardFilters);

            // Step 1: Start with base filters
            let updatedDashboardFilters = clone(currentDashboard.filters);

            // Step 2: Apply SDK Filters
            // For SDK mode, SDK filters replace embedded dashboard filters
            const sdkFilters =
                embed.mode === 'sdk' && embed.filters ? embed.filters : [];
            if (sdkFilters.length > 0) {
                updatedDashboardFilters.dimensions = sdkFilters.map(
                    (sdkFilter) => convertSdkFilterToDashboardFilter(sdkFilter),
                );
            }

            // Apply overrides from URL
            if (embed.mode === 'direct') {
                // For direct mode, only read from URL if not SDK mode
                if (hasSavedFiltersOverrides(overrides)) {
                    updatedDashboardFilters = {
                        ...updatedDashboardFilters,
                        dimensions: applyDimensionOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    setHaveFiltersChanged(false);
                }
            } else {
                if (overrides && overrides.dimensions.length > 0) {
                    updatedDashboardFilters = {
                        ...updatedDashboardFilters,
                        dimensions: applyDimensionOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    setHaveFiltersChanged(false);
                }
            }

            // Step 3: Apply interactivity filtering for embedded dashboards
            updatedDashboardFilters = applyInteractivityFiltering(
                updatedDashboardFilters,
            );

            // Step 4: Initialize category filters based on user permissions (only in customer use mode)
            // Note: This will be applied when userCategories loads (see useEffect below)
            setDashboardFilters(updatedDashboardFilters);

            // tab filters
            if (
                currentDashboard.tabs.length > 0 &&
                isEmptyTabFilters(tabFilters)
            ) {
                const updatedTabFilters = currentDashboard.tabs.reduce(
                    (acc, tab) => {
                        // Deep clone to avoid mutating the original object
                        acc[tab.uuid] = tab.filters ?? emptyFilters;
                        return acc;
                    },
                    {} as Record<string, DashboardFilters>,
                );

                setTabFilters(updatedTabFilters);
            }
        }

        setOriginalDashboardFilters(currentDashboard.filters);
    }, [
        embed,
        dashboard,
        embedDashboard,
        dashboardFilters,
        overridesForSavedDashboardFilters,
        tabFilters,
        setHaveFiltersChanged,
        setDashboardFilters,
        setOriginalDashboardFilters,
        setTabFilters,
        applyInteractivityFiltering,
    ]);

    // Apply category filters when userCategories loads (only in customer use mode)
    // This ensures category filters are initialized even if userCategories loads after dashboard
    useEffect(() => {
        if (!isCustomerUse || !userCategories || isEditMode) return;
        if (dashboardFilters === emptyFilters) return; // Skip if filters haven't been initialized yet

        // Check if category filters need to be initialized or validated
        const hasCategoryFields = dashboardFilters.dimensions.some((filter) =>
            isCategoryField(filter),
        );
        if (!hasCategoryFields) return;

        // Apply category filter validation and initialization
        // Use functional update to avoid dependency on dashboardFilters
        setDashboardFilters((prevFilters) =>
            initializeCategoryFiltersSequentially(prevFilters),
        );
    }, [
        isCustomerUse,
        userCategories,
        isEditMode,
        setDashboardFilters,
        initializeCategoryFiltersSequentially,
    ]);

    // Apply category filters to tab filters when userCategories loads
    useEffect(() => {
        if (!isCustomerUse || !userCategories || isEditMode) return;
        if (isEmptyTabFilters(tabFilters)) return; // Skip if tab filters haven't been initialized yet

        // Apply category filter validation and initialization to each tab
        // Use functional update to avoid dependency on tabFilters
        setTabFilters((prevTabFilters) => {
            const updated = { ...prevTabFilters };
            let hasChanges = false;

            Object.entries(prevTabFilters).forEach(([tabUuid, filters]) => {
                const initialized =
                    initializeCategoryFiltersSequentially(filters);
                if (initialized !== filters) {
                    updated[tabUuid] = initialized;
                    hasChanges = true;
                }
            });

            return hasChanges ? updated : prevTabFilters;
        });
    }, [
        isCustomerUse,
        userCategories,
        isEditMode,
        setTabFilters,
        initializeCategoryFiltersSequentially,
    ]);

    // Updates url with temp and overridden filters and deep compare to avoid unnecessary re-renders for dashboardTemporaryFilters
    // Only sync URL in regular dashboards or 'direct' embed mode (not 'sdk' mode)
    useDeepCompareEffect(() => {
        if (embed.mode === 'sdk') {
            return;
        }

        const currentParams = new URLSearchParams(search);
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

        // Only navigate if search params actually changed
        const newSearch = newParams.toString();
        const currentSearch = currentParams.toString();
        if (newSearch !== currentSearch) {
            void navigate(
                {
                    pathname,
                    search: newSearch,
                },
                { replace: true },
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
                        (acc, [uuid, filter]) => {
                            acc[uuid] = compressDashboardFiltersToParam(filter);
                            return acc;
                        },
                        {} as Record<string, DashboardFiltersFromSearchParam>,
                    ),
                ),
            );
        }
    }, [
        dashboardFilters,
        dashboardTemporaryFilters,
        navigate,
        pathname,
        overridesForSavedDashboardFilters,
        search,
        tabFilters,
        tabTemporaryFilters,
        embed.mode,
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
                Object.entries(filters).reduce((acc, [uuid, filter]) => {
                    acc[uuid] = convertDashboardFiltersParamToDashboardFilters(
                        filter as DashboardFiltersFromSearchParam,
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

    // Watch for filter changes and emit events (skip initial render)
    useEffect(() => {
        const previousFilters = previousFiltersRef.current;
        const hasPreviousFilters =
            previousFilters &&
            previousFilters.dimensions.length +
                previousFilters.metrics.length +
                previousFilters.tableCalculations.length;

        if (hasPreviousFilters && !isEqual(previousFilters, allFilters)) {
            const filterCount =
                allFilters.dimensions.length +
                allFilters.metrics.length +
                allFilters.tableCalculations.length;

            dispatchEmbedEvent(LightdashEventType.FilterChanged, {
                hasFilters: filterCount > 0,
                filterCount,
            });
        }

        previousFiltersRef.current = allFilters;
    }, [allFilters, dispatchEmbedEvent]);

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

    const refreshDashboardVersion = useCallback(async () => {
        try {
            const freshDashboard = await versionRefresh(dashboard);

            // Only update local state if we got fresh data back
            // (null means dashboard was already up-to-date)
            if (freshDashboard) {
                setDashboardTiles(freshDashboard.tiles);
                setDashboardTabs(freshDashboard.tabs);
                setSavedParameters(freshDashboard.parameters ?? {});
            }
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
            // Could optionally show a toast error here
        }
    }, [
        versionRefresh,
        dashboard,
        setDashboardTiles,
        setDashboardTabs,
        setSavedParameters,
    ]);

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
        [
            dashboardFilters.dimensions,
            allFilterableFieldsMap,
            getConditionalRuleLabelFromItem,
        ],
    );

    // Memoized mapping of tile UUIDs to their display names
    const tileNamesById = useMemo(() => {
        if (!dashboardTiles) return {};

        return dashboardTiles.reduce<Record<string, string>>((acc, tile) => {
            const tileWithoutTitle =
                !tile.properties.title || tile.properties.title.length === 0;
            const isChartTileType = isDashboardChartTileType(tile);

            let tileName = '';
            if (tileWithoutTitle && isChartTileType) {
                tileName = tile.properties.chartName || '';
            } else if (tile.properties.title) {
                tileName = tile.properties.title;
            }

            acc[tile.uuid] = tileName;
            return acc;
        }, {});
    }, [dashboardTiles]);

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
        activeTab,
        setActiveTab,
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
        setSavedParameters,
        parametersHaveChanged,
        dashboardParameters: parameters,
        parameterValues,
        selectedParametersCount,
        setParameter,
        parameterDefinitions,
        clearAllParameters,
        dashboardParameterReferences,
        addParameterReferences,
        tileParameterReferences,
        areAllChartsLoaded,
        missingRequiredParameters,
        pinnedParameters,
        setPinnedParameters,
        toggleParameterPin,
        havePinnedParametersChanged,
        setHavePinnedParametersChanged,
        addParameterDefinitions,
        tileNamesById,
        refreshDashboardVersion,
        isRefreshingDashboardVersion,

        // tab filters start
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
        updateTabDimensionFilter: wrappedUpdateTabDimensionFilter,
        removeTabDimensionFilter,
        resetTabFilters,
        // tab filters end

        // filter enabled state start
        isGlobalFilterEnabled,
        setIsGlobalFilterEnabled,
        isTabFilterEnabled,
        setIsTabFilterEnabled,
        haveFilterEnabledStatesChanged,
        setHaveFilterEnabledStatesChanged,
        showGlobalAddFilterButton,
        setShowGlobalAddFilterButton,
        showTabAddFilterButton,
        setShowTabAddFilterButton,
        haveShowAddFilterButtonStatesChanged,
        setHaveShowAddFilterButtonStatesChanged,
        // filter enabled state end
    };
    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};

export default DashboardProvider;

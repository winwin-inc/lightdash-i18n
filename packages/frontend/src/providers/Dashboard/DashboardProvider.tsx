import {
    applyDimensionOverrides,
    applyMetricOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    DashboardTileTypes,
    DateGranularity,
    getActiveTabForTabs,
    getItemId,
    getUnmetFilterRequirements,
    isDashboardChartTileType,
    isFilterLockedOnTab,
    stripOverridesForLockedFiltersOnTab,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardFiltersFromSearchParam,
    type DashboardParameters,
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
import { useTranslation } from 'react-i18next';
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
    mergeFiltersForTab,
    useDashboardTabFilters,
} from '../../hooks/dashboard/useDashboardTabFilters';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import useToaster from '../../hooks/toaster/useToaster';
import { hasSavedFiltersOverrides } from '../../hooks/useSavedDashboardFiltersOverrides';
import {
    buildOptimisticCategoryDisplayState,
    decideCategoryInit,
    mergeDimensionIntoDisplayState,
    resolveActiveTabCategoryInit,
    shouldApplyCategoryInitResult,
    shouldStartCategoryInitTask,
    type TabCategoryDisplayState,
} from '../../utils/categoryFilterInitHelpers';
import {
    getCategoryFiltersSignature,
    initializeCategoryFiltersAsync,
    isCategoryField,
    updateCategoryFilterCascadeAsync,
} from '../../utils/categoryFilters';
import DashboardChartColorSyncProvider from '../DashboardChartColorSync/DashboardChartColorSyncProvider';
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
        mountDefaultColorSyncProvider?: boolean;
    }>
> = ({
    schedulerFilters,
    schedulerParameters,
    dateZoom,
    projectUuid,
    embedToken,
    dashboardCommentsCheck,
    defaultInvalidateCache,
    mountDefaultColorSyncProvider = true,
    children,
}) => {
    const { t } = useTranslation();
    const { search, pathname } = useLocation();
    const navigate = useNavigate();

    const getConditionalRuleLabelFromItem = useConditionalRuleLabelFromItem();
    const { showToastInfo } = useToaster();

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
    const { setDashboardActiveTabUuid, getDashboardLastTabUuid } =
        useDashboardStorage();

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

    // 筛选器状态（含 URL override 与 reset；override hook 只在 useDashboardFilters 内实例化一次）
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
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter: originalUpdateDimensionDashboardFilter,
        addMetricDashboardFilter,
        removeDimensionDashboardFilter,
        overridesForSavedDashboardFilters,
        resetSavedFilterOverrides,
        applyInteractivityFiltering,
    } = useDashboardFilters({
        dashboard,
        isFilterEnabled: isGlobalFilterEnabled,
    });

    // 类目联动按 field/search 实际数据（含 dashboardSlug → dbt RLS），不依赖 Admin 类目接口
    const dashboardSlug = (dashboard || embedDashboard)?.slug;
    const dashboardName = (dashboard || embedDashboard)?.name;
    const dashboardFilterContext = useMemo(
        () => ({
            dashboardSlug,
            dashboardName,
        }),
        [dashboardSlug, dashboardName],
    );
    // 须有 dashboardSlug，避免未就绪时按 NA 绕过 dbt 控制码
    const canApplyCategoryFilters =
        !isEditMode && !!projectUuid && !!dashboardSlug;

    const globalCategoryInitGenerationRef = useRef(0);
    const globalCategoryProcessedSignatureRef = useRef<string | null>(null);
    const globalCategoryPendingSignatureRef = useRef<string | null>(null);
    const tabCategoryInitGenerationRef = useRef<Record<string, number>>({});
    const tabCategoryProcessedSignatureRef = useRef<Record<string, string>>(
        {},
    );
    const tabCategoryPendingSignatureRef = useRef<Record<string, string>>({});

    const markGlobalCategoryProcessed = useCallback(
        (filters: DashboardFilters) => {
            if (!projectUuid) return;
            globalCategoryProcessedSignatureRef.current =
                getCategoryFiltersSignature(
                    filters,
                    projectUuid,
                    dashboardFilterContext,
                );
        },
        [projectUuid, dashboardFilterContext],
    );

    const markTabCategoryProcessed = useCallback(
        (targetTabUuid: string, filters: DashboardFilters) => {
            if (!projectUuid) return;
            tabCategoryProcessedSignatureRef.current[targetTabUuid] =
                getCategoryFiltersSignature(
                    filters,
                    projectUuid,
                    dashboardFilterContext,
                );
        },
        [projectUuid, dashboardFilterContext],
    );

    const runGlobalCategoryInit = useCallback(
        (filters: DashboardFilters) => {
            const decision = decideCategoryInit({
                canApplyCategoryFilters,
                filters,
                projectUuid,
                dashboardContext: dashboardFilterContext,
                processedSignature: globalCategoryProcessedSignatureRef.current,
            });

            if (
                !shouldStartCategoryInitTask({
                    decision,
                    pendingSignature:
                        globalCategoryPendingSignatureRef.current,
                }) ||
                !projectUuid ||
                decision.action !== 'start'
            ) {
                return;
            }

            const generation = ++globalCategoryInitGenerationRef.current;
            const { signature } = decision;
            globalCategoryPendingSignatureRef.current = signature;

            void initializeCategoryFiltersAsync(
                filters,
                projectUuid,
                dashboardFilterContext,
            )
                .then((refined) => {
                    setDashboardFilters((currentFilters) => {
                        if (
                            !shouldApplyCategoryInitResult({
                                requestGeneration: generation,
                                currentGeneration:
                                    globalCategoryInitGenerationRef.current,
                                requestSignature: signature,
                                currentFilters,
                                projectUuid,
                                dashboardContext: dashboardFilterContext,
                            })
                        ) {
                            return currentFilters;
                        }

                        const nextFilters =
                            refined === currentFilters
                                ? currentFilters
                                : refined;
                        globalCategoryProcessedSignatureRef.current =
                            getCategoryFiltersSignature(
                                nextFilters,
                                projectUuid,
                                dashboardFilterContext,
                            );
                        return nextFilters;
                    });
                })
                .finally(() => {
                    if (
                        globalCategoryPendingSignatureRef.current ===
                            signature &&
                        globalCategoryInitGenerationRef.current === generation
                    ) {
                        globalCategoryPendingSignatureRef.current = null;
                    }
                });
        },
        [
            canApplyCategoryFilters,
            projectUuid,
            dashboardFilterContext,
            setDashboardFilters,
        ],
    );

    // 按 field/search 实际类目初始化由 runGlobalCategoryInit / runTabCategoryInit 负责

    // 父改子联动：按 field/search 实际类目纠正选中值
    const updateCascadeWithFieldSearch = useCallback(
        async (
            filters: DashboardFilters,
            changedFilter: DashboardFilterRule,
            newValue: string | null,
        ): Promise<DashboardFilters> => {
            if (!canApplyCategoryFilters || !projectUuid) return filters;
            const cascaded = await updateCategoryFilterCascadeAsync(
                filters,
                changedFilter,
                newValue,
                projectUuid,
                dashboardFilterContext,
            );
            return initializeCategoryFiltersAsync(
                cascaded,
                projectUuid,
                dashboardFilterContext,
            );
        },
        [canApplyCategoryFilters, projectUuid, dashboardFilterContext],
    );

    const replaceDimensionFilterAtIndex = useCallback(
        (
            filters: DashboardFilters,
            index: number,
            item: DashboardFilterRule,
        ): DashboardFilters => ({
            ...filters,
            dimensions: filters.dimensions.map((filter, filterIndex) =>
                filterIndex === index ? item : filter,
            ),
        }),
        [],
    );
    // This implements the reset logic directly (instead of using resetDashboardFilters from useDashboardFilters)
    // to ensure category filter initialization is applied before setting the filters.
    const wrappedResetDashboardFilters = useCallback(() => {
        const currentDashboard = dashboard || embedDashboard;
        const filters =
            currentDashboard?.filters ??
            embedDashboard?.filters ??
            emptyFilters;
        const filteredFilters = embedDashboard
            ? applyInteractivityFiltering(filters)
            : filters;

        // Category refine is handled by the dedicated global category effect
        setDashboardFilters(filteredFilters);
        setDashboardTemporaryFilters(emptyFilters);
        resetSavedFilterOverrides();
    }, [
        dashboard,
        embedDashboard,
        setDashboardFilters,
        setDashboardTemporaryFilters,
        resetSavedFilterOverrides,
        applyInteractivityFiltering,
    ]);

    // Wrap updateDimensionDashboardFilter to handle category filter cascade
    const updateDimensionDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isEdit: boolean,
        ) => {
            const hasSelectedValue =
                item.values !== undefined && item.values.length > 0;

            if (
                !canApplyCategoryFilters ||
                !isCategoryField(item) ||
                isEdit ||
                !hasSelectedValue
            ) {
                originalUpdateDimensionDashboardFilter(
                    item,
                    index,
                    isTemporary,
                    isEdit,
                );
                return;
            }

            const newValue = String(item.values![0]);
            const nextFilters = replaceDimensionFilterAtIndex(
                dashboardFilters,
                index,
                item,
            );

            const generation = ++globalCategoryInitGenerationRef.current;
            // 手动级联使旧 init 失效，清除 pending 以免挡住后续合法 init
            globalCategoryPendingSignatureRef.current = null;
            const requestSignature = projectUuid
                ? getCategoryFiltersSignature(
                      dashboardFilters,
                      projectUuid,
                      dashboardFilterContext,
                  )
                : null;
            void updateCascadeWithFieldSearch(nextFilters, item, newValue).then(
                (refined) => {
                    setDashboardFilters((currentFilters) => {
                        if (
                            !projectUuid ||
                            !requestSignature ||
                            !shouldApplyCategoryInitResult({
                                requestGeneration: generation,
                                currentGeneration:
                                    globalCategoryInitGenerationRef.current,
                                requestSignature,
                                currentFilters,
                                projectUuid,
                                dashboardContext: dashboardFilterContext,
                            })
                        ) {
                            return currentFilters;
                        }

                        markGlobalCategoryProcessed(refined);
                        return refined;
                    });
                },
            );
        },
        [
            originalUpdateDimensionDashboardFilter,
            canApplyCategoryFilters,
            dashboardFilters,
            setDashboardFilters,
            updateCascadeWithFieldSearch,
            replaceDimensionFilterAtIndex,
            markGlobalCategoryProcessed,
            projectUuid,
            dashboardFilterContext,
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
        isGlobalFilterEnabled,
        isFilterEnabled: (uuid: string) => isTabFilterEnabled[uuid] ?? true,
    });

    /** 类目级联期间顶部筛选项即时展示；图表仍读已提交 tabFilters */
    const [tabCategoryDisplayFilters, setTabCategoryDisplayFilters] = useState<
        Record<string, TabCategoryDisplayState>
    >({});

    const clearTabCategoryDisplay = useCallback((targetTabUuid: string) => {
        setTabCategoryDisplayFilters((prev) => {
            if (!(targetTabUuid in prev)) return prev;
            const next = { ...prev };
            delete next[targetTabUuid];
            return next;
        });
    }, []);

    const bumpTabCategoryGeneration = useCallback((targetTabUuid: string) => {
        const generation =
            (tabCategoryInitGenerationRef.current[targetTabUuid] ?? 0) + 1;
        tabCategoryInitGenerationRef.current[targetTabUuid] = generation;
        delete tabCategoryPendingSignatureRef.current[targetTabUuid];
        return generation;
    }, []);

    const getDisplayedMergedFiltersForTab = useCallback(
        (targetTabUuid: string) => {
            const display = tabCategoryDisplayFilters[targetTabUuid];
            return mergeFiltersForTab({
                globalFilters: dashboardFilters,
                globalTemporaryFilters: dashboardTemporaryFilters,
                tabFilters: display?.filters ?? getActiveTabFilters(targetTabUuid),
                tabTemporaryFilters: getActiveTabTemporaryFilters(targetTabUuid),
                isGlobalFilterEnabled,
                isTabFilterEnabled: isTabFilterEnabled[targetTabUuid] ?? true,
            });
        },
        [
            tabCategoryDisplayFilters,
            dashboardFilters,
            dashboardTemporaryFilters,
            getActiveTabFilters,
            getActiveTabTemporaryFilters,
            isGlobalFilterEnabled,
            isTabFilterEnabled,
        ],
    );

    const runTabCategoryInit = useCallback(
        (targetTabUuid: string, filters: DashboardFilters) => {
            const decision = resolveActiveTabCategoryInit({
                tabFilters: { [targetTabUuid]: filters },
                activeTabUuid: targetTabUuid,
                canApplyCategoryFilters,
                projectUuid,
                dashboardContext: dashboardFilterContext,
                processedSignatures: tabCategoryProcessedSignatureRef.current,
            });

            if (
                !shouldStartCategoryInitTask({
                    decision,
                    pendingSignature:
                        tabCategoryPendingSignatureRef.current[targetTabUuid],
                }) ||
                !projectUuid ||
                decision.action !== 'start'
            ) {
                return;
            }

            const generation =
                (tabCategoryInitGenerationRef.current[targetTabUuid] ?? 0) + 1;
            tabCategoryInitGenerationRef.current[targetTabUuid] = generation;
            const { signature } = decision;
            tabCategoryPendingSignatureRef.current[targetTabUuid] = signature;

            void initializeCategoryFiltersAsync(
                filters,
                projectUuid,
                dashboardFilterContext,
            )
                .then((refined) => {
                    setTabFilters((currentTabFilters) => {
                        const currentFilters =
                            currentTabFilters[targetTabUuid] ?? emptyFilters;
                        if (
                            !shouldApplyCategoryInitResult({
                                requestGeneration: generation,
                                currentGeneration:
                                    tabCategoryInitGenerationRef.current[
                                        targetTabUuid
                                    ] ?? 0,
                                requestSignature: signature,
                                currentFilters,
                                projectUuid,
                                dashboardContext: dashboardFilterContext,
                            })
                        ) {
                            return currentTabFilters;
                        }

                        const nextFilters =
                            refined === currentFilters
                                ? currentFilters
                                : refined;
                        tabCategoryProcessedSignatureRef.current[
                            targetTabUuid
                        ] = getCategoryFiltersSignature(
                            nextFilters,
                            projectUuid,
                            dashboardFilterContext,
                        );
                        if (nextFilters === currentFilters) {
                            return currentTabFilters;
                        }
                        return {
                            ...currentTabFilters,
                            [targetTabUuid]: nextFilters,
                        };
                    });
                })
                .finally(() => {
                    if (
                        tabCategoryPendingSignatureRef.current[
                            targetTabUuid
                        ] === signature &&
                        (tabCategoryInitGenerationRef.current[targetTabUuid] ??
                            0) === generation
                    ) {
                        delete tabCategoryPendingSignatureRef.current[
                            targetTabUuid
                        ];
                    }
                });
        },
        [
            canApplyCategoryFilters,
            projectUuid,
            dashboardFilterContext,
            setTabFilters,
        ],
    );

    // Wrap updateTabDimensionFilter to handle category filter cascade
    const wrappedUpdateTabDimensionFilter = useCallback(
        (
            uuid: string,
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
        ) => {
            const hasSelectedValue =
                item.values !== undefined && item.values.length > 0;
            const existingDisplay = tabCategoryDisplayFilters[uuid];

            // pending 期间改普通筛选：合并进展示态、同步已提交，并重启类目校验
            if (
                canApplyCategoryFilters &&
                !isEditMode &&
                !isTemporary &&
                existingDisplay &&
                !isCategoryField(item)
            ) {
                const mergedDisplay = mergeDimensionIntoDisplayState(
                    existingDisplay.filters,
                    item,
                    index,
                );
                const updatingFilterIds = mergedDisplay.filters.dimensions
                    .filter((filter) => isCategoryField(filter))
                    .map((filter) => filter.id);
                setTabCategoryDisplayFilters((prev) => ({
                    ...prev,
                    [uuid]: {
                        filters: mergedDisplay.filters,
                        updatingFilterIds,
                    },
                }));
                updateTabDimensionFilter(uuid, item, index, isTemporary);

                const committedBase = replaceDimensionFilterAtIndex(
                    tabFilters[uuid] ?? emptyFilters,
                    index,
                    item,
                );
                const generation = bumpTabCategoryGeneration(uuid);
                const requestSignature = projectUuid
                    ? getCategoryFiltersSignature(
                          committedBase,
                          projectUuid,
                          dashboardFilterContext,
                      )
                    : null;

                void initializeCategoryFiltersAsync(
                    mergedDisplay.filters,
                    projectUuid!,
                    dashboardFilterContext,
                )
                    .then((refined) => {
                        if (
                            (tabCategoryInitGenerationRef.current[uuid] ?? 0) !==
                            generation
                        ) {
                            return;
                        }
                        let applied = false;
                        setTabFilters((prev) => {
                            const currentFilters = prev[uuid] ?? emptyFilters;
                            if (
                                !projectUuid ||
                                !requestSignature ||
                                !shouldApplyCategoryInitResult({
                                    requestGeneration: generation,
                                    currentGeneration:
                                        tabCategoryInitGenerationRef.current[
                                            uuid
                                        ] ?? 0,
                                    requestSignature,
                                    currentFilters,
                                    projectUuid,
                                    dashboardContext: dashboardFilterContext,
                                })
                            ) {
                                return prev;
                            }
                            applied = true;
                            markTabCategoryProcessed(uuid, refined);
                            return { ...prev, [uuid]: refined };
                        });
                        if (applied) {
                            clearTabCategoryDisplay(uuid);
                        }
                    })
                    .catch(() => {
                        if (
                            (tabCategoryInitGenerationRef.current[uuid] ?? 0) ===
                            generation
                        ) {
                            clearTabCategoryDisplay(uuid);
                        }
                    });
                return;
            }

            if (
                !canApplyCategoryFilters ||
                !isCategoryField(item) ||
                isEditMode ||
                !hasSelectedValue ||
                isTemporary
            ) {
                updateTabDimensionFilter(uuid, item, index, isTemporary);
                return;
            }

            const newValue = String(item.values![0]);
            // 快速连选：以最新展示态为起点，避免丢掉尚未提交的选择
            const baseFilters =
                existingDisplay?.filters ?? tabFilters[uuid] ?? emptyFilters;
            const displayState = buildOptimisticCategoryDisplayState(
                baseFilters,
                item,
                index,
            );
            setTabCategoryDisplayFilters((prev) => ({
                ...prev,
                [uuid]: displayState,
            }));
            setHaveTabFiltersChanged((prev) => ({
                ...prev,
                [uuid]: true,
            }));

            const committedFilters = tabFilters[uuid] ?? emptyFilters;
            const generation = bumpTabCategoryGeneration(uuid);
            const requestSignature = projectUuid
                ? getCategoryFiltersSignature(
                      committedFilters,
                      projectUuid,
                      dashboardFilterContext,
                  )
                : null;

            void updateCascadeWithFieldSearch(
                displayState.filters,
                item,
                newValue,
            )
                .then((refined) => {
                    if (
                        (tabCategoryInitGenerationRef.current[uuid] ?? 0) !==
                        generation
                    ) {
                        return;
                    }
                    let applied = false;
                    setTabFilters((prev) => {
                        const currentFilters = prev[uuid] ?? emptyFilters;
                        if (
                            !projectUuid ||
                            !requestSignature ||
                            !shouldApplyCategoryInitResult({
                                requestGeneration: generation,
                                currentGeneration:
                                    tabCategoryInitGenerationRef.current[
                                        uuid
                                    ] ?? 0,
                                requestSignature,
                                currentFilters,
                                projectUuid,
                                dashboardContext: dashboardFilterContext,
                            })
                        ) {
                            return prev;
                        }

                        applied = true;
                        markTabCategoryProcessed(uuid, refined);
                        return {
                            ...prev,
                            [uuid]: refined,
                        };
                    });
                    if (applied) {
                        setHaveTabFiltersChanged((prev) => ({
                            ...prev,
                            [uuid]: true,
                        }));
                        clearTabCategoryDisplay(uuid);
                    }
                })
                .catch(() => {
                    if (
                        (tabCategoryInitGenerationRef.current[uuid] ?? 0) ===
                        generation
                    ) {
                        clearTabCategoryDisplay(uuid);
                    }
                });
        },
        [
            updateTabDimensionFilter,
            canApplyCategoryFilters,
            tabFilters,
            tabCategoryDisplayFilters,
            setTabFilters,
            setHaveTabFiltersChanged,
            isEditMode,
            updateCascadeWithFieldSearch,
            replaceDimensionFilterAtIndex,
            markTabCategoryProcessed,
            projectUuid,
            dashboardFilterContext,
            bumpTabCategoryGeneration,
            clearTabCategoryDisplay,
        ],
    );

    const wrappedRemoveTabDimensionFilter = useCallback(
        (uuid: string, index: number, isTemporary: boolean) => {
            bumpTabCategoryGeneration(uuid);
            clearTabCategoryDisplay(uuid);
            removeTabDimensionFilter(uuid, index, isTemporary);
        },
        [
            bumpTabCategoryGeneration,
            clearTabCategoryDisplay,
            removeTabDimensionFilter,
        ],
    );

    const wrappedResetTabFilters = useCallback(
        (uuid: string) => {
            bumpTabCategoryGeneration(uuid);
            clearTabCategoryDisplay(uuid);
            resetTabFilters(uuid);
        },
        [bumpTabCategoryGeneration, clearTabCategoryDisplay, resetTabFilters],
    );

    const [resultsCacheTimes, setResultsCacheTimes] = useState<Date[]>([]);
    const [invalidateCache, setInvalidateCache] = useState<boolean>(
        defaultInvalidateCache === true,
    );

    // Event system for filter change tracking
    const { dispatchEmbedEvent } = useEmbedEventEmitter();
    const embed = useEmbed();
    const previousFiltersRef = useRef<DashboardFilters | null>(null);
    const hasNotifiedLockedOverrideRef = useRef(false);

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

    // 按 order 排序后的第一个可选 tab（view 模式跳过 hidden）
    const firstTabByOrder = useMemo(() => {
        if (!dashboardTabs?.length) return undefined;
        const sorted = [...dashboardTabs].sort((a, b) => a.order - b.order);
        const selectable = isEditMode
            ? sorted
            : sorted.filter((tab) => !tab.hidden);
        return (selectable.length > 0 ? selectable : sorted)[0];
    }, [dashboardTabs, isEditMode]);

    // 同步当前 tab：URL > 本地上次选中 > 首个可见；切 tab 时写入缓存
    useEffect(() => {
        if (!dashboardTabs?.length) return;

        const rememberedTabUuid =
            tabUuid ?? getDashboardLastTabUuid(dashboardUuid) ?? undefined;

        const resolvedTab = getActiveTabForTabs(
            dashboardTabs,
            rememberedTabUuid,
            isEditMode,
            undefined,
        );

        setActiveTab((currentActiveTab) =>
            getActiveTabForTabs(
                dashboardTabs,
                rememberedTabUuid,
                isEditMode,
                currentActiveTab,
            ),
        );

        if (resolvedTab?.uuid) {
            setDashboardActiveTabUuid(dashboardUuid, resolvedTab.uuid);
        }

        if (!resolvedTab || embedToken || dashboardTabs.length <= 1 || !projectUuid) {
            return;
        }

        // URL 未带 tab，或指向不可选 tab 时，纠正到解析后的 tab（含上次缓存）
        if (!tabUuid || tabUuid !== resolvedTab.uuid) {
            const base = `/projects/${projectUuid}/dashboards/${dashboardUuid}/${
                mode || 'view'
            }`;
            void navigate(`${base}/tabs/${resolvedTab.uuid}`, {
                replace: true,
            });
        }
    }, [
        dashboardTabs,
        tabUuid,
        isEditMode,
        firstTabByOrder,
        embedToken,
        projectUuid,
        dashboardUuid,
        mode,
        navigate,
        getDashboardLastTabUuid,
        setDashboardActiveTabUuid,
    ]);

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
    const [chartsWithDateDimension, setChartsWithDateDimension] = useState<
        Set<string>
    >(() => new Set());

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
            let droppedLockedOverrides = 0;
            const hasTabs = (currentDashboard.tabs?.length ?? 0) > 0;

            // Step 1: Start with base filters
            let updatedDashboardFilters = clone(currentDashboard.filters);

            // Step 2: Apply SDK Filters
            const sdkFilters =
                embed.mode === 'sdk' && embed.filters ? embed.filters : [];
            if (sdkFilters.length > 0) {
                const convertedSdkFilters = sdkFilters.map((sdkFilter) =>
                    convertSdkFilterToDashboardFilter(sdkFilter),
                );
                const sdkStripResult = stripOverridesForLockedFiltersOnTab(
                    currentDashboard.filters,
                    {
                        dimensions: convertedSdkFilters,
                        metrics: [],
                        tableCalculations: [],
                    },
                    activeTab?.uuid,
                    hasTabs,
                );
                droppedLockedOverrides += sdkStripResult.droppedCount;
                const lockedSavedDimensions =
                    currentDashboard.filters.dimensions.filter((rule) =>
                        isFilterLockedOnTab(rule, activeTab?.uuid, hasTabs),
                    );
                updatedDashboardFilters.dimensions = [
                    ...lockedSavedDimensions,
                    ...sdkStripResult.filters.dimensions,
                ];
            }

            // Apply overrides from URL — but never override filters locked on
            // the currently active tab (or dashboard-wide if there are no tabs).
            if (hasSavedFiltersOverrides(overrides)) {
                const urlStripResult = stripOverridesForLockedFiltersOnTab(
                    currentDashboard.filters,
                    overrides,
                    activeTab?.uuid,
                    hasTabs,
                );
                overrides = urlStripResult.filters;
                droppedLockedOverrides += urlStripResult.droppedCount;
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
                        metrics: applyMetricOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    setHaveFiltersChanged(false);
                }
            } else {
                if (hasSavedFiltersOverrides(overrides)) {
                    updatedDashboardFilters = {
                        ...updatedDashboardFilters,
                        dimensions: applyDimensionOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                        metrics: applyMetricOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    setHaveFiltersChanged(false);
                }
            }

            if (
                droppedLockedOverrides > 0 &&
                !hasNotifiedLockedOverrideRef.current
            ) {
                hasNotifiedLockedOverrideRef.current = true;
                showToastInfo({
                    title: t(
                        'components_dashboard_filter.filter_locked_toast.title',
                    ),
                    subtitle:
                        droppedLockedOverrides === 1
                            ? t(
                                  'components_dashboard_filter.filter_locked_toast.override_single',
                              )
                            : t(
                                  'components_dashboard_filter.filter_locked_toast.override_many',
                                  { count: droppedLockedOverrides },
                              ),
                });
            }

            // Step 3: Apply interactivity filtering for embedded dashboards
            updatedDashboardFilters = applyInteractivityFiltering(
                updatedDashboardFilters,
            );

            // Step 4: Set dashboard filters; category init runs in dedicated effect
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
        canApplyCategoryFilters,
        isEditMode,
        setHaveFiltersChanged,
        setDashboardFilters,
        setOriginalDashboardFilters,
        setTabFilters,
        applyInteractivityFiltering,
        activeTab,
        showToastInfo,
        t,
    ]);
    // Initialize global category filters once dashboard filters and slug context are ready
    useEffect(() => {
        if (dashboardFilters === emptyFilters) return;
        runGlobalCategoryInit(dashboardFilters);
    }, [
        canApplyCategoryFilters,
        projectUuid,
        dashboardSlug,
        dashboardName,
        dashboardFilters,
        runGlobalCategoryInit,
    ]);

    // Lazily initialize category filters for the active tab only
    const activeTabUuid = activeTab?.uuid;
    const activeTabFilters = activeTabUuid
        ? tabFilters[activeTabUuid]
        : undefined;

    useEffect(() => {
        if (!canApplyCategoryFilters || !projectUuid || isEditMode) return;
        if (!activeTabUuid || !activeTabFilters) return;

        runTabCategoryInit(activeTabUuid, activeTabFilters);
    }, [
        canApplyCategoryFilters,
        projectUuid,
        isEditMode,
        dashboardSlug,
        dashboardName,
        activeTabUuid,
        activeTabFilters,
        runTabCategoryInit,
    ]);

    const {
        filters: safeTemporaryFilters,
        droppedCount: lockedTemporaryDroppedCount,
    } = useMemo(() => {
        if (!dashboard?.filters) {
            return { filters: dashboardTemporaryFilters, droppedCount: 0 };
        }
        return stripOverridesForLockedFiltersOnTab(
            dashboard.filters,
            dashboardTemporaryFilters,
            activeTab?.uuid,
            (dashboard.tabs?.length ?? 0) > 0,
        );
    }, [
        dashboard?.filters,
        dashboard?.tabs,
        dashboardTemporaryFilters,
        activeTab,
    ]);

    useEffect(() => {
        if (lockedTemporaryDroppedCount === 0) return;
        if (hasNotifiedLockedOverrideRef.current) return;
        hasNotifiedLockedOverrideRef.current = true;
        const hasTabs = (dashboard?.tabs?.length ?? 0) > 0;
        const scopeSuffix = hasTabs
            ? t('components_dashboard_filter.filter_locked_toast.scope_tab')
            : '';
        showToastInfo({
            title: t('components_dashboard_filter.filter_locked_toast.title'),
            subtitle:
                lockedTemporaryDroppedCount === 1
                    ? t(
                          'components_dashboard_filter.filter_locked_toast.temp_single',
                          { scope: scopeSuffix },
                      )
                    : t(
                          'components_dashboard_filter.filter_locked_toast.temp_many',
                          {
                              count: lockedTemporaryDroppedCount,
                              scope: scopeSuffix,
                          },
                      ),
        });
    }, [lockedTemporaryDroppedCount, showToastInfo, dashboard?.tabs, t]);

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
            safeTemporaryFilters?.dimensions?.length === 0 &&
            safeTemporaryFilters?.metrics?.length === 0
        ) {
            newParams.delete('tempFilters');
        } else {
            newParams.set(
                'tempFilters',
                JSON.stringify(
                    compressDashboardFiltersToParam(safeTemporaryFilters),
                ),
            );
        }

        // overridden filters
        if (!hasSavedFiltersOverrides(overridesForSavedDashboardFilters)) {
            newParams.delete('filters');
        } else {
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
        safeTemporaryFilters,
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
            const { filters: safeOverrides } =
                stripOverridesForLockedFiltersOnTab(
                    dashboard.filters,
                    overridesForSavedDashboardFilters,
                    activeTab?.uuid,
                    (dashboard.tabs?.length ?? 0) > 0,
                );

            if (!hasSavedFiltersOverrides(safeOverrides)) {
                return;
            }

            setDashboardFilters((prevFilters) => {
                const updatedFilters: DashboardFilters = {
                    ...prevFilters,
                    dimensions: applyDimensionOverrides(
                        prevFilters,
                        safeOverrides,
                    ),
                    metrics: applyMetricOverrides(prevFilters, safeOverrides),
                };
                // Category refine is handled by the dedicated global category effect
                return updatedFilters;
            });
        }
    }, [
        dashboard?.filters,
        dashboard?.tabs,
        overridesForSavedDashboardFilters,
        activeTab,
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
            // Category refine is handled by the dedicated global category effect
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
                Object.entries(filters).reduce(
                    (acc, [uuid, filter]) => {
                        acc[uuid] =
                            convertDashboardFiltersParamToDashboardFilters(
                                filter as DashboardFiltersFromSearchParam,
                            );
                        return acc;
                    },
                    {} as Record<string, DashboardFilters>,
                ),
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
            Record<string, DashboardFilterableField[]>
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
                  Record<string, DashboardFilterableField>
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

    // Filters that are required to have a value set (single required + any-of groups)
    const requiredDashboardFilters = useMemo(() => {
        const unmet = getUnmetFilterRequirements(dashboardFilters);
        return unmet.reduce<Pick<DashboardFilterRule, 'id' | 'label'>[]>(
            (acc, requirement) => {
                const filters =
                    requirement.type === 'single'
                        ? [requirement.filter]
                        : requirement.filters;
                filters.forEach((f) => {
                    if (acc.some((existing) => existing.id === f.id)) {
                        return;
                    }
                    const field = allFilterableFieldsMap[f.target.fieldId];
                    let label = '';
                    if (f.label) {
                        label = f.label;
                    } else if (field) {
                        label = getConditionalRuleLabelFromItem(f, field).field;
                    }
                    acc.push({ id: f.id, label });
                });
                return acc;
            },
            [],
        );
    }, [
        dashboardFilters,
        allFilterableFieldsMap,
        getConditionalRuleLabelFromItem,
    ]);

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
        resetDashboardFilters: wrappedResetDashboardFilters,
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
        chartsWithDateDimension,
        setChartsWithDateDimension,
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
        getDisplayedMergedFiltersForTab,
        tabCategoryDisplayFilters,
        addTabDimensionFilter,
        updateTabDimensionFilter: wrappedUpdateTabDimensionFilter,
        removeTabDimensionFilter: wrappedRemoveTabDimensionFilter,
        resetTabFilters: wrappedResetTabFilters,
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
            {mountDefaultColorSyncProvider ? (
                <DashboardChartColorSyncProvider>
                    {children}
                </DashboardChartColorSyncProvider>
            ) : (
                children
            )}
        </DashboardContext.Provider>
    );
};

export default DashboardProvider;

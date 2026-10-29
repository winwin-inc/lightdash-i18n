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
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import {
    isEmptyTabFilters,
    mergeFiltersForTab,
    useDashboardTabFilters,
} from '../../hooks/dashboard/useDashboardTabFilters';
import useToaster from '../../hooks/toaster/useToaster';
import { hasSavedFiltersOverrides } from '../../hooks/useSavedDashboardFiltersOverrides';
import {
    buildOptimisticCategoryDisplayState,
    decideCategoryInit,
    getDescendantCategoryFilterIds,
    mergeDimensionIntoDisplayState,
    resolveActiveTabCategoryInit,
    shouldApplyCategoryInitResult,
    shouldStartCategoryInitTask,
    type TabCategoryDisplayState,
} from '../../utils/categoryFilterInitHelpers';
import {
    areFilterDimensionsEqual,
    buildCategoryChain,
    createCategoryRequestSession,
    getCategoryChainFilters,
    getCategoryFiltersSignature,
    getCategoryFilterUpdateValue,
    hasCategoryFilters,
    initializeCategoryFiltersAsync,
    isCategoryField,
    logCategoryCascade,
    shouldCascadeCategoryFilterUpdate,
    updateCategoryFilterCascadeAsync,
    updateCrossScopeCategoryCascadeAsync,
    type CategoryFilterLocation,
    type CategoryRequestSession,
    type CategoryResolutionIssue,
} from '../../utils/categoryFilters';
import {
    applySelectionToTabFilters,
    restoreAuthorDefaults,
    type FilterNamespace,
} from '../../utils/userFilterSelections';
import { isWarehouseResourceLimitError } from '../../utils/warehouseError';
import DashboardChartColorSyncProvider from '../DashboardChartColorSync/DashboardChartColorSyncProvider';
import DashboardContext from './context';
import { type SqlChartTileMetadata } from './types';

/**
 * 跨 Tab 继承的结果：接收方 Tab 与它们同步后的筛选器。
 */
type CrossTabSyncResult = {
    tabFilters: Record<string, DashboardFilters>;
    changedTabUuids: string[];
};

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
    const { showToastInfo, showToastError, showToastWarning } = useToaster();

    /**
     * 类目解析异常（请求失败 / 没有候选值）的用户提示。
     *
     * 解析失败时前端会「保留原值」，如果不做任何提示，
     * 用户看到的现象就是「父级绑定了但联动没生效」，无法定位原因。
     * 相同类型用固定 key：重复发生时更新同一个 toast，而不是刷一屏。
     */
    const handleCategoryResolutionIssue = useCallback(
        (issue: CategoryResolutionIssue) => {
            if (issue.kind === 'error') {
                if (isWarehouseResourceLimitError(issue.error)) {
                    showToastError({
                        key: 'warehouse-resource-limit',
                        title: t('hooks_query_error.warehouse_resource_limit'),
                        autoClose: 10000,
                    });
                    return;
                }
                showToastError({
                    key: 'dashboard-category-resolution-failed',
                    title: t('hooks_query_error.category_resolution_failed'),
                    autoClose: 10000,
                });
                return;
            }

            showToastWarning({
                key: 'dashboard-category-no-candidates',
                title: t('hooks_query_error.category_no_candidates'),
                autoClose: 10000,
            });
        },
        [showToastError, showToastWarning, t],
    );

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
    // 访问过的 Tab：只有访问过的 Tab 才允许发起 tile 查询，
    // 避免打开多 Tab 看板时一次性把所有 Tab 的数仓查询全打出去排队。
    // 引用保持稳定：只有新增 Tab 时才换新 Set，避免无关重渲染。
    const [visitedTabUuids, setVisitedTabUuids] = useState<Set<string>>(
        () => new Set(),
    );
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
        originalDashboardFilters,
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

    /**
     * 可恢复的类目筛选器：服务端保存的筛选器还有值，但当前状态里被旧版本
     * 「类目不存在就清空并禁用」清成了空值 + disabled。
     *
     * 只有这类筛选器才允许重新解析并恢复。被禁用的筛选器默认不参与自动赋值
     * （既有语义：禁用 = 没有配置默认值，不能给它套默认值）。
     */
    const recoverableCategoryFilterIds = useMemo(() => {
        const ids = new Set<string>();
        originalDashboardFilters.dimensions.forEach((saved) => {
            if (!saved.values || saved.values.length === 0) return;
            const current = dashboardFilters.dimensions.find(
                (d) => d.id === saved.id,
            );
            if (!current) return;
            const currentHasValue =
                current.values !== undefined && current.values.length > 0;
            if (current.disabled === true && !currentHasValue) {
                ids.add(saved.id);
            }
        });
        return Array.from(ids);
    }, [originalDashboardFilters, dashboardFilters]);

    // 类目联动按 field/search 实际数据（含 dashboardSlug → dbt RLS），不依赖 Admin 类目接口
    const dashboardSlug = (dashboard || embedDashboard)?.slug;
    const dashboardName = (dashboard || embedDashboard)?.name;
    // dashboardUuid 全局唯一，slug 只在项目内唯一（跨项目可能撞车），
    // 优先传 uuid 让服务端反查到正确的看板
    const currentDashboardUuid = (dashboard || embedDashboard)?.uuid;
    const dashboardFilterContext = useMemo(
        () => ({
            dashboardSlug,
            dashboardName,
            dashboardUuid: currentDashboardUuid,
        }),
        [dashboardSlug, dashboardName, currentDashboardUuid],
    );
    // 须有 dashboardSlug，避免未就绪时按 NA 绕过 dbt 控制码
    const canApplyCategoryFilters =
        !isEditMode && !!projectUuid && !!dashboardSlug;

    const globalCategoryInitGenerationRef = useRef(0);
    // cascade（用户手动改类目）与 init（自动初始化）使用独立的 generation：
    // 自动初始化不应作废用户刚刚的选择，否则用户选中的值会被静默丢弃。
    const globalCategoryCascadeGenerationRef = useRef(0);
    const globalCategoryProcessedSignatureRef = useRef<string | null>(null);
    const globalCategoryPendingSignatureRef = useRef<string | null>(null);
    const tabCategoryInitGenerationRef = useRef<Record<string, number>>({});
    const tabCategoryCascadeGenerationRef = useRef<Record<string, number>>({});
    const tabCategoryProcessedSignatureRef = useRef<Record<string, string>>({});
    const tabCategoryPendingSignatureRef = useRef<Record<string, string>>({});

    /* ------------------------------------------------------------------ *
     * 类目请求会话
     *
     * 同一个作用域开始新的操作时，取消上一个操作的请求：
     * - 排队中的请求直接丢弃（不会发到仓库）
     * - 在途的请求被 abort（立刻释放仓库引擎的查询内存）
     * - 旧操作的结果不会写回
     *
     * 会话与 generation 一一对应：init 与 cascade 各自独立，
     * 手动改动会同时作废在途的 init（与现有 generation 语义一致）。
     * ------------------------------------------------------------------ */
    const globalCategoryInitSessionRef = useRef<CategoryRequestSession | null>(
        null,
    );
    const globalCategoryCascadeSessionRef =
        useRef<CategoryRequestSession | null>(null);
    const tabCategoryInitSessionRef = useRef<
        Record<string, CategoryRequestSession>
    >({});
    const tabCategoryCascadeSessionRef = useRef<
        Record<string, CategoryRequestSession>
    >({});

    const startGlobalCategoryInitSession = useCallback(() => {
        globalCategoryInitSessionRef.current?.cancel();
        const session = createCategoryRequestSession();
        globalCategoryInitSessionRef.current = session;
        return session;
    }, []);

    const startGlobalCategoryCascadeSession = useCallback(() => {
        // 手动改动作废在途的自动初始化
        globalCategoryInitSessionRef.current?.cancel();
        globalCategoryInitSessionRef.current = null;
        // 并作废更早的一次手动联动
        globalCategoryCascadeSessionRef.current?.cancel();
        const session = createCategoryRequestSession();
        globalCategoryCascadeSessionRef.current = session;
        return session;
    }, []);

    const startTabCategoryInitSession = useCallback((targetTabUuid: string) => {
        tabCategoryInitSessionRef.current[targetTabUuid]?.cancel();
        const session = createCategoryRequestSession();
        tabCategoryInitSessionRef.current[targetTabUuid] = session;
        return session;
    }, []);

    const startTabCategoryCascadeSession = useCallback(
        (targetTabUuid: string) => {
            // 手动改动作废在途的自动初始化
            tabCategoryInitSessionRef.current[targetTabUuid]?.cancel();
            delete tabCategoryInitSessionRef.current[targetTabUuid];
            // 并作废更早的一次手动联动
            tabCategoryCascadeSessionRef.current[targetTabUuid]?.cancel();
            const session = createCategoryRequestSession();
            tabCategoryCascadeSessionRef.current[targetTabUuid] = session;
            return session;
        },
        [],
    );

    /**
     * 作废某个 Tab 在途的类目初始化（不新建会话）。
     *
     * 场景：Tab A 的值被 Tab B 继承时，Tab B 的初始化结果已经没有意义
     * （父级取值已经变了），继续跑只会多打一次仓库并可能覆盖继承结果。
     */
    const cancelTabCategoryInitSession = useCallback(
        (targetTabUuid: string) => {
            tabCategoryInitSessionRef.current[targetTabUuid]?.cancel();
            delete tabCategoryInitSessionRef.current[targetTabUuid];
        },
        [],
    );

    // 首屏类目解析状态：解析完成前不发起图表查询。
    // 否则图表会先按「类目还没解析出来」的值跑一次，类目解析完再跑第二次，
    // 表现为看板加载时图表先出一版数据、随后又刷新一次。
    const [
        isGlobalCategoryResolutionPending,
        setIsGlobalCategoryResolutionPending,
    ] = useState(false);
    const [pendingTabCategoryResolutions, setPendingTabCategoryResolutions] =
        useState<Record<string, boolean>>({});
    /**
     * 类目解析的兜底超时：**每个作用域各一个**（`global` 或 tabUuid）。
     *
     * 之前全局只用一个 timer：任何一个作用域解析结束都会 `clearTimeout`，
     * 把其它作用域的兜底一起取消。跨 Tab 继承会给未打开的 Tab 置 pending，
     * 一旦兜底被取消、而那个 Tab 又一直没被打开（移动端只显示一个 Tab 时很常见），
     * pending 就永久为 true → 该 Tab 的图表永远不查询 / 一直 loading。
     */
    const categoryResolutionTimeoutsRef = useRef<
        Map<string, ReturnType<typeof setTimeout>>
    >(new Map());

    // 首屏最多等类目解析这么久：超时后先放行图表，类目解析完成后再校正一次，
    // 避免 field/search 卡住时看板一直转圈
    const CATEGORY_RESOLUTION_MAX_WAIT_MS = 10000;

    const releaseCategoryResolution = useCallback((key: string) => {
        if (key === 'global') {
            setIsGlobalCategoryResolutionPending(false);
            return;
        }
        setPendingTabCategoryResolutions((prev) => {
            if (prev[key] === false) return prev;
            return { ...prev, [key]: false };
        });
    }, []);

    const armCategoryResolutionTimeout = useCallback(
        (key: string) => {
            const timeouts = categoryResolutionTimeoutsRef.current;
            const existing = timeouts.get(key);
            if (existing) {
                clearTimeout(existing);
            }
            timeouts.set(
                key,
                setTimeout(() => {
                    timeouts.delete(key);
                    releaseCategoryResolution(key);
                }, CATEGORY_RESOLUTION_MAX_WAIT_MS),
            );
        },
        [releaseCategoryResolution],
    );

    const clearCategoryResolutionTimeout = useCallback((key: string) => {
        const timeouts = categoryResolutionTimeoutsRef.current;
        const existing = timeouts.get(key);
        if (existing) {
            clearTimeout(existing);
            timeouts.delete(key);
        }
    }, []);

    useEffect(
        () => () => {
            categoryResolutionTimeoutsRef.current.forEach((timeout) =>
                clearTimeout(timeout),
            );
            categoryResolutionTimeoutsRef.current.clear();
        },
        [],
    );

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

    /**
     * Tab 类目链的签名：必须覆盖全局祖先。
     * 全局二级的值变化时，Tab 三级需要重新解析，签名不同才会触发新一轮 init。
     */
    const getTabCategoryChainSignature = useCallback(
        (
            targetTabUuid: string,
            tabFiltersForTab: DashboardFilters,
            globalFiltersForChain?: DashboardFilters,
        ) => {
            if (!projectUuid) return null;
            return getCategoryFiltersSignature(
                getCategoryChainFilters(
                    buildCategoryChain(
                        {
                            globalFilters:
                                globalFiltersForChain ?? dashboardFilters,
                            tabFilters: { [targetTabUuid]: tabFiltersForTab },
                        },
                        targetTabUuid,
                    ),
                ),
                projectUuid,
                dashboardFilterContext,
            );
        },
        [projectUuid, dashboardFilterContext, dashboardFilters],
    );

    const markTabCategoryProcessed = useCallback(
        (
            targetTabUuid: string,
            filters: DashboardFilters,
            globalFiltersForChain?: DashboardFilters,
        ) => {
            const signature = getTabCategoryChainSignature(
                targetTabUuid,
                filters,
                globalFiltersForChain,
            );
            if (!signature) return;
            tabCategoryProcessedSignatureRef.current[targetTabUuid] = signature;
        },
        [getTabCategoryChainSignature],
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
                    pendingSignature: globalCategoryPendingSignatureRef.current,
                }) ||
                !projectUuid ||
                decision.action !== 'start'
            ) {
                logCategoryCascade('global init skipped', {
                    action: decision.action,
                    canApplyCategoryFilters,
                    hasProjectUuid: !!projectUuid,
                    pendingSignature:
                        globalCategoryPendingSignatureRef.current ?? null,
                    processedSignature:
                        globalCategoryProcessedSignatureRef.current ?? null,
                });
                // 没有可执行的任务（例如没有类目筛选器）：首屏不再等待类目解析
                if (!globalCategoryPendingSignatureRef.current) {
                    setIsGlobalCategoryResolutionPending(false);
                }
                return;
            }

            const generation = ++globalCategoryInitGenerationRef.current;
            const { signature } = decision;
            globalCategoryPendingSignatureRef.current = signature;
            // 新的自动初始化：作废上一个初始化会话的请求
            const session = startGlobalCategoryInitSession();

            void initializeCategoryFiltersAsync(
                filters,
                projectUuid,
                dashboardFilterContext,
                {
                    recoverableFilterIds: recoverableCategoryFilterIds,
                    session,
                    onResolutionIssue: handleCategoryResolutionIssue,
                },
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
                        clearCategoryResolutionTimeout('global');
                        // 类目解析结束：图表可以按最终类目发起查询
                        setIsGlobalCategoryResolutionPending(false);
                    }
                });
        },
        [
            canApplyCategoryFilters,
            projectUuid,
            dashboardFilterContext,
            recoverableCategoryFilterIds,
            clearCategoryResolutionTimeout,
            setDashboardFilters,
            startGlobalCategoryInitSession,
            handleCategoryResolutionIssue,
        ],
    );

    // 按 field/search 实际类目初始化由 runGlobalCategoryInit / runTabCategoryInit 负责

    // 父改子联动：按 field/search 实际类目纠正选中值（Tab 作用域）
    //
    // 链 = 全局筛选器 + 当前 Tab 筛选器：Tab 筛选器可以显式绑定全局父级，
    // 父级查找、级联条件（field/search 的左侧筛选）都要跨作用域。
    const updateTabCascadeWithFieldSearch = useCallback(
        async (
            targetTabUuid: string,
            filters: DashboardFilters,
            changedFilter: DashboardFilterRule,
            newValue: string | null,
            session?: CategoryRequestSession,
        ): Promise<DashboardFilters> => {
            if (!canApplyCategoryFilters || !projectUuid) return filters;
            const location: CategoryFilterLocation = {
                scope: 'tab',
                tabUuid: targetTabUuid,
            };
            const cascaded = await updateCategoryFilterCascadeAsync(
                filters,
                changedFilter,
                newValue,
                projectUuid,
                dashboardFilterContext,
                {
                    recoverableFilterIds: recoverableCategoryFilterIds,
                    scope: {
                        location,
                        chain: buildCategoryChain(
                            {
                                globalFilters: dashboardFilters,
                                tabFilters: { [targetTabUuid]: filters },
                            },
                            targetTabUuid,
                        ),
                    },
                    session,
                    onResolutionIssue: handleCategoryResolutionIssue,
                },
            );
            // 用户刚刚手动选中的值优先：后续的自动解析必须跳过这一级，
            // 否则会把用户的显式选择重置成别的类目（或直接清空）。
            //
            // 另外只处理「被改这一级的后代」：祖先取值没变、且已经校验过，
            // 再查一遍纯属多余请求（一次改四级的操作会因此少发 3 个查询）。
            return initializeCategoryFiltersAsync(
                cascaded,
                projectUuid,
                dashboardFilterContext,
                {
                    skipFilterIds: [changedFilter.id],
                    onlyFilterIds: getDescendantCategoryFilterIds(
                        cascaded,
                        changedFilter.target.fieldId,
                    ),
                    recoverableFilterIds: recoverableCategoryFilterIds,
                    scope: {
                        location,
                        chain: buildCategoryChain(
                            {
                                globalFilters: dashboardFilters,
                                tabFilters: { [targetTabUuid]: cascaded },
                            },
                            targetTabUuid,
                        ),
                    },
                    session,
                    onResolutionIssue: handleCategoryResolutionIssue,
                },
            );
        },
        [
            canApplyCategoryFilters,
            projectUuid,
            dashboardFilterContext,
            recoverableCategoryFilterIds,
            dashboardFilters,
            handleCategoryResolutionIssue,
        ],
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
    // (定义在选择层之后：重置时需要一并清除用户选择与本地记忆)

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

    /* ------------------------------------------------------------------ */
    /*                     跨 Tab 取值继承与统一联动                       */
    /* ------------------------------------------------------------------ */

    /**
     * 跨 Tab 继承：把用户的显式选择同步到所有含该字段规则的 Tab。
     *
     * 目标 Tab 没有该字段、或与来源不兼容（operator / settings 形态 /
     * 类目层级 / 父级不同、被作者禁用）时跳过：不新建规则、不覆盖作者配置。
     *
     * 来源 Tab 自身不参与同步：它的写入由原有的更新路径负责，
     * 否则会与类目级联的签名校验冲突。
     *
     * 返回同步结果：接收方 Tab 与它们的新规则，供后续统一联动使用。
     * （写入用函数式更新，避免用旧快照覆盖并发的写回；返回值取自同一份快照，
     *   规则定义（id / 层级 / 父级）不会在并发中变化。）
     */
    const syncSelectionToAllTabs = useCallback(
        (
            rule: DashboardFilterRule,
            namespace: FilterNamespace,
            sourceTabUuid?: string,
        ): CrossTabSyncResult => {
            const snapshot = applySelectionToTabFilters(
                tabFilters,
                rule,
                namespace,
                sourceTabUuid,
            );
            setTabFilters((prev) => {
                const result = applySelectionToTabFilters(
                    prev,
                    rule,
                    namespace,
                    sourceTabUuid,
                );
                return result.changedTabUuids.length > 0
                    ? result.tabFilters
                    : prev;
            });
            return {
                tabFilters: snapshot.tabFilters,
                changedTabUuids: snapshot.changedTabUuids,
            };
        },
        [tabFilters, setTabFilters],
    );

    /**
     * 查看态移除全局筛选器：移除运行时筛选器。
     */
    const wrappedRemoveDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            removeDimensionDashboardFilter(index, isTemporary);
        },
        [removeDimensionDashboardFilter],
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

    // tab 级联（用户手动改类目）使用独立 generation：
    // 自动初始化不应作废用户刚刚的选择。
    const bumpTabCategoryCascadeGeneration = useCallback(
        (targetTabUuid: string) => {
            const generation =
                (tabCategoryCascadeGenerationRef.current[targetTabUuid] ?? 0) +
                1;
            tabCategoryCascadeGenerationRef.current[targetTabUuid] = generation;
            return generation;
        },
        [],
    );

    /**
     * 作废一组 Tab 的类目解析状态（重置 / 恢复作者默认值时使用）。
     *
     * 必须同时作废：在途的 init 与 cascade 会话、两个 generation、
     * pending / processed 签名与展示态。只 bump init generation 不够：
     * 在途的“父改子”级联晚到时会把重置后的值又写回筛选器。
     */
    const invalidateTabCategoryState = useCallback(
        (tabUuids: string[]) => {
            Array.from(new Set(tabUuids)).forEach((targetTabUuid) => {
                bumpTabCategoryGeneration(targetTabUuid);
                bumpTabCategoryCascadeGeneration(targetTabUuid);
                cancelTabCategoryInitSession(targetTabUuid);
                tabCategoryCascadeSessionRef.current[targetTabUuid]?.cancel();
                delete tabCategoryCascadeSessionRef.current[targetTabUuid];
                delete tabCategoryPendingSignatureRef.current[targetTabUuid];
                delete tabCategoryProcessedSignatureRef.current[targetTabUuid];
                clearTabCategoryDisplay(targetTabUuid);
            });
        },
        [
            bumpTabCategoryGeneration,
            bumpTabCategoryCascadeGeneration,
            cancelTabCategoryInitSession,
            clearTabCategoryDisplay,
        ],
    );

    // 父改子联动（全局作用域）：跨作用域传播到各 Tab 的子类目筛选器
    //
    // 全局一级/二级的变化需要驱动：
    // - 全局范围内的子类目（二级 → 三级/四级）
    // - 各 Tab 里绑定了全局父级的子类目（全局二级 → Tab 三级 → Tab 四级）
    const updateGlobalCascadeWithFieldSearch = useCallback(
        async (
            filters: DashboardFilters,
            changedFilter: DashboardFilterRule,
            newValue: string | null,
            session?: CategoryRequestSession,
        ): Promise<{
            globalFilters: DashboardFilters;
            tabFilters: Record<string, DashboardFilters>;
        }> => {
            if (!canApplyCategoryFilters || !projectUuid) {
                return { globalFilters: filters, tabFilters };
            }
            const cascaded = await updateCrossScopeCategoryCascadeAsync(
                { globalFilters: filters, tabFilters },
                changedFilter,
                newValue,
                projectUuid,
                dashboardFilterContext,
                {
                    recoverableFilterIds: recoverableCategoryFilterIds,
                    session,
                    onResolutionIssue: handleCategoryResolutionIssue,
                    // 只级联当前 Tab：其它 Tab 切过去时由各自的懒初始化重算，
                    // 避免一次全局类目变更触发 N 个 Tab × M 个子孙的请求。
                    activeTabUuid: activeTab?.uuid ?? null,
                },
            );
            // 用户刚刚手动选中的值优先：后续的自动解析必须跳过这一级，
            // 否则会把用户的显式选择重置成别的类目（或直接清空）。
            // 与 Tab 作用域一致：只重算被改级别的后代（祖先没变、已校验过）。
            const refinedGlobal = await initializeCategoryFiltersAsync(
                cascaded.globalFilters,
                projectUuid,
                dashboardFilterContext,
                {
                    skipFilterIds: [changedFilter.id],
                    onlyFilterIds: getDescendantCategoryFilterIds(
                        cascaded.globalFilters,
                        changedFilter.target.fieldId,
                    ),
                    recoverableFilterIds: recoverableCategoryFilterIds,
                    session,
                    onResolutionIssue: handleCategoryResolutionIssue,
                },
            );
            return {
                globalFilters: refinedGlobal,
                tabFilters: cascaded.tabFilters,
            };
        },
        [
            canApplyCategoryFilters,
            projectUuid,
            dashboardFilterContext,
            recoverableCategoryFilterIds,
            tabFilters,
            activeTab?.uuid,
            handleCategoryResolutionIssue,
        ],
    );

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
            const isCategoryFilterUpdate = isCategoryField(item);
            // 清空类目筛选器（「任何值」）同样要级联：
            // 父级没有值 → 子级（全局子级 + 各 Tab 里绑定该父级的子级）
            // 必须一起清空，否则会出现「父级是任何值、子级还留着旧类目」的矛盾状态。
            const isClearingCategory =
                isCategoryFilterUpdate && !hasSelectedValue;
            const shouldCascade = shouldCascadeCategoryFilterUpdate({
                filter: item,
                isEdit,
                isTemporary,
                canApplyCategoryFilters,
            });

            if (!shouldCascade) {
                // 诊断：为什么没走类目联动
                logCategoryCascade('global filter update: cascade skipped', {
                    filterId: item.id,
                    fieldId: item.target.fieldId,
                    values: item.values,
                    canApplyCategoryFilters,
                    isCategoryFilter: isCategoryFilterUpdate,
                    isEdit,
                    isTemporary,
                    hasSelectedValue,
                });
                // 临时筛选器（图表交叉筛选）不做类目联动：
                // 联动的结果会写回永久筛选器，污染看板自身的类目配置。
                originalUpdateDimensionDashboardFilter(
                    item,
                    index,
                    isTemporary,
                    isEdit,
                );
                return;
            }

            // 清空时传 null：级联把父级视为「没有值」，
            // 后代类目随之清空（cascadeChildrenAsync 的 clear 分支）。
            const newValue = getCategoryFilterUpdateValue(item);
            logCategoryCascade('global filter update: cascade start', {
                filterId: item.id,
                fieldId: item.target.fieldId,
                oldValue:
                    dashboardFilters.dimensions[index]?.values?.[0] ?? null,
                newValue,
                isEdit,
                isTemporary,
                isClearing: isClearingCategory,
            });
            const nextFilters = replaceDimensionFilterAtIndex(
                dashboardFilters,
                index,
                item,
            );

            // 立即应用用户的选择：与普通筛选保持一致（更新筛选状态、记录 saved filter
            // override、标记看板存在未保存改动）。否则用户的类目选择既不会立刻显示，
            // 也无法保存，重新加载后会变回空值。
            originalUpdateDimensionDashboardFilter(
                item,
                index,
                isTemporary,
                isEdit,
            );
            // 用户的显式选择不再需要自动解析：标记为已处理，避免 effect 触发的
            // init 把用户刚选中的类目重置成别的值
            markGlobalCategoryProcessed(nextFilters);

            // 手动改动同时作废在途的 init 与更早的 cascade
            ++globalCategoryInitGenerationRef.current;
            const generation = ++globalCategoryCascadeGenerationRef.current;
            // 手动级联使旧 init 失效，清除 pending 以免挡住后续合法 init
            globalCategoryPendingSignatureRef.current = null;
            // 取消旧会话的请求：排队中的直接丢弃，在途的 abort
            const session = startGlobalCategoryCascadeSession();
            const requestSignature = projectUuid
                ? getCategoryFiltersSignature(
                      nextFilters,
                      projectUuid,
                      dashboardFilterContext,
                  )
                : null;
            void updateGlobalCascadeWithFieldSearch(
                nextFilters,
                item,
                newValue,
                session,
            )
                .then(
                    ({
                        globalFilters: refinedGlobal,
                        tabFilters: refinedTabs,
                    }) => {
                        // 会话已被取消（用户又改了一次）→ 丢弃本次结果，不写回
                        if (session.isCancelled()) return;

                        setDashboardFilters((currentFilters) => {
                            if (
                                !projectUuid ||
                                !requestSignature ||
                                !shouldApplyCategoryInitResult({
                                    requestGeneration: generation,
                                    currentGeneration:
                                        globalCategoryCascadeGenerationRef.current,
                                    requestSignature,
                                    currentFilters,
                                    projectUuid,
                                    dashboardContext: dashboardFilterContext,
                                })
                            ) {
                                return currentFilters;
                            }

                            markGlobalCategoryProcessed(refinedGlobal);
                            return refinedGlobal;
                        });

                        // 跨作用域级联：全局父级的变化要传播到各 Tab 的子类目筛选器
                        // （级联基于闭包里的 tabFilters，这里用同一份快照判断哪些 Tab 变了）
                        const changedTabUuids = Object.entries(refinedTabs)
                            .filter(
                                ([targetTabUuid, filtersForTab]) =>
                                    !areFilterDimensionsEqual(
                                        tabFilters[targetTabUuid] ??
                                            emptyFilters,
                                        filtersForTab,
                                    ),
                            )
                            .map(([targetTabUuid]) => targetTabUuid);

                        setTabFilters((currentTabs) => {
                            let hasChanges = false;
                            const nextTabs = { ...currentTabs };
                            changedTabUuids.forEach((targetTabUuid) => {
                                const filtersForTab =
                                    refinedTabs[targetTabUuid];
                                if (!filtersForTab) return;
                                nextTabs[targetTabUuid] = filtersForTab;
                                hasChanges = true;
                                // 全局父级已经变了：作废该 Tab 在途的联动结果，
                                // 否则它可能拿着旧的全局父值盖回本次结果。
                                // （Tab 写回现在只用世代判断有效性）
                                bumpTabCategoryCascadeGeneration(targetTabUuid);
                                cancelTabCategoryInitSession(targetTabUuid);
                                markTabCategoryProcessed(
                                    targetTabUuid,
                                    filtersForTab,
                                    refinedGlobal,
                                );
                            });
                            return hasChanges ? nextTabs : currentTabs;
                        });
                        // Tab 的 pill 展示态缓存了级联前的旧值：
                        // 写回 tabFilters 后必须清掉展示态，
                        // 否则界面一直显示旧类目（ActiveFilters 读 tabDisplayState）。
                        changedTabUuids.forEach((targetTabUuid) => {
                            clearTabCategoryDisplay(targetTabUuid);
                        });
                        // Tab 筛选器被全局父级联动修改：标记为已修改，随看板一起保存
                        if (changedTabUuids.length > 0) {
                            logCategoryCascade(
                                'global cascade write-back: tabs changed',
                                changedTabUuids.map((uuid) => ({
                                    tabUuid: uuid,
                                    dimensions: (
                                        refinedTabs[uuid]?.dimensions ?? []
                                    ).map((d) => ({
                                        id: d.id,
                                        fieldId: d.target.fieldId,
                                        values: d.values,
                                        parentFieldId: d.parentFieldId ?? null,
                                        parentScope: d.parentScope ?? null,
                                    })),
                                })),
                            );
                            setHaveTabFiltersChanged((prev) => {
                                const next = { ...prev };
                                changedTabUuids.forEach((uuid) => {
                                    next[uuid] = true;
                                });
                                return next;
                            });
                        } else {
                            logCategoryCascade(
                                'global cascade write-back: no tab changed',
                                {
                                    tabUuids: Object.keys(refinedTabs),
                                    dimensions: Object.entries(refinedTabs).map(
                                        ([uuid, f]) => ({
                                            tabUuid: uuid,
                                            dimensions: f.dimensions.map(
                                                (d) => ({
                                                    id: d.id,
                                                    fieldId: d.target.fieldId,
                                                    values: d.values,
                                                    parentFieldId:
                                                        d.parentFieldId ?? null,
                                                    parentScope:
                                                        d.parentScope ?? null,
                                                }),
                                            ),
                                        }),
                                    ),
                                },
                            );
                        }
                    },
                )
                .catch(() => {
                    // 写回失败不阻断：状态更新不应抛出
                })
                .finally(() => {
                    // 手动联动完成：图表可以按最终类目发起查询。
                    // （否则要一直等到初始化超时才放行，看板会白等好几秒）
                    if (
                        !session.isCancelled() &&
                        !globalCategoryPendingSignatureRef.current
                    ) {
                        setIsGlobalCategoryResolutionPending(false);
                    }
                });
        },
        [
            originalUpdateDimensionDashboardFilter,
            canApplyCategoryFilters,
            dashboardFilters,
            setDashboardFilters,
            setTabFilters,
            setHaveTabFiltersChanged,
            tabFilters,
            updateGlobalCascadeWithFieldSearch,
            replaceDimensionFilterAtIndex,
            markGlobalCategoryProcessed,
            markTabCategoryProcessed,
            projectUuid,
            dashboardFilterContext,
            startGlobalCategoryCascadeSession,
            clearTabCategoryDisplay,
            bumpTabCategoryCascadeGeneration,
            cancelTabCategoryInitSession,
        ],
    );

    /**
     * 顶部筛选 UI 用的合并结果：同样按 Tab 缓存引用，
     * 避免看板上下文任意变化都让筛选栏整块重渲染。
     */
    const displayedMergedFiltersCache = useRef<
        Map<
            string,
            {
                displayFilters: DashboardFilters | undefined;
                globalFilters: DashboardFilters;
                globalTemporaryFilters: DashboardFilters | undefined;
                tabFilters: DashboardFilters;
                tabTemporaryFilters: DashboardFilters;
                isGlobalFilterEnabled: boolean;
                isTabFilterEnabled: boolean;
                value: DashboardFilters;
            }
        >
    >(new Map());

    const getDisplayedMergedFiltersForTab = useCallback(
        (targetTabUuid: string) => {
            const display = tabCategoryDisplayFilters[targetTabUuid];
            const displayFilters = display?.filters;
            const tabFiltersForTab =
                displayFilters ?? getActiveTabFilters(targetTabUuid);
            const tabTemporaryFiltersForTab =
                getActiveTabTemporaryFilters(targetTabUuid);
            const isTabFilterEnabledForTab =
                isTabFilterEnabled[targetTabUuid] ?? true;

            const cached =
                displayedMergedFiltersCache.current.get(targetTabUuid);
            if (
                cached &&
                cached.displayFilters === displayFilters &&
                cached.globalFilters === dashboardFilters &&
                cached.globalTemporaryFilters === dashboardTemporaryFilters &&
                cached.tabFilters === tabFiltersForTab &&
                cached.tabTemporaryFilters === tabTemporaryFiltersForTab &&
                cached.isGlobalFilterEnabled === isGlobalFilterEnabled &&
                cached.isTabFilterEnabled === isTabFilterEnabledForTab
            ) {
                return cached.value;
            }

            const value = mergeFiltersForTab({
                globalFilters: dashboardFilters,
                globalTemporaryFilters: dashboardTemporaryFilters,
                tabFilters: tabFiltersForTab,
                tabTemporaryFilters: tabTemporaryFiltersForTab,
                isGlobalFilterEnabled,
                isTabFilterEnabled: isTabFilterEnabledForTab,
            });

            displayedMergedFiltersCache.current.set(targetTabUuid, {
                displayFilters,
                globalFilters: dashboardFilters,
                globalTemporaryFilters: dashboardTemporaryFilters,
                tabFilters: tabFiltersForTab,
                tabTemporaryFilters: tabTemporaryFiltersForTab,
                isGlobalFilterEnabled,
                isTabFilterEnabled: isTabFilterEnabledForTab,
                value,
            });

            return value;
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
            // 链 = 全局筛选器 + 当前 Tab 筛选器：
            // Tab 筛选器可以显式绑定全局父级（全局二级 → Tab 三级 → Tab 四级），
            // 父级查找与级联条件都要基于链，签名也必须覆盖全局祖先。
            const chain = buildCategoryChain(
                {
                    globalFilters: dashboardFilters,
                    tabFilters: { [targetTabUuid]: filters },
                },
                targetTabUuid,
            );
            const decision = resolveActiveTabCategoryInit({
                tabFilters: { [targetTabUuid]: filters },
                activeTabUuid: targetTabUuid,
                canApplyCategoryFilters,
                projectUuid,
                dashboardContext: dashboardFilterContext,
                processedSignatures: tabCategoryProcessedSignatureRef.current,
                globalFilters: dashboardFilters,
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
                logCategoryCascade('tab init skipped', {
                    tabUuid: targetTabUuid,
                    action: decision.action,
                    canApplyCategoryFilters,
                    hasProjectUuid: !!projectUuid,
                    pendingSignature:
                        tabCategoryPendingSignatureRef.current[targetTabUuid] ??
                        null,
                    processedSignature:
                        tabCategoryProcessedSignatureRef.current[
                            targetTabUuid
                        ] ?? null,
                });
                // 没有可执行的任务：不再等待该 Tab 的类目解析
                if (!tabCategoryPendingSignatureRef.current[targetTabUuid]) {
                    setPendingTabCategoryResolutions((prev) => ({
                        ...prev,
                        [targetTabUuid]: false,
                    }));
                }
                return;
            }

            const generation =
                (tabCategoryInitGenerationRef.current[targetTabUuid] ?? 0) + 1;
            tabCategoryInitGenerationRef.current[targetTabUuid] = generation;
            const { signature } = decision;
            tabCategoryPendingSignatureRef.current[targetTabUuid] = signature;
            // 该 Tab 的图表会等类目解析完成再查，设置等待上限防止一直转圈
            armCategoryResolutionTimeout(targetTabUuid);
            // 新的自动初始化：作废上一个初始化会话的请求
            const session = startTabCategoryInitSession(targetTabUuid);

            void initializeCategoryFiltersAsync(
                filters,
                projectUuid,
                dashboardFilterContext,
                {
                    recoverableFilterIds: recoverableCategoryFilterIds,
                    scope: {
                        location: { scope: 'tab', tabUuid: targetTabUuid },
                        chain,
                    },
                    session,
                    onResolutionIssue: handleCategoryResolutionIssue,
                },
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
                                currentSignature:
                                    getTabCategoryChainSignature(
                                        targetTabUuid,
                                        currentFilters,
                                    ) ?? undefined,
                            })
                        ) {
                            return currentTabFilters;
                        }

                        const nextFilters =
                            refined === currentFilters
                                ? currentFilters
                                : refined;
                        markTabCategoryProcessed(targetTabUuid, nextFilters);
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
                        clearCategoryResolutionTimeout(targetTabUuid);
                        // 类目解析结束：该 Tab 的图表可以按最终类目发起查询
                        setPendingTabCategoryResolutions((prev) => ({
                            ...prev,
                            [targetTabUuid]: false,
                        }));
                    }
                });
        },
        [
            canApplyCategoryFilters,
            projectUuid,
            dashboardFilterContext,
            armCategoryResolutionTimeout,
            clearCategoryResolutionTimeout,
            setTabFilters,
            dashboardFilters,
            recoverableCategoryFilterIds,
            getTabCategoryChainSignature,
            markTabCategoryProcessed,
            startTabCategoryInitSession,
            handleCategoryResolutionIssue,
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

            // 查看模式：跨 Tab 继承：把用户的显式选择同步到其他含该字段的 Tab。
            // 类目级联派生值与权限回退值不会进入继承（它们只写本 Tab 运行时）。
            let crossTabSync: CrossTabSyncResult = {
                tabFilters,
                changedTabUuids: [],
            };
            if (!isEditMode && !isTemporary) {
                crossTabSync = syncSelectionToAllTabs(item, 'dimension', uuid);
            }

            // 跨 Tab 继承的接收方：**只同步取值，不在这里发仓库请求**。
            //
            // 之前是在后台把每个接收 Tab 的各级类目都预先解析一遍（每个 Tab 1 次校验 +
            // 每级 1 次查询），一次操作就是「Tab 数 × 层级数」个 field/search，
            // 界面渲染完了还在请求，明显拖慢体验。
            //
            // 现在只作废接收方的类目解析状态（世代 / 在途会话 / 已处理签名 / 展示态），
            // 等用户真的切到那个 Tab 时，由它自己的懒初始化（runTabCategoryInit）
            // 按那个 Tab 的数据与权限重新解析。用户看不到的 Tab 不发请求。
            if (
                !isEditMode &&
                !isTemporary &&
                crossTabSync.changedTabUuids.length > 0
            ) {
                const inheritedTabUuids = crossTabSync.changedTabUuids;
                invalidateTabCategoryState(inheritedTabUuids);
                // 接收方在解析完成前不发图表查询（切过去时由初始化完成解除）
                setPendingTabCategoryResolutions((prev) => {
                    const next = { ...prev };
                    inheritedTabUuids.forEach((targetTabUuid) => {
                        next[targetTabUuid] = true;
                    });
                    return next;
                });
                // 每个接收 Tab 各自一个兜底：任一 Tab 解析结束不会取消其它 Tab 的兜底
                inheritedTabUuids.forEach((targetTabUuid) => {
                    armCategoryResolutionTimeout(targetTabUuid);
                });
                // 取值被继承修改过：标记为已修改，使「重置全部筛选」可用
                setHaveTabFiltersChanged((prev) => {
                    const next = { ...prev };
                    inheritedTabUuids.forEach((targetTabUuid) => {
                        next[targetTabUuid] = true;
                    });
                    return next;
                });
            }

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
                const requestSignature = getTabCategoryChainSignature(
                    uuid,
                    committedBase,
                );
                // 新的自动初始化：作废上一个初始化会话的请求
                const session = startTabCategoryInitSession(uuid);

                void initializeCategoryFiltersAsync(
                    mergedDisplay.filters,
                    projectUuid!,
                    dashboardFilterContext,
                    {
                        recoverableFilterIds: recoverableCategoryFilterIds,
                        scope: {
                            location: { scope: 'tab', tabUuid: uuid },
                            chain: buildCategoryChain(
                                {
                                    globalFilters: dashboardFilters,
                                    tabFilters: {
                                        [uuid]: mergedDisplay.filters,
                                    },
                                },
                                uuid,
                            ),
                        },
                        session,
                        onResolutionIssue: handleCategoryResolutionIssue,
                    },
                )
                    .then((refined) => {
                        // 会话已被取消 → 丢弃本次结果
                        if (session.isCancelled()) return;
                        if (
                            (tabCategoryInitGenerationRef.current[uuid] ??
                                0) !== generation
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
                                    currentSignature:
                                        getTabCategoryChainSignature(
                                            uuid,
                                            currentFilters,
                                        ) ?? undefined,
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
                            (tabCategoryInitGenerationRef.current[uuid] ??
                                0) === generation
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
            // 手动改动同时作废在途的 init 与更早的 cascade
            bumpTabCategoryGeneration(uuid);
            const generation = bumpTabCategoryCascadeGeneration(uuid);
            // 取消旧会话的请求：排队中的直接丢弃，在途的 abort
            const session = startTabCategoryCascadeSession(uuid);
            // 签名覆盖全局祖先：全局父级变化时，在途的 Tab 级联结果需要作废
            const requestSignature = getTabCategoryChainSignature(
                uuid,
                committedFilters,
            );

            void updateTabCascadeWithFieldSearch(
                uuid,
                displayState.filters,
                item,
                newValue,
                session,
            )
                .then((refined) => {
                    // 会话已被取消（用户又改了一次）→ 丢弃本次结果
                    if (session.isCancelled()) return;
                    if (
                        (tabCategoryCascadeGenerationRef.current[uuid] ?? 0) !==
                        generation
                    ) {
                        return;
                    }
                    let applied = false;
                    setTabFilters((prev) => {
                        const currentFilters = prev[uuid] ?? emptyFilters;
                        // 与全局联动路径保持一致：只用「世代」判断本次结果是否仍有效。
                        //
                        // 之前这里额外要求「签名未变」，但请求签名是在用户改动之前
                        // 算的（committedFilters），而级联是按改动后的展示态算的，
                        // 两边的输入本来就不是同一个状态，很容易误杀：
                        // 结果被静默丢弃 → 值不生效 + pill 一直转圈。
                        // 世代在每次用户改动该 Tab 时都会 bump，已足够作废旧结果；
                        // 全局父级变更也会 bump（见全局写回处）。
                        const canApply =
                            !!projectUuid &&
                            (tabCategoryCascadeGenerationRef.current[uuid] ??
                                0) === generation;
                        if (!canApply) {
                            logCategoryCascade(
                                'tab cascade write-back rejected',
                                {
                                    tabUuid: uuid,
                                    hasProjectUuid: !!projectUuid,
                                    requestGeneration: generation,
                                    currentGeneration:
                                        tabCategoryCascadeGenerationRef.current[
                                            uuid
                                        ] ?? 0,
                                    requestSignature,
                                    currentSignature:
                                        getTabCategoryChainSignature(
                                            uuid,
                                            currentFilters,
                                        ) ?? undefined,
                                    refined: refined.dimensions.map((d) => ({
                                        id: d.id,
                                        fieldId: d.target.fieldId,
                                        values: d.values,
                                    })),
                                },
                            );
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
                        (tabCategoryCascadeGenerationRef.current[uuid] ?? 0) ===
                        generation
                    ) {
                        clearTabCategoryDisplay(uuid);
                    }
                })
                .finally(() => {
                    // 「更新中」展示态必须在这里兜底清除。
                    //
                    // 展示态由 buildOptimisticCategoryDisplayState 写入（乐观状态，
                    // 子孙类目标记为更新中），只在「成功写回」时清除。
                    // 一旦写回被签名守卫拒绝、或世代已变，展示态就永远不会被清掉，
                    // pill 会一直转圈（用户看到的就是「一直 loading、不消失」）。
                    //
                    // 只要这次尝试仍是最新的一次（世代未变），
                    // 无论成功 / 被拒绝 / 失败，都要落回已提交状态。
                    if (
                        (tabCategoryCascadeGenerationRef.current[uuid] ?? 0) ===
                        generation
                    ) {
                        clearTabCategoryDisplay(uuid);
                    }

                    // 手动联动完成：该 Tab 的图表可以按最终类目发起查询
                    if (
                        !session.isCancelled() &&
                        !tabCategoryPendingSignatureRef.current[uuid]
                    ) {
                        setPendingTabCategoryResolutions((prev) => {
                            // 已经是 false：不产生新对象，避免无谓的重渲染
                            if (prev[uuid] === false) return prev;
                            return { ...prev, [uuid]: false };
                        });
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
            updateTabCascadeWithFieldSearch,
            replaceDimensionFilterAtIndex,
            markTabCategoryProcessed,
            projectUuid,
            dashboardFilterContext,
            dashboardFilters,
            recoverableCategoryFilterIds,
            bumpTabCategoryGeneration,
            bumpTabCategoryCascadeGeneration,
            startTabCategoryCascadeSession,
            startTabCategoryInitSession,
            clearTabCategoryDisplay,
            getTabCategoryChainSignature,
            syncSelectionToAllTabs,
            handleCategoryResolutionIssue,
            invalidateTabCategoryState,
            armCategoryResolutionTimeout,
        ],
    );

    /**
     * 查看态移除 Tab 作用域的筛选器：
     * - 各 Tab 恢复各自的作者默认值
     * - 筛选器定义保留（作者配置的规则还在）
     */
    const clearTabFilterSelection = useCallback(
        (targetTabUuid: string, index: number) => {
            const currentFilters = tabFilters[targetTabUuid] ?? emptyFilters;
            const rule = currentFilters.dimensions[index];
            if (!rule) return;

            // 各 Tab 恢复各自的作者默认值（含跨 mart 同级类目）
            const currentDashboard = dashboard || embedDashboard;
            const serverTabs = currentDashboard?.tabs ?? [];
            const removedFieldRules: DashboardFilters = {
                dimensions: [rule],
                metrics: [],
                tableCalculations: [],
            };

            const restoredTabs: Record<string, DashboardFilters> = {};
            Object.entries(tabFilters).forEach(([uuid, filters]) => {
                const serverFilters = serverTabs.find(
                    (tab) => tab.uuid === uuid,
                )?.filters;
                const restored = restoreAuthorDefaults(
                    filters,
                    removedFieldRules,
                    serverFilters,
                );
                if (restored !== filters) {
                    restoredTabs[uuid] = restored;
                }
            });

            // 恢复默认值后这些 Tab 的类目链也变了：作废在途解析，
            // 避免晚到的级联结果把刚恢复的值又写回去
            invalidateTabCategoryState([
                targetTabUuid,
                ...Object.keys(restoredTabs),
            ]);

            if (Object.keys(restoredTabs).length === 0) return;
            setTabFilters((prev) => {
                let changed = false;
                const next = { ...prev };
                Object.entries(restoredTabs).forEach(([uuid, filters]) => {
                    if (prev[uuid] === filters) return;
                    next[uuid] = filters;
                    changed = true;
                });
                return changed ? next : prev;
            });
        },
        [
            tabFilters,
            dashboard,
            embedDashboard,
            setTabFilters,
            invalidateTabCategoryState,
        ],
    );

    const wrappedRemoveTabDimensionFilter = useCallback(
        (uuid: string, index: number, isTemporary: boolean) => {
            bumpTabCategoryGeneration(uuid);
            clearTabCategoryDisplay(uuid);

            if (!isEditMode && !isTemporary) {
                // 查看模式：清除用户选择并恢复作者默认值（筛选器定义保留）
                clearTabFilterSelection(uuid, index);
                return;
            }

            removeTabDimensionFilter(uuid, index, isTemporary);
        },
        [
            bumpTabCategoryGeneration,
            clearTabCategoryDisplay,
            removeTabDimensionFilter,
            isEditMode,
            clearTabFilterSelection,
        ],
    );

    const wrappedResetTabFilters = useCallback(
        (uuid: string) => {
            const currentDashboard = dashboard || embedDashboard;
            const serverTabs = currentDashboard?.tabs ?? [];
            const resetServerFilters = serverTabs.find(
                (tab) => tab.uuid === uuid,
            )?.filters;

            // 查看模式：当前 Tab + 其它 Tab 的同字段规则（含跨 mart 同级类目）
            // 都退回各自作者默认值。
            const restoredTabs: Record<string, DashboardFilters> = {};
            if (!isEditMode && resetServerFilters) {
                Object.entries(tabFilters).forEach(
                    ([currentTabUuid, filters]) => {
                        if (currentTabUuid === uuid) return;
                        const tabServerFilters = serverTabs.find(
                            (tab) => tab.uuid === currentTabUuid,
                        )?.filters;
                        const restored = restoreAuthorDefaults(
                            filters,
                            resetServerFilters,
                            tabServerFilters,
                        );
                        if (restored !== filters) {
                            restoredTabs[currentTabUuid] = restored;
                        }
                    },
                );
            }

            // 重置前先作废在途的类目解析（init / cascade / 跨 Tab 继承）：
            // 否则晚到的结果会把重置后的值又写回去（"重置无效"）。
            invalidateTabCategoryState([uuid, ...Object.keys(restoredTabs)]);

            // 当前 Tab 退回它自己的作者默认值
            resetTabFilters(uuid);

            if (Object.keys(restoredTabs).length > 0) {
                setTabFilters((prev) => {
                    let changed = false;
                    const next = { ...prev };
                    Object.entries(restoredTabs).forEach(
                        ([currentTabUuid, filters]) => {
                            if (next[currentTabUuid] === filters) return;
                            next[currentTabUuid] = filters;
                            changed = true;
                        },
                    );
                    return changed ? next : prev;
                });
            }

            if (isEditMode) return;

            // 作者默认值同样需要按数据 / 权限重新解析（否则可能停在无效类目上）
            setPendingTabCategoryResolutions((prev) => ({
                ...prev,
                [uuid]:
                    canApplyCategoryFilters &&
                    !!resetServerFilters &&
                    hasCategoryFilters(resetServerFilters),
            }));
            armCategoryResolutionTimeout(uuid);
            // 各 Tab 都已回到作者默认值：不再算"已修改"
            setHaveTabFiltersChanged((prev) => {
                const affected = [uuid, ...Object.keys(restoredTabs)];
                if (
                    affected.every(
                        (affectedTabUuid) => prev[affectedTabUuid] === false,
                    )
                ) {
                    return prev;
                }
                const next = { ...prev };
                affected.forEach((affectedTabUuid) => {
                    next[affectedTabUuid] = false;
                });
                return next;
            });
        },
        [
            resetTabFilters,
            isEditMode,
            dashboard,
            embedDashboard,
            setTabFilters,
            tabFilters,
            invalidateTabCategoryState,
            setPendingTabCategoryResolutions,
            armCategoryResolutionTimeout,
            canApplyCategoryFilters,
            setHaveTabFiltersChanged,
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

        if (
            !resolvedTab ||
            embedToken ||
            dashboardTabs.length <= 1 ||
            !projectUuid
        ) {
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

            // 首屏类目解析完成前不发起图表查询（避免图表先按未解析的类目跑一次）
            setIsGlobalCategoryResolutionPending(
                canApplyCategoryFilters &&
                    hasCategoryFilters(updatedDashboardFilters),
            );
            if (
                canApplyCategoryFilters &&
                hasCategoryFilters(updatedDashboardFilters)
            ) {
                armCategoryResolutionTimeout('global');
            }

            // tab filters
            if (
                currentDashboard.tabs.length > 0 &&
                isEmptyTabFilters(tabFilters)
            ) {
                let updatedTabFilters = currentDashboard.tabs.reduce(
                    (acc, tab) => {
                        // Deep clone to avoid mutating the original object
                        acc[tab.uuid] = tab.filters ?? emptyFilters;
                        return acc;
                    },
                    {} as Record<string, DashboardFilters>,
                );

                setTabFilters(updatedTabFilters);

                const pendingTabs = currentDashboard.tabs.reduce((acc, tab) => {
                    acc[tab.uuid] =
                        canApplyCategoryFilters &&
                        hasCategoryFilters(tab.filters ?? emptyFilters);
                    return acc;
                }, {} as Record<string, boolean>);
                setPendingTabCategoryResolutions(pendingTabs);
                // 每个 pending 的 Tab 各自一个兜底超时
                Object.entries(pendingTabs).forEach(
                    ([pendingTabUuid, isPending]) => {
                        if (isPending) {
                            armCategoryResolutionTimeout(pendingTabUuid);
                        }
                    },
                );
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
        armCategoryResolutionTimeout,
        setHaveFiltersChanged,
        setDashboardFilters,
        setOriginalDashboardFilters,
        setTabFilters,
        applyInteractivityFiltering,
        activeTab,
        showToastInfo,
        t,
    ]);

    /**
     * 进入编辑模式时，用服务端快照重置运行时筛选器。
     *
     * 背景：查看模式下 Provider 不会因为 URL 变成 /edit 而重新挂载，
     * 查看者的选择会一直留在运行时筛选器里，作者一点保存就把查看者的值写回服务端。
     * 这里在 view → edit 的瞬间用服务端快照重置。
     */
    const prevIsEditModeRef = useRef(isEditMode);
    useEffect(() => {
        const wasEditMode = prevIsEditModeRef.current;
        prevIsEditModeRef.current = isEditMode;

        if (!wasEditMode && isEditMode) {
            const currentDashboard = dashboard || embedDashboard;
            if (!currentDashboard) return;

            setDashboardFilters(clone(currentDashboard.filters));
            setDashboardTemporaryFilters(emptyFilters);
            setTabFilters(
                (currentDashboard.tabs ?? []).reduce((acc, tab) => {
                    acc[tab.uuid] = tab.filters ?? emptyFilters;
                    return acc;
                }, {} as Record<string, DashboardFilters>),
            );
            setTabTemporaryFilters({});
            setHaveTabFiltersChanged({});
        }
    }, [
        isEditMode,
        dashboard,
        embedDashboard,
        setDashboardFilters,
        setDashboardTemporaryFilters,
        setTabFilters,
        setTabTemporaryFilters,
        setHaveTabFiltersChanged,
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

    // 记录访问过的 Tab（只增不减），供 tile 查询调度使用
    useEffect(() => {
        if (!activeTabUuid) return;
        setVisitedTabUuids((prev) =>
            prev.has(activeTabUuid) ? prev : new Set(prev).add(activeTabUuid),
        );
    }, [activeTabUuid]);

    useEffect(() => {
        if (!canApplyCategoryFilters || !projectUuid || isEditMode) return;
        if (!activeTabUuid || !activeTabFilters) return;
        // 等全局类目解析完成：Tab 类目可能绑定全局父级（全局二级 → Tab 三级），
        // 全局父级还没定值时解析 Tab 会把子类目误清空。
        if (isGlobalCategoryResolutionPending) return;

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
        isGlobalCategoryResolutionPending,
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
        const fields = dashboardAvailableFiltersData?.allFilterableFields;
        if (!fields || fields.length === 0) return {};

        // 直接累积，避免在 reduce 里展开对象（O(n²) 的对象拷贝）
        const map: Record<string, DashboardFilterableField> = {};
        fields.forEach((field) => {
            map[getItemId(field)] = field;
        });
        return map;
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

    // 首屏类目解析是否在进行中：进行中时图表不发起查询，
    // 等类目解析完成后按最终类目一次性查询（避免图表先出一版未解析的数据再刷新）
    const isCategoryResolutionPending = useMemo(
        () =>
            isGlobalCategoryResolutionPending ||
            (activeTabUuid
                ? pendingTabCategoryResolutions[activeTabUuid] === true
                : false),
        [
            isGlobalCategoryResolutionPending,
            activeTabUuid,
            pendingTabCategoryResolutions,
        ],
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
        activeTab,
        setActiveTab,
        visitedTabUuids,
        isGlobalCategoryResolutionPending,
        pendingTabCategoryResolutions,
        setDashboardTemporaryFilters,
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter: wrappedRemoveDimensionDashboardFilter,
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
        isCategoryResolutionPending,
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

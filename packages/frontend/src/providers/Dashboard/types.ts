import {
    type ApiError,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateGranularity,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type ResultColumn,
    type SortField,
} from '@lightdash/common';
import { type Dispatch, type SetStateAction } from 'react';
import {
    type useDashboardCommentsCheck,
    type useGetComments,
} from '../../features/comments';

export type SqlChartTileMetadata = {
    columns: ResultColumn[];
};
export type DashboardContextType = {
    projectUuid?: string;
    isDashboardLoading: boolean;
    dashboard: Dashboard | undefined;
    setEmbedDashboard: Dispatch<SetStateAction<Dashboard | undefined>>;
    dashboardError: ApiError | null;
    dashboardTiles: Dashboard['tiles'] | undefined;
    setDashboardTiles: Dispatch<SetStateAction<Dashboard['tiles'] | undefined>>;
    haveTilesChanged: boolean;
    setHaveTilesChanged: Dispatch<SetStateAction<boolean>>;
    haveTabsChanged: boolean;
    setHaveTabsChanged: Dispatch<SetStateAction<boolean>>;
    dashboardTabs: Dashboard['tabs'];
    setDashboardTabs: Dispatch<SetStateAction<Dashboard['tabs']>>;
    activeTab: Dashboard['tabs'][number] | undefined;
    setActiveTab: Dispatch<
        SetStateAction<Dashboard['tabs'][number] | undefined>
    >;
    /**
     * 全局类目是否正在解析（解析中时所有 Tab 的图表都要等）。
     */
    isGlobalCategoryResolutionPending: boolean;
    /**
     * 每个 Tab 的类目解析状态（key = tab uuid）。
     * 只有「自己的 Tab 还在解析」才需要挡住该 Tab 的图表查询，
     * 避免切到某个 Tab 后把其它 Tab 的查询也一起按住。
     */
    pendingTabCategoryResolutions: Record<string, boolean>;
    /**
     * 用户访问过的 Tab（只增不减）。
     * 只有访问过的 Tab 才让 tile 发起查询，避免多 Tab 看板首屏查询风暴。
     */
    visitedTabUuids: Set<string>;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    allFilters: DashboardFilters;
    isLoadingDashboardFilters: boolean;
    isFetchingDashboardFilters: boolean;
    resetDashboardFilters: () => void;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setDashboardTemporaryFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
        isEditMode: boolean,
    ) => void;
    removeDimensionDashboardFilter: (
        index: number,
        isTemporary: boolean,
    ) => void;
    addMetricDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    haveFiltersChanged: boolean;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    addResultsCacheTime: (cacheMetadata: CacheMetadata) => void;
    oldestCacheTime: Date | undefined;
    invalidateCache: boolean | undefined;
    isAutoRefresh: boolean;
    setIsAutoRefresh: (autoRefresh: boolean) => void;
    clearCacheAndFetch: () => void;
    allFilterableFieldsMap: Record<string, DashboardFilterableField>;
    allFilterableFields: DashboardFilterableField[] | undefined;
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    hasTilesThatSupportFilters: boolean;
    chartSort: Record<string, SortField[]>;
    setChartSort: (sort: Record<string, SortField[]>) => void;
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
    updateSqlChartTilesMetadata: (
        tileUuid: string,
        metadata: SqlChartTileMetadata,
    ) => void;
    dateZoomGranularity: DateGranularity | undefined;
    setDateZoomGranularity: Dispatch<
        SetStateAction<DateGranularity | undefined>
    >;
    chartsWithDateZoomApplied: Set<string> | undefined;
    setChartsWithDateZoomApplied: Dispatch<
        SetStateAction<Set<string> | undefined>
    >;
    /** Chart UUIDs whose metric query includes a DATE/TIMESTAMP dimension (can be date-zoomed). */
    chartsWithDateDimension: Set<string>;
    setChartsWithDateDimension: Dispatch<SetStateAction<Set<string>>>;
    dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
    dashboardComments?: ReturnType<typeof useGetComments>['data'];
    hasTileComments: (tileUuid: string) => boolean;
    requiredDashboardFilters: Pick<DashboardFilterRule, 'id' | 'label'>[];
    isDateZoomDisabled: boolean;
    setIsDateZoomDisabled: Dispatch<SetStateAction<boolean>>;
    setSavedParameters: Dispatch<SetStateAction<DashboardParameters>>;
    parametersHaveChanged: boolean;
    dashboardParameters: DashboardParameters;
    parameterValues: ParametersValuesMap;
    clearAllParameters: () => void;
    setParameter: (key: string, value: ParameterValue | null) => void;
    dashboardParameterReferences: Set<string>;
    addParameterReferences: (tileUuid: string, references: string[]) => void;
    tileParameterReferences: Record<string, string[]>;
    areAllChartsLoaded: boolean;
    parameterDefinitions: ParameterDefinitions;
    addParameterDefinitions: (parameters: ParameterDefinitions) => void;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    setPinnedParameters: (parameters: string[]) => void;
    toggleParameterPin: (parameterKey: string) => void;
    havePinnedParametersChanged: boolean;
    setHavePinnedParametersChanged: Dispatch<SetStateAction<boolean>>;
    tileNamesById: Record<string, string>;
    refreshDashboardVersion: () => Promise<void>;
    isRefreshingDashboardVersion: boolean;

    // tabs-filter start
    tabFilters: Record<string, DashboardFilters>;
    setTabFilters: Dispatch<SetStateAction<Record<string, DashboardFilters>>>;
    /**
     * 首屏类目筛选器是否还在解析中。
     * 解析中时图表不发起查询，等类目解析完成后按最终类目一次性查询，
     * 避免图表先按「未解析的类目」跑一次、解析完再刷新一次。
     */
    isCategoryResolutionPending: boolean;
    tabTemporaryFilters: Record<string, DashboardFilters>;
    setTabTemporaryFilters: Dispatch<
        SetStateAction<Record<string, DashboardFilters>>
    >;
    haveTabFiltersChanged: Record<string, boolean>;
    setHaveTabFiltersChanged: Dispatch<SetStateAction<Record<string, boolean>>>;
    getActiveTabFilters: (tabUuid: string) => DashboardFilters;
    getActiveTabTemporaryFilters: (tabUuid: string) => DashboardFilters;
    getMergedFiltersForTab: (tabUuid: string) => DashboardFilters;
    /** 顶部筛选 UI 用：存在类目级联展示态时优先展示态，图表查询仍用 getMergedFiltersForTab */
    getDisplayedMergedFiltersForTab: (tabUuid: string) => DashboardFilters;
    /** Tab 类目级联即时展示态；无 pending 时为空对象 */
    tabCategoryDisplayFilters: Record<
        string,
        {
            filters: DashboardFilters;
            updatingFilterIds: string[];
        }
    >;
    addTabDimensionFilter: (
        tabUuid: string,
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    updateTabDimensionFilter: (
        tabUuid: string,
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
    ) => void;
    removeTabDimensionFilter: (
        tabUuid: string,
        index: number,
        isTemporary: boolean,
    ) => void;
    resetTabFilters: (tabUuid: string) => void;
    // tabs-filer end

    // filter enabled state start
    isGlobalFilterEnabled: boolean;
    setIsGlobalFilterEnabled: (value: boolean) => void;
    isTabFilterEnabled: Record<string, boolean>;
    setIsTabFilterEnabled: Dispatch<SetStateAction<Record<string, boolean>>>;
    showGlobalAddFilterButton: boolean;
    setShowGlobalAddFilterButton: (value: boolean) => void;
    showTabAddFilterButton: Record<string, boolean>;
    setShowTabAddFilterButton: (
        value:
            | Record<string, boolean>
            | ((prev: Record<string, boolean>) => Record<string, boolean>),
    ) => void;
    haveFilterEnabledStatesChanged: boolean;
    setHaveFilterEnabledStatesChanged: (value: boolean) => void;
    haveShowAddFilterButtonStatesChanged: boolean;
    setHaveShowAddFilterButtonStatesChanged: (value: boolean) => void;
    // filter enabled state end
};

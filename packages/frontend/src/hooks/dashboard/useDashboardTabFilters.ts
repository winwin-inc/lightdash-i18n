import {
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useCallback, useRef, useState } from 'react';

import { emptyFilters } from './useDashboardFilters';

interface DashboardTabFilterProps {
    dashboard?: Dashboard;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    isGlobalFilterEnabled: boolean;
    isFilterEnabled: (tabUuid: string) => boolean;
}

const concatFilters = (
    ...filterSets: Array<DashboardFilters | undefined>
): DashboardFilters => ({
    dimensions: filterSets.flatMap((filters) => filters?.dimensions ?? []),
    metrics: filterSets.flatMap((filters) => filters?.metrics ?? []),
    tableCalculations: filterSets.flatMap(
        (filters) => filters?.tableCalculations ?? [],
    ),
});

/**
 * Merge global and tab dashboard filters, honoring each layer's enable flag.
 * Disabled layers keep their saved definitions but are omitted from queries.
 */
export const mergeFiltersForTab = ({
    globalFilters,
    globalTemporaryFilters,
    tabFilters,
    tabTemporaryFilters,
    isGlobalFilterEnabled,
    isTabFilterEnabled,
}: {
    globalFilters: DashboardFilters;
    globalTemporaryFilters?: DashboardFilters;
    tabFilters: DashboardFilters;
    tabTemporaryFilters?: DashboardFilters;
    isGlobalFilterEnabled: boolean;
    isTabFilterEnabled: boolean;
}): DashboardFilters => {
    const resolvedGlobalFilters = isGlobalFilterEnabled
        ? concatFilters(globalFilters, globalTemporaryFilters)
        : emptyFilters;

    if (!isTabFilterEnabled) {
        return resolvedGlobalFilters;
    }

    return concatFilters(
        resolvedGlobalFilters,
        tabFilters,
        tabTemporaryFilters,
    );
};

export const isEmptyTabFilters = (
    tabFilters: Record<string, DashboardFilters>,
) => {
    if (Object.keys(tabFilters).length === 0) return true;
    return Object.values(tabFilters).every(
        (tabFilter) => tabFilter === emptyFilters,
    );
};

export const useDashboardTabFilters = ({
    dashboard,
    dashboardFilters,
    dashboardTemporaryFilters,
    isGlobalFilterEnabled,
    isFilterEnabled,
}: DashboardTabFilterProps) => {
    const [tabFilters, setTabFilters] = useState<
        Record<string, DashboardFilters>
    >({});
    const [tabTemporaryFilters, setTabTemporaryFilters] = useState<
        Record<string, DashboardFilters>
    >({});
    const [haveTabFiltersChanged, setHaveTabFiltersChanged] = useState<
        Record<string, boolean>
    >({});

    const getActiveTabFilters = useCallback(
        (tabUuid: string) => {
            return tabFilters[tabUuid] || emptyFilters;
        },
        [tabFilters],
    );
    const getActiveTabTemporaryFilters = useCallback(
        (tabUuid: string) => {
            return tabTemporaryFilters[tabUuid] || emptyFilters;
        },
        [tabTemporaryFilters],
    );

    /**
     * 合并后的筛选器按 Tab 缓存，保证引用稳定：
     *
     * 图表 tile 通过 useDashboardContext((c) => c.getMergedFiltersForTab(uuid))
     * 订阅这个值。如果每次调用都返回新对象：
     * - useContextSelector 认为值变了 → 看板上下文任何变化都会让所有 tile 重渲染
     * - tile 侧 useMemo 的依赖（tabFilters）每次都变 → 过滤规则重算 + 查询 key 重算
     *
     * 缓存只在输入（全局筛选器 / Tab 筛选器 / 开关）真正变化时失效。
     */
    const mergedFiltersCache = useRef<
        Map<
            string,
            {
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

    const getMergedFiltersForTab = useCallback(
        (tabUuid: string) => {
            const tabFiltersForTab = getActiveTabFilters(tabUuid);
            const tabTemporaryFiltersForTab =
                getActiveTabTemporaryFilters(tabUuid);
            const isTabFilterEnabledForTab = isFilterEnabled(tabUuid);

            const cached = mergedFiltersCache.current.get(tabUuid);
            if (
                cached &&
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

            mergedFiltersCache.current.set(tabUuid, {
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
            dashboardFilters,
            dashboardTemporaryFilters,
            getActiveTabFilters,
            getActiveTabTemporaryFilters,
            isGlobalFilterEnabled,
            isFilterEnabled,
        ],
    );

    const addTabDimensionFilter = (
        tabUuid: string,
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => {
        const setFunction = isTemporary
            ? setTabTemporaryFilters
            : setTabFilters;

        setFunction((prev) => ({
            ...prev,
            [tabUuid]: {
                ...(prev[tabUuid] || emptyFilters),
                dimensions: [...(prev[tabUuid]?.dimensions || []), filter],
                metrics: prev[tabUuid]?.metrics || [],
                tableCalculations: prev[tabUuid]?.tableCalculations || [],
            },
        }));

        setHaveTabFiltersChanged((prev) => ({
            ...prev,
            [tabUuid]: true,
        }));
    };

    const updateTabDimensionFilter = (
        tabUuid: string,
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
    ) => {
        const setFunction = isTemporary
            ? setTabTemporaryFilters
            : setTabFilters;

        setFunction((prev) => ({
            ...prev,
            [tabUuid]: {
                ...(prev[tabUuid] || emptyFilters),
                dimensions: [
                    ...(prev[tabUuid]?.dimensions || []).slice(0, index),
                    filter,
                    ...(prev[tabUuid]?.dimensions || []).slice(index + 1),
                ],
                metrics: prev[tabUuid]?.metrics || [],
                tableCalculations: prev[tabUuid]?.tableCalculations || [],
            },
        }));

        setHaveTabFiltersChanged((prev) => ({
            ...prev,
            [tabUuid]: true,
        }));
    };

    const removeTabDimensionFilter = (
        tabUuid: string,
        index: number,
        isTemporary: boolean,
    ) => {
        const setFunction = isTemporary
            ? setTabTemporaryFilters
            : setTabFilters;

        setFunction((prev) => ({
            ...prev,
            [tabUuid]: {
                ...(prev[tabUuid] || emptyFilters),
                dimensions: [
                    ...(prev[tabUuid]?.dimensions || []).slice(0, index),
                    ...(prev[tabUuid]?.dimensions || []).slice(index + 1),
                ],
                metrics: prev[tabUuid]?.metrics || [],
                tableCalculations: prev[tabUuid]?.tableCalculations || [],
            },
        }));

        setHaveTabFiltersChanged((prev) => ({
            ...prev,
            [tabUuid]: true,
        }));
    };

    const resetTabFilters = (tabUuid: string) => {
        setTabFilters((prev) => ({
            ...prev,
            [tabUuid]:
                dashboard?.tabs.find((tab) => tab.uuid === tabUuid)?.filters ||
                emptyFilters,
        }));
        setTabTemporaryFilters((prev) => ({
            ...prev,
            [tabUuid]: emptyFilters,
        }));
        setHaveTabFiltersChanged((prev) => ({
            ...prev,
            [tabUuid]: false,
        }));
    };

    return {
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
    };
};

import {
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useCallback, useState } from 'react';

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

    const getMergedFiltersForTab = useCallback(
        (tabUuid: string) =>
            mergeFiltersForTab({
                globalFilters: dashboardFilters,
                globalTemporaryFilters: dashboardTemporaryFilters,
                tabFilters: getActiveTabFilters(tabUuid),
                tabTemporaryFilters: getActiveTabTemporaryFilters(tabUuid),
                isGlobalFilterEnabled,
                isTabFilterEnabled: isFilterEnabled(tabUuid),
            }),
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

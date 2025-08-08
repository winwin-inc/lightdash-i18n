import {
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useCallback, useState } from 'react';

import { emptyFilters } from './useDashboardFilters';

interface DashboardTabFilterProps {
    dashboard?: Dashboard;
    allFilters: DashboardFilters; // 使用 allFilters 而不是 dashboardFilters
    isFilterEnabled: (tabUuid: string) => boolean;
}

export const isEmptyTabFilters = (
    tabFilters: Record<string, DashboardFilters>,
) => {
    if (Object.keys(tabFilters).length === 0) return true;
    return Object.values(tabFilters).every(
        (tabFilter) => tabFilter === emptyFilters,
    );
};

const useDashboardFilterForTab = ({
    dashboard,
    allFilters,
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

    const getMergedFiltersForTab = (tabUuid: string) => {
        // If filter is disabled for this tab, return only global filters
        if (!isFilterEnabled(tabUuid)) {
            return allFilters;
        }

        const tabSpecificFilters = getActiveTabFilters(tabUuid);
        const tabSpecificTemporaryFilters =
            getActiveTabTemporaryFilters(tabUuid);

        return {
            dimensions: [
                ...allFilters.dimensions,
                ...tabSpecificFilters.dimensions,
                ...tabSpecificTemporaryFilters.dimensions,
            ],
            metrics: [
                ...allFilters.metrics,
                ...tabSpecificFilters.metrics,
                ...tabSpecificTemporaryFilters.metrics,
            ],
            tableCalculations: [
                ...allFilters.tableCalculations,
                ...tabSpecificFilters.tableCalculations,
                ...tabSpecificTemporaryFilters.tableCalculations,
            ],
        };
    };

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

export default useDashboardFilterForTab;

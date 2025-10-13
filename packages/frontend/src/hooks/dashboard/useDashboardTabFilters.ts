import {
    Dashboard,
    DashboardFilterRule,
    DashboardFilters,
} from '@lightdash/common';
import { useCallback, useState } from 'react';

import { emptyFilters } from './useDashboardFilters';

interface DashboardTabFilterProps {
    dashboard?: Dashboard;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
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

export const useDashboardTabFilters = ({
    dashboard,
    dashboardFilters,
    dashboardTemporaryFilters,
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
        const globalFilters = {
            dimensions: [
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters?.dimensions,
            ],
            metrics: [
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters?.metrics,
            ],
            tableCalculations: [
                ...dashboardFilters.tableCalculations,
                ...dashboardTemporaryFilters?.tableCalculations,
            ],
        };

        if (!isFilterEnabled(tabUuid)) return globalFilters;

        const tabSpecificFilters = getActiveTabFilters(tabUuid);
        const tabSpecificTemporaryFilters =
            getActiveTabTemporaryFilters(tabUuid);

        return {
            dimensions: [
                ...globalFilters.dimensions,
                ...tabSpecificFilters.dimensions,
                ...tabSpecificTemporaryFilters.dimensions,
            ],
            metrics: [
                ...globalFilters.metrics,
                ...tabSpecificFilters.metrics,
                ...tabSpecificTemporaryFilters.metrics,
            ],
            tableCalculations: [
                ...globalFilters.tableCalculations,
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

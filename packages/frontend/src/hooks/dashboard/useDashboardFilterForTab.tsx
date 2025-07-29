import {
    Dashboard,
    DashboardFilterRule,
    DashboardFilters,
} from '@lightdash/common';
import { useCallback, useState } from 'react';

import { emptyFilters } from './useDashboardFilter';

interface DashboardTabFilterProps {
    dashboard?: Dashboard;
    allFilters: DashboardFilters;
}

const useDashboardFilterForTab = ({
    dashboard,
    allFilters,
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
        const globalFilters = allFilters;
        const tabSpecificFilters = getActiveTabFilters(tabUuid);
        const tabTemporaryFilters = getActiveTabTemporaryFilters(tabUuid);

        return {
            dimensions: [
                ...globalFilters.dimensions,
                ...tabSpecificFilters.dimensions,
                ...tabTemporaryFilters.dimensions,
            ],
            metrics: [
                ...globalFilters.metrics,
                ...tabSpecificFilters.metrics,
                ...tabTemporaryFilters.metrics,
            ],
            tableCalculations: [
                ...globalFilters.tableCalculations,
                ...tabSpecificFilters.tableCalculations,
                ...tabTemporaryFilters.tableCalculations,
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
            [tabUuid]: emptyFilters,
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

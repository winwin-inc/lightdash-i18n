import {
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

import { hasSavedFilterValueChanged } from '../../components/DashboardFilter/FilterConfiguration/utils';
import { useSavedDashboardFiltersOverrides } from '../../hooks/useSavedDashboardFiltersOverrides';

export const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

interface DashboardFilterProps {
    dashboard?: Dashboard;
    isFilterEnabled?: boolean;
}

const useDashboardFilter = ({
    dashboard,
    isFilterEnabled = true,
}: DashboardFilterProps) => {
    const [dashboardTemporaryFilters, setDashboardTemporaryFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [dashboardFilters, setDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [originalDashboardFilters, setOriginalDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] =
        useState<boolean>(false);

    const {
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
    } = useSavedDashboardFiltersOverrides();

    const allFilters = useMemo(() => {
        // If filter is disabled, return empty filters
        if (!isFilterEnabled) {
            return emptyFilters;
        }

        return {
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
    }, [dashboardFilters, dashboardTemporaryFilters, isFilterEnabled]);

    // Resets all dashboard filters. There's a bit of a race condition
    // here because we store filters in memory in two places:
    //  1. dashboardFilters: in memory
    //  2. overridesForSavedDashboardFilters: in url
    // This resets all of them.
    // TODO: fix up the data flow for filters so that they get set
    // and read more centrally.
    const resetDashboardFilters = useCallback(() => {
        // reset in memory filters
        setDashboardFilters(dashboard?.filters ?? emptyFilters);
        // reset temporary filters
        setDashboardTemporaryFilters(emptyFilters);
        // reset saved filter overrides which are stored in url
        resetSavedFilterOverrides();
    }, [
        setDashboardFilters,
        setDashboardTemporaryFilters,
        dashboard?.filters,
        resetSavedFilterOverrides,
    ]);

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: [...previousFilters.dimensions, filter],
                metrics: previousFilters.metrics,
                tableCalculations: previousFilters.tableCalculations,
            }));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters],
    );

    const updateDimensionDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isEditMode: boolean,
        ) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;

            const isFilterSaved = dashboard?.filters.dimensions.some(
                ({ id }) => id === item.id,
            );

            setFunction((previousFilters) => {
                if (!isTemporary) {
                    if (isEditMode) {
                        removeSavedFilterOverride(item);
                    } else {
                        const isReverted =
                            originalDashboardFilters.dimensions[index] &&
                            !hasSavedFilterValueChanged(
                                originalDashboardFilters.dimensions[index],
                                item,
                            );
                        if (isReverted) {
                            removeSavedFilterOverride(item);
                            setHaveFiltersChanged(false);
                        } else {
                            const hasChanged = hasSavedFilterValueChanged(
                                previousFilters.dimensions[index],
                                item,
                            );

                            if (hasChanged && isFilterSaved) {
                                addSavedFilterOverride(item);
                            }
                        }
                    }
                }
                return {
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        item,
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                    tableCalculations: previousFilters.tableCalculations,
                };
            });
            setHaveFiltersChanged(true);
        },
        [
            addSavedFilterOverride,
            dashboard?.filters.dimensions,
            originalDashboardFilters.dimensions,
            removeSavedFilterOverride,
        ],
    );

    const addMetricDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: previousFilters.dimensions,
                metrics: [...previousFilters.metrics, filter],
                tableCalculations: previousFilters.tableCalculations,
            }));
            setHaveFiltersChanged(true);
        },
        [],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => {
                if (!isTemporary) {
                    removeSavedFilterOverride(
                        previousFilters.dimensions[index],
                    );
                }
                return {
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                    tableCalculations: previousFilters.tableCalculations,
                };
            });
            setHaveFiltersChanged(true);
        },
        [removeSavedFilterOverride],
    );

    return {
        dashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        originalDashboardFilters,
        setOriginalDashboardFilters,
        dashboardTemporaryFilters,
        setDashboardTemporaryFilters,
        allFilters,

        resetDashboardFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        addMetricDashboardFilter,
        removeDimensionDashboardFilter,
    };
};

export default useDashboardFilter;

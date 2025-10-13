import {
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { hasSavedFilterValueChanged } from '../../components/DashboardFilter/FilterConfiguration/utils';
import { useSavedDashboardFiltersOverrides } from '../useSavedDashboardFiltersOverrides';

export const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

export const useDashboardFilters = ({
    dashboard,
    isFilterEnabled,
}: {
    isFilterEnabled: boolean;
    dashboard?: Dashboard;
}) => {
    const [dashboardTemporaryFilters, setDashboardTemporaryFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [dashboardFilters, setDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [originalDashboardFilters, setOriginalDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] =
        useState<boolean>(false);

    const allFilters = useMemo(() => {
        if (!isFilterEnabled) return emptyFilters;

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

    const {
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
    } = useSavedDashboardFiltersOverrides();

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
        dashboardTemporaryFilters,
        dashboardFilters,
        allFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        setOriginalDashboardFilters,
        setDashboardTemporaryFilters,
        setDashboardFilters,
        resetDashboardFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        addMetricDashboardFilter,
        removeDimensionDashboardFilter,
        overridesForSavedDashboardFilters,
    };
};

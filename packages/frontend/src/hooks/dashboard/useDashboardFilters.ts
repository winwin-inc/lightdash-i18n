import {
    FilterInteractivityValues,
    getFilterInteractivityValue,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type InteractivityOptions,
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
    // Embedded dashboards will not be using this query hook to load the dashboard,
    // so we need to set the dashboard manually
    const [embedDashboard, setEmbedDashboard] = useState<
        Dashboard & InteractivityOptions
    >();

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
    } = useSavedDashboardFiltersOverrides();

    /**
     * Apply interactivity filtering for embedded dashboards
     */
    const applyInteractivityFiltering = useCallback(
        (filters: DashboardFilters): DashboardFilters => {
            if (!embedDashboard) {
                return filters;
            }

            if (!embedDashboard.dashboardFiltersInteractivity) {
                return emptyFilters;
            }

            const interactivityOptions =
                embedDashboard.dashboardFiltersInteractivity;
            const filterInteractivityValue = getFilterInteractivityValue(
                interactivityOptions.enabled,
            );

            if (filterInteractivityValue === FilterInteractivityValues.none) {
                return emptyFilters;
            }

            if (filterInteractivityValue === FilterInteractivityValues.some) {
                return {
                    ...filters,
                    dimensions: filters.dimensions.filter((filter) =>
                        interactivityOptions.allowedFilters?.includes(
                            filter.id,
                        ),
                    ),
                };
            }

            // If 'all', return filters as-is
            return filters;
        },
        [embedDashboard],
    );

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

            const filters =
                dashboard?.filters?.dimensions ||
                embedDashboard?.filters?.dimensions ||
                [];
            const isFilterSaved = filters.some(({ id }) => id === item.id);

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
            embedDashboard?.filters.dimensions,
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
        setEmbedDashboard,
        embedDashboard,
        dashboardTemporaryFilters,
        dashboardFilters,
        allFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        setOriginalDashboardFilters,
        setDashboardTemporaryFilters,
        setDashboardFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        addMetricDashboardFilter,
        removeDimensionDashboardFilter,
        overridesForSavedDashboardFilters,
        applyInteractivityFiltering,
    };
};

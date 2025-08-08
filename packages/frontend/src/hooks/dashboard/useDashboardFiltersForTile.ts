import {
    getDashboardFilterRulesForTile,
    type DashboardFilters,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

const useDashboardFiltersForTile = (tileUuid: string): DashboardFilters => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const isGlobalFilterEnabled = useDashboardContext(
        (c) => c.isGlobalFilterEnabled,
    );

    return useMemo(() => {
        // If global filter is disabled, return empty filters
        if (!isGlobalFilterEnabled) {
            return {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
        }

        return {
            dimensions: getDashboardFilterRulesForTile(tileUuid, [
                ...dashboardFilters.dimensions,
                ...(dashboardTemporaryFilters?.dimensions ?? []),
            ]),
            metrics: getDashboardFilterRulesForTile(tileUuid, [
                ...dashboardFilters.metrics,
                ...(dashboardTemporaryFilters?.metrics ?? []),
            ]),
            tableCalculations: getDashboardFilterRulesForTile(tileUuid, [
                ...dashboardFilters.tableCalculations,
                ...(dashboardTemporaryFilters?.tableCalculations ?? []),
            ]),
        };
    }, [
        tileUuid,
        dashboardFilters,
        dashboardTemporaryFilters,
        isGlobalFilterEnabled,
    ]);
};

export default useDashboardFiltersForTile;

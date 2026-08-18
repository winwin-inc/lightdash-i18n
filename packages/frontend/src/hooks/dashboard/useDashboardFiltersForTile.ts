import {
    getDashboardFilterRulesForTile,
    type DashboardFilters,
} from '@lightdash/common';
import { useMemo } from 'react';
import { prepareDashboardFilterRuleForQuery } from '../../components/common/Filters/FilterInputs/utils';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { emptyFilters } from './useDashboardFilters';

const useDashboardFiltersForTile = (tileUuid: string): DashboardFilters => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const isGlobalFilterEnabled = useDashboardContext(
        (c) => c.isGlobalFilterEnabled,
    );

    return useMemo(() => {
        if (!isGlobalFilterEnabled) return emptyFilters;

        const forQuery = (rule: typeof dashboardFilters.dimensions[number]) =>
            prepareDashboardFilterRuleForQuery(rule);

        return {
            dimensions: getDashboardFilterRulesForTile(tileUuid, [
                ...dashboardFilters.dimensions,
                ...(dashboardTemporaryFilters?.dimensions ?? []),
            ]).map(forQuery),
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

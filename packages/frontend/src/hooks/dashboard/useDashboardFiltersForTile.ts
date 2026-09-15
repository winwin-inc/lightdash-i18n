import {
    backfillDashboardFilterRulesTileTargets,
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
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    return useMemo(() => {
        if (!isGlobalFilterEnabled) return emptyFilters;

        const forQuery = (rule: typeof dashboardFilters.dimensions[number]) =>
            prepareDashboardFilterRuleForQuery(rule);

        const dimensions = backfillDashboardFilterRulesTileTargets(
            [
                ...dashboardFilters.dimensions,
                ...(dashboardTemporaryFilters?.dimensions ?? []),
            ],
            filterableFieldsByTileUuid,
        );
        const metrics = backfillDashboardFilterRulesTileTargets(
            [
                ...dashboardFilters.metrics,
                ...(dashboardTemporaryFilters?.metrics ?? []),
            ],
            filterableFieldsByTileUuid,
        );
        const tableCalculations = backfillDashboardFilterRulesTileTargets(
            [
                ...dashboardFilters.tableCalculations,
                ...(dashboardTemporaryFilters?.tableCalculations ?? []),
            ],
            filterableFieldsByTileUuid,
        );

        return {
            dimensions: getDashboardFilterRulesForTile(
                tileUuid,
                dimensions,
            ).map(forQuery),
            metrics: getDashboardFilterRulesForTile(tileUuid, metrics),
            tableCalculations: getDashboardFilterRulesForTile(
                tileUuid,
                tableCalculations,
            ),
        };
    }, [
        tileUuid,
        dashboardFilters,
        dashboardTemporaryFilters,
        isGlobalFilterEnabled,
        filterableFieldsByTileUuid,
    ]);
};

export default useDashboardFiltersForTile;

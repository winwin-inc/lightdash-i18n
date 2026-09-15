import {
    backfillDashboardFilterRulesTileTargets,
    getDashboardFilterRulesForTile,
    type DashboardFilters,
} from '@lightdash/common';
import { useMemo } from 'react';
import { prepareDashboardFilterRuleForQuery } from '../../components/common/Filters/FilterInputs/utils';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

const useDashboardTabFiltersForTile = (
    tabUuid: string,
    tileUuid: string,
): DashboardFilters => {
    // getMergedFiltersForTab already includes tab temporary filters
    // and honors global/tab enable flags.
    const tabFilters = useDashboardContext((c) =>
        c.getMergedFiltersForTab(tabUuid),
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    return useMemo(() => {
        const forQuery = (rule: (typeof tabFilters.dimensions)[number]) =>
            prepareDashboardFilterRuleForQuery(rule);

        const dimensions = backfillDashboardFilterRulesTileTargets(
            tabFilters.dimensions,
            filterableFieldsByTileUuid,
        );
        const metrics = backfillDashboardFilterRulesTileTargets(
            tabFilters.metrics,
            filterableFieldsByTileUuid,
        );
        const tableCalculations = backfillDashboardFilterRulesTileTargets(
            tabFilters.tableCalculations,
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
    }, [tileUuid, tabFilters, filterableFieldsByTileUuid]);
};

export default useDashboardTabFiltersForTile;

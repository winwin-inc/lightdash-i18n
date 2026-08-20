import {
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

    return useMemo(() => {
        const forQuery = (rule: (typeof tabFilters.dimensions)[number]) =>
            prepareDashboardFilterRuleForQuery(rule);

        return {
            dimensions: getDashboardFilterRulesForTile(
                tileUuid,
                tabFilters.dimensions,
            ).map(forQuery),
            metrics: getDashboardFilterRulesForTile(
                tileUuid,
                tabFilters.metrics,
            ),
            tableCalculations: getDashboardFilterRulesForTile(
                tileUuid,
                tabFilters.tableCalculations,
            ),
        };
    }, [tileUuid, tabFilters]);
};

export default useDashboardTabFiltersForTile;

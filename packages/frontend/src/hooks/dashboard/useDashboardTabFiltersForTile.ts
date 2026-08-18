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
    const tabFilters = useDashboardContext((c) =>
        c.getMergedFiltersForTab(tabUuid),
    );
    const tabTemporaryFilters = useDashboardContext((c) =>
        c.getActiveTabTemporaryFilters(tabUuid),
    );

    return useMemo(() => {
        const forQuery = (rule: typeof tabFilters.dimensions[number]) =>
            prepareDashboardFilterRuleForQuery(rule);

        return {
            dimensions: getDashboardFilterRulesForTile(tileUuid, [
                ...tabFilters.dimensions,
                ...(tabTemporaryFilters?.dimensions ?? []),
            ]).map(forQuery),
            metrics: getDashboardFilterRulesForTile(tileUuid, [
                ...tabFilters.metrics,
                ...(tabTemporaryFilters?.metrics ?? []),
            ]),
            tableCalculations: getDashboardFilterRulesForTile(tileUuid, [
                ...tabFilters.tableCalculations,
                ...(tabTemporaryFilters?.tableCalculations ?? []),
            ]),
        };
    }, [tileUuid, tabFilters, tabTemporaryFilters]);
};

export default useDashboardTabFiltersForTile;

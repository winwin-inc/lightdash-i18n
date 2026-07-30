import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';
import {
    AUTO_FETCH_ENABLED_DEFAULT,
    AUTO_FETCH_ENABLED_KEY,
} from '../components/RunQuerySettings/defaults';
import {
    explorerActions,
    selectFromDashboard,
    selectIsEditMode,
    selectIsResultsExpanded,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import { useExplorerQueryManager } from './useExplorerQueryManager';

/**
 * Effects layer for Explorer query orchestration
 *
 * This hook handles:
 * - Auto-fetch logic:
 *   1. Initial fetch: Always runs once for saved charts, dashboards, or pivot configs
 *   2. Reactive fetch: Runs when state changes (dimensions, metrics, filters, params)
 *      if auto-fetch is enabled
 * - Unpivoted query setup for pivot tables
 *
 * Should be called ONCE at the Explorer root component.
 * Child components should use useExplorerQuery() instead.
 */
export const useExplorerQueryEffects = ({
    minimal = false,
}: { minimal?: boolean } = {}) => {
    const dispatch = useExplorerDispatch();

    useEffect(() => {
        dispatch(explorerActions.setIsMinimal(minimal));
    }, [minimal, dispatch]);

    // Get all state and runQuery from manager (single source of truth)
    const { runQuery, query, validQueryArgs } = useExplorerQueryManager();

    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isResultsOpen = useExplorerSelector(selectIsResultsExpanded);
    const fromDashboard = useExplorerSelector(selectFromDashboard);

    // Auto-fetch configuration
    const [autoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    // Check if this is a saved chart or has pivot config from Context
    const isSavedChart = useExplorerContext(
        (context) => !!context.state.savedChart,
    );

    // Effect 1: Auto-fetch logic
    // Handles both initial fetch and reactive auto-fetch
    useEffect(() => {
        if (
            autoFetchEnabled ||
            ((isSavedChart || fromDashboard) &&
                !isEditMode &&
                !query.isFetched) ||
            (isEditMode && !query.isFetched && (isSavedChart || fromDashboard))
        ) {
            runQuery();
        }
    }, [
        autoFetchEnabled,
        isSavedChart,
        fromDashboard,
        runQuery,
        query.isFetched,
        isEditMode,
    ]);

    // Effect 2: Setup unpivoted query args whenever the main query is pivoted.
    // Aligns with main query pivotConfiguration (including when UseSqlPivotResults is off
    // but getChartRequiresPivotResults forces pivot for stacked series sorting).
    useEffect(() => {
        if (!validQueryArgs) {
            dispatch(explorerActions.setUnpivotedQueryArgs(null));
            return;
        }

        if (validQueryArgs.pivotConfiguration && isResultsOpen) {
            dispatch(
                explorerActions.setUnpivotedQueryArgs({
                    ...validQueryArgs,
                    pivotConfiguration: undefined,
                    pivotResults: false,
                }),
            );
        } else {
            dispatch(explorerActions.setUnpivotedQueryArgs(null));
        }
    }, [validQueryArgs, isResultsOpen, dispatch]);

    // No return - this hook just orchestrates effects
};

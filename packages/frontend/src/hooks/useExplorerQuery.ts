import { FeatureFlags } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
    explorerActions,
    selectIsMinimal,
    selectUnpivotedQueryArgs,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplorerQueryManager } from './useExplorerQueryManager';
import { useFeatureFlag } from './useFeatureFlagEnabled';
import {
    executeQueryAndWaitForResults,
    useCancelQuery,
    type QueryResultsProps,
} from './useQueryResults';

/**
 * Public API for Explorer query management
 *
 * This hook provides:
 * - All query state from useExplorerQueryManager
 * - Action functions for components (fetchResults, cancelQuery, etc.)
 *
 * Use this hook in components that need to interact with queries.
 * For effects/orchestration, use useExplorerQueryEffects at the root.
 */
export const useExplorerQuery = () => {
    // Get all state and runQuery from manager (single source of truth)
    const minimal = useExplorerSelector(selectIsMinimal);
    const manager = useExplorerQueryManager();
    const { queryResults, runQuery, validQueryArgs, unpivotedQueryResults } =
        manager;

    // Redux dispatch and query client for actions
    const dispatch = useExplorerDispatch();
    const queryClient = useQueryClient();

    const projectUuid = manager.projectUuid;
    const unpivotedQueryArgs = useExplorerSelector(selectUnpivotedQueryArgs);
    const unpivotedEnabled = !!unpivotedQueryArgs;

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    // Action: Reset query results
    const resetQueryResults = useCallback(() => {
        dispatch(explorerActions.resetQueryExecution());
        queryClient.removeQueries({
            queryKey: ['create-query'],
            exact: false,
        });
    }, [queryClient, dispatch]);

    // Action: Fetch results (force refresh - bypasses auto-fetch setting)
    const fetchResults = useCallback(() => {
        resetQueryResults();
        runQuery();
    }, [resetQueryResults, runQuery]);

    // Action: Get download query UUID for CSV/XLSX export.
    //
    // IMPORTANT — pivotConfiguration must not leak into unpivoted downloads:
    // - ResultsCard always calls getDownloadQueryUuid(limit, false) (raw / unpivoted).
    // - ChartDownloadMenu calls getDownloadQueryUuid(limit, true) when pivoted export is wanted.
    // - validQueryArgs often already contains pivotConfiguration (e.g. after stacked-series
    //   sorting forced pivot via getChartRequiresPivotResults, even if UseSqlPivotResults is off).
    // - Spreading ...validQueryArgs on Limit.ALL / custom-limit re-runs used to keep that
    //   pivotConfiguration while pivotResults was false. Backend then wrote pivoted row keys
    //   (e.g. metric_sum_pivotValue) but CsvService/ExcelService still read original fieldIds
    //   → dimensions present, all metrics blank. TABLE downloads reused the unpivoted
    //   queryUuid so they looked fine. Upstream fix: lightdash/lightdash#19115 (c961c56b33).
    // - Regression window locally: after 61e321ac5f (force pivot for stacked sort) without #19115.
    // Do NOT remove the explicit pivotConfiguration: shouldPivot ? ... : undefined override
    // when changing this function — that is what prevents the empty-metrics export bug.
    const getDownloadQueryUuid = useCallback(
        async (limit: number | null, exportPivotedResults: boolean = false) => {
            // When unpivotedResultsEnabled it means that queryResults are pivoted results
            // therefore we need to use unpivotedQueryResults if we want to download raw results
            let queryUuid =
                unpivotedEnabled && !exportPivotedResults
                    ? unpivotedQueryResults.queryUuid
                    : queryResults.queryUuid;

            if (limit === null || limit !== queryResults.totalResults) {
                const shouldPivot =
                    exportPivotedResults && !!useSqlPivotResults?.enabled;
                const queryArgsWithLimit: QueryResultsProps | null =
                    validQueryArgs
                        ? {
                              ...validQueryArgs,
                              csvLimit: limit,
                              invalidateCache: minimal,
                              pivotResults: shouldPivot,
                              // Must override spread of validQueryArgs — see block comment above.
                              pivotConfiguration: shouldPivot
                                  ? validQueryArgs.pivotConfiguration
                                  : undefined,
                          }
                        : null;
                const downloadQuery = await executeQueryAndWaitForResults(
                    queryArgsWithLimit,
                );
                queryUuid = downloadQuery.queryUuid;
            }
            if (!queryUuid) {
                throw new Error(`Missing query uuid`);
            }
            return queryUuid;
        },
        [
            unpivotedEnabled,
            unpivotedQueryResults.queryUuid,
            queryResults.queryUuid,
            queryResults.totalResults,
            validQueryArgs,
            minimal,
            useSqlPivotResults?.enabled,
        ],
    );

    // Action: Cancel query
    const { mutate: cancelQueryMutation } = useCancelQuery(
        projectUuid,
        queryResults.queryUuid,
    );
    const cancelQuery = useCallback(() => {
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        if (queryResults.queryUuid) {
            cancelQueryMutation();
        }
    }, [queryClient, queryResults.queryUuid, cancelQueryMutation]);

    return {
        // Spread all state from manager
        ...manager,

        // Add action functions
        fetchResults,
        resetQueryResults,
        getDownloadQueryUuid,
        cancelQuery,
    };
};

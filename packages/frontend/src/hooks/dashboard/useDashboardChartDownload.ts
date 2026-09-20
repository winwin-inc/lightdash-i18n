import {
    FeatureFlags,
    getChartRequiresPivotResults,
    MAX_SAFE_INTEGER,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ChartConfig,
    type CreateSavedChartVersion,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';
import { Limit } from '../../components/ExportResults/types';
import { pollForResults } from '../../features/queryRunner/executeQuery';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useFeatureFlag } from '../useFeatureFlagEnabled';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';
import useDashboardTabFiltersForTile from './useDashboardTabFiltersForTile';

export const useDashboardChartDownload = (
    tileUuid: string,
    chartUuid: string,
    tabUuid: string,
    projectUuid: string | undefined,
    dashboardUuid: string | undefined,
    originalQueryUuid: string,
    chartConfig: ChartConfig | undefined = undefined,
    pivotConfig: CreateSavedChartVersion['pivotConfig'] | undefined = undefined,
) => {
    // Get dashboard filters and sorts for this tile
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const dashboardTabFilters = useDashboardTabFiltersForTile(
        tabUuid,
        tileUuid,
    );
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameters = useDashboardContext((c) => c.parameterValues);
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );

    const effectiveDashboardFilters = useMemo(() => {
        if (tabUuid) {
            return dashboardTabFilters;
        }

        return dashboardFilters;
    }, [tabUuid, dashboardTabFilters, dashboardFilters]);

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    // Keep ALL-results re-runs aligned with the tile's display query shape.
    //
    // TABLE downloads reuse originalQueryUuid (already executed with shouldUsePivotResults
    // in useDashboardChartReadyQuery). ALL / CUSTOM re-run a new dashboard-chart query —
    // if we only passed UseSqlPivotResults here, charts that require pivot via
    // getChartRequiresPivotResults (stacked series / pivot columns) would get a different
    // row shape than TABLE and exports could look "empty" or mismatched.
    // Prefer matching display: flag OR getChartRequiresPivotResults(chartConfig, pivotConfig).
    const shouldUsePivotResults =
        !!useSqlPivotResults?.enabled ||
        getChartRequiresPivotResults(chartConfig, pivotConfig);

    const getDownloadQueryUuid = useCallback(
        async (limit: number | null, limitType: Limit): Promise<string> => {
            if (!projectUuid || !dashboardUuid) {
                throw new Error('Missing required parameters');
            }

            // When limiting to the table, use the original query uuid so we don't execute a new query
            if (limitType === Limit.TABLE) {
                return originalQueryUuid;
            }

            // Execute a new query with the specified limit for download.
            // pivotResults must use shouldUsePivotResults (above), not the flag alone.
            const executeQueryResponse =
                await lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
                    url: `/projects/${projectUuid}/query/dashboard-chart`,
                    version: 'v2',
                    method: 'POST',
                    body: JSON.stringify({
                        context: QueryExecutionContext.DASHBOARD,
                        chartUuid,
                        dashboardUuid,
                        dashboardFilters: effectiveDashboardFilters || {},
                        dashboardSorts: dashboardSorts || [],
                        dateZoom: dateZoomGranularity
                            ? { granularity: dateZoomGranularity }
                            : undefined,
                        limit: limit ?? MAX_SAFE_INTEGER,
                        invalidateCache: false,
                        parameters,
                        pivotResults: shouldUsePivotResults,
                    }),
                });

            // Poll for results similar to executeQueryAndWaitForResults
            const results = await pollForResults(
                projectUuid,
                executeQueryResponse.queryUuid,
            );

            if (results.status === QueryHistoryStatus.ERROR) {
                throw new Error(results.error || 'Error executing SQL query');
            }

            if (results.status !== QueryHistoryStatus.READY) {
                throw new Error('Unexpected query status');
            }

            return executeQueryResponse.queryUuid;
        },
        [
            projectUuid,
            dashboardUuid,
            chartUuid,
            effectiveDashboardFilters,
            dashboardSorts,
            dateZoomGranularity,
            parameters,
            shouldUsePivotResults,
            originalQueryUuid,
        ],
    );

    return { getDownloadQueryUuid };
};

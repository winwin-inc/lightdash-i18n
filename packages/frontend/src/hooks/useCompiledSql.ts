import {
    type ApiCompiledQueryResults,
    type ApiError,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectDimensions,
    selectFilters,
    selectFromDashboard,
    selectMetrics,
    selectParameters,
    selectQueryLimit,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    selectTimezone,
    useExplorerSelector,
} from '../features/explorer/store';
import { applyChartTablePaginationToMetricQuery } from '../utils/applyChartTablePaginationToMetricQuery';
import { convertDateFilters } from '../utils/dateFilter';
import { useEffectiveChartTablePagination } from './useEffectiveChartTablePagination';
import useQueryError from './useQueryError';

const getCompiledQuery = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
    queryParameters?: ParametersValuesMap,
    dashboardUuid?: string,
) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
        parameters: queryParameters,
        ...(dashboardUuid ? { dashboardUuid } : {}),
    };

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
};

export const useCompiledSql = (
    queryOptions?: UseQueryOptions<ApiCompiledQueryResults, ApiError>,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const tableId = useExplorerSelector(selectTableName);
    const dimensions = useExplorerSelector(selectDimensions);
    const metrics = useExplorerSelector(selectMetrics);
    const filters = useExplorerSelector(selectFilters);
    const sorts = useExplorerSelector(selectSorts);
    const limit = useExplorerSelector(selectQueryLimit);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const timezone = useExplorerSelector(selectTimezone);
    const queryParameters = useExplorerSelector(selectParameters);
    const fromDashboard = useExplorerSelector(selectFromDashboard);
    const chartTablePagination = useEffectiveChartTablePagination();

    const setErrorResponse = useQueryError();
    const metricQuery = useMemo((): MetricQuery => {
        const base: MetricQuery = {
            exploreName: tableId,
            dimensions: Array.from(dimensions),
            metrics: Array.from(metrics),
            sorts,
            filters,
            limit: limit || 500,
            tableCalculations,
            additionalMetrics,
            customDimensions,
            timezone: timezone ?? undefined,
        };
        return applyChartTablePaginationToMetricQuery(
            base,
            chartTablePagination,
        );
    }, [
        tableId,
        dimensions,
        metrics,
        sorts,
        filters,
        limit,
        tableCalculations,
        additionalMetrics,
        customDimensions,
        timezone,
        chartTablePagination,
    ]);
    const queryKey = [
        'compiledQuery',
        tableId,
        metricQuery,
        projectUuid,
        timezone,
        queryParameters,
        fromDashboard,
        chartTablePagination,
    ];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getCompiledQuery(
                projectUuid!,
                tableId || '',
                metricQuery,
                queryParameters,
                fromDashboard,
            ),
        onError: (result) => setErrorResponse(result),
        // Do not keep previous SQL — enablePagination / page changes must not
        // leave the Query panel showing a stale LIMIT without OFFSET.
        keepPreviousData: false,
        ...queryOptions,
        enabled: (queryOptions?.enabled ?? true) && !!tableId && !!projectUuid,
    });
};

export const useCompiledSqlFromMetricQuery = ({
    tableName,
    projectUuid,
    metricQuery,
}: Partial<{
    tableName: string;
    projectUuid: string;
    metricQuery: MetricQuery;
}>) => {
    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey: ['compiledQuery', tableName, metricQuery, projectUuid],
        queryFn: () => getCompiledQuery(projectUuid!, tableName!, metricQuery!),
        enabled: !!tableName && !!projectUuid && !!metricQuery,
    });
};

import { type MetricQuery, type ParametersValuesMap } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type TablePaginationState } from '../components/LightdashVisualization/context';
import { useQueryExecutor } from '../providers/Explorer/useQueryExecutor';
import { useCalculateCount } from './useCalculateCount';
import { useDateZoomGranularitySearch } from './useExplorerRoute';
import { type QueryResultsProps } from './useQueryResults';

type Args = {
    enabled: boolean;
    projectUuid: string | undefined;
    tableName: string;
    metricQuery: MetricQuery;
    configuredPageSize: number;
    parameters: ParametersValuesMap | undefined;
    missingRequiredParameters: string[] | null;
    fromDashboard: string | undefined;
};

/**
 * Independent warehouse LIMIT/OFFSET query for Explore chart preview.
 * Does not replace the Explorer results-table query.
 */
export const useExplorerChartPagedQuery = ({
    enabled,
    projectUuid,
    tableName,
    metricQuery,
    configuredPageSize,
    parameters,
    missingRequiredParameters,
    fromDashboard,
}: Args) => {
    const dateZoomGranularity = useDateZoomGranularitySearch();
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(configuredPageSize);

    const metricQueryPagingKey = useMemo(
        () =>
            JSON.stringify({
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
                filters: metricQuery.filters,
                sorts: metricQuery.sorts,
                additionalMetrics: metricQuery.additionalMetrics,
                tableCalculations: metricQuery.tableCalculations,
                customDimensions: metricQuery.customDimensions,
            }),
        [metricQuery],
    );

    useEffect(() => {
        setPageIndex(0);
        setPageSize(configuredPageSize);
    }, [metricQueryPagingKey, configuredPageSize]);

    const pagedMetricQuery = useMemo(
        (): MetricQuery => ({
            ...metricQuery,
            limit: pageSize,
            offset: pageIndex * pageSize,
        }),
        [metricQuery, pageIndex, pageSize],
    );

    const queryArgs = useMemo((): QueryResultsProps | null => {
        if (!enabled || !projectUuid || !tableName) {
            return null;
        }
        return {
            projectUuid,
            tableId: tableName,
            query: pagedMetricQuery,
            dateZoomGranularity,
            invalidateCache: true,
            parameters: parameters || {},
            fromDashboard,
        };
    }, [
        enabled,
        projectUuid,
        tableName,
        pagedMetricQuery,
        dateZoomGranularity,
        parameters,
        fromDashboard,
    ]);

    const [{ query, queryResults }] = useQueryExecutor(
        queryArgs,
        missingRequiredParameters,
        enabled,
    );

    const shouldFetchCount = Boolean(
        enabled &&
            (pageIndex > 0 || queryResults.rows.length >= pageSize),
    );

    const count = useCalculateCount({
        metricQuery,
        explore: tableName,
        parameters,
        enabled: shouldFetchCount,
    });

    const onPageSizeChange = useCallback((nextPageSize: number) => {
        setPageSize(nextPageSize);
        setPageIndex(0);
    }, []);

    const tablePagination = useMemo((): TablePaginationState | undefined => {
        if (!enabled) {
            return undefined;
        }
        return {
            enabled: true,
            pageIndex,
            pageSize,
            totalRowCount:
                count.data?.rowCount ??
                (pageIndex === 0 && queryResults.rows.length < pageSize
                    ? queryResults.rows.length
                    : queryResults.totalResults),
            isCountLoading: count.isFetching,
            onPageChange: setPageIndex,
            onPageSizeChange,
        };
    }, [
        enabled,
        pageIndex,
        pageSize,
        count.data?.rowCount,
        count.isFetching,
        queryResults.rows.length,
        queryResults.totalResults,
        onPageSizeChange,
    ]);

    const isLoading =
        query.isFetching || queryResults.isFetchingFirstPage;

    return {
        query,
        queryResults,
        tablePagination,
        isLoading,
    };
};

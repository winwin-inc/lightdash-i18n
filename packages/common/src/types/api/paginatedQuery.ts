import { type ParametersValuesMap, type PivotConfiguration } from '../..';

import type { QueryExecutionContext } from '../analytics';
import type { DownloadFileType } from '../downloadFile';
import type { DashboardFilters, Filters } from '../filter';
import type { MetricSourcedMergeQuery } from '../mergeQuery';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { PivotConfig } from '../pivot';
import type { DateGranularity } from '../timeFrames';

type CommonExecuteQueryRequestParams = {
    context?: QueryExecutionContext;
    invalidateCache?: boolean;
    parameters?: ParametersValuesMap;
};

export type DateZoom = {
    granularity?: DateGranularity;
    xAxisFieldId?: string;
};

export type ExecuteAsyncMetricQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        query: Omit<MetricQueryRequest, 'csvLimit'>;
        dateZoom?: DateZoom;
        pivotConfiguration?: PivotConfiguration;
        /** 从看板跳转到探索页时传入，用于在查询时保持看板上下文（dashboardSlug/dashboardName 等内置用户属性） */
        dashboardUuid?: string;
    };

export type ExecuteAsyncSavedChartRequestParams =
    CommonExecuteQueryRequestParams & {
        chartUuid: string;
        versionUuid?: string;
        limit?: number | null | undefined;
        offset?: number;
        pivotResults?: boolean;
    };

export type ExecuteAsyncDashboardChartRequestParams =
    CommonExecuteQueryRequestParams & {
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        dateZoom?: DateZoom;
        limit?: number | null | undefined;
        offset?: number;
        pivotResults?: boolean;
    };

/** A merge run: the spec that produced it, recorded verbatim. */
export type ExecuteAsyncMergeQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        /**
         * Warehouse-side merges are metric-sourced by construction.
         */
        mergeQuery: MetricSourcedMergeQuery;
        pivotConfiguration?: PivotConfiguration;
    };

export type ExecuteAsyncSqlQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        sql: string;
        limit?: number;
        pivotConfiguration?: PivotConfiguration;
    };

export type ExecuteAsyncUnderlyingDataRequestParams =
    CommonExecuteQueryRequestParams & {
        underlyingDataSourceQueryUuid: string;
        underlyingDataItemId?: string;
        filters: Filters;
        dateZoom?: DateZoom;
        limit?: number;
    };

export type ExecuteAsyncSqlChartByUuidRequestParams =
    CommonExecuteQueryRequestParams & {
        savedSqlUuid: string;
        limit?: number;
    };

export type ExecuteAsyncSqlChartBySlugRequestParams =
    CommonExecuteQueryRequestParams & {
        slug: string;
        limit?: number;
    };

export type ExecuteAsyncSqlChartRequestParams =
    | ExecuteAsyncSqlChartByUuidRequestParams
    | ExecuteAsyncSqlChartBySlugRequestParams;

export const isExecuteAsyncSqlChartByUuidParams = (
    params: ExecuteAsyncSqlChartRequestParams,
): params is ExecuteAsyncSqlChartByUuidRequestParams =>
    'savedSqlUuid' in params;

type ExecuteAsyncDashboardSqlChartCommonParams =
    CommonExecuteQueryRequestParams & {
        dashboardUuid: string;
        tileUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        limit?: number;
    };

export type ExecuteAsyncDashboardSqlChartByUuidRequestParams =
    ExecuteAsyncDashboardSqlChartCommonParams & {
        savedSqlUuid: string;
    };

export type ExecuteAsyncDashboardSqlChartBySlugRequestParams =
    ExecuteAsyncDashboardSqlChartCommonParams & {
        slug: string;
    };

export type ExecuteAsyncDashboardSqlChartRequestParams =
    | ExecuteAsyncDashboardSqlChartByUuidRequestParams
    | ExecuteAsyncDashboardSqlChartBySlugRequestParams;

export const isExecuteAsyncDashboardSqlChartByUuidParams = (
    params: ExecuteAsyncDashboardSqlChartRequestParams,
): params is ExecuteAsyncDashboardSqlChartByUuidRequestParams =>
    'savedSqlUuid' in params;

export type DownloadAsyncQueryResultsRequestParams = {
    queryUuid: string;
    type?: DownloadFileType;
    onlyRaw?: boolean;
    showTableNames?: boolean;
    customLabels?: Record<string, string>;
    columnOrder?: string[];
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
    attachmentDownloadName?: string;
};

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams
    | ExecuteAsyncUnderlyingDataRequestParams
    | ExecuteAsyncDashboardSqlChartRequestParams
    | ExecuteAsyncMergeQueryRequestParams;

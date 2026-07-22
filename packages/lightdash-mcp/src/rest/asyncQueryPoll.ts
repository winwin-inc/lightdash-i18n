import type {
    ApiExecuteAsyncMetricQueryResults,
    ApiExecuteAsyncSqlQueryResults,
    ApiGetAsyncQueryResults,
    ReadyQueryResultsPage,
    ExecuteAsyncMetricQueryRequestParams,
    ExecuteAsyncSqlQueryRequestParams,
} from '@lightdash/common';
import { QueryExecutionContext, QueryHistoryStatus } from '@lightdash/common';
import {
    clampLimit,
    normalizeMetricQueryRequest,
} from '../lib/normalizeMetricQuery';
import type { RequestJsonFn } from './types';

export function createAsyncQueryMethods(
    requestJson: RequestJsonFn,
    maxLimit: number,
) {
    async function executeMetricQuery(
        apiKey: string,
        projectUuid: string,
        body: ExecuteAsyncMetricQueryRequestParams,
    ): Promise<ApiExecuteAsyncMetricQueryResults> {
        const json = await requestJson<{
            results: ApiExecuteAsyncMetricQueryResults;
        }>(
            apiKey,
            `/api/v2/projects/${ 
                encodeURIComponent(projectUuid) 
                }/query/metric-query`,
            {
                method: 'POST',
                body: JSON.stringify(body),
            },
        );
        return json.results;
    }

    async function getQueryResultsPage(
        apiKey: string,
        projectUuid: string,
        queryUuid: string,
        page: number,
        pageSize: number,
    ): Promise<ApiGetAsyncQueryResults> {
        const json = await requestJson<{ results: ApiGetAsyncQueryResults }>(
            apiKey,
            `/api/v2/projects/${ 
                encodeURIComponent(projectUuid) 
                }/query/${ 
                encodeURIComponent(queryUuid) 
                }?page=${ 
                page 
                }&pageSize=${ 
                pageSize}`,
        );
        return json.results;
    }

    async function collectAllReadyRows(
        apiKey: string,
        projectUuid: string,
        queryUuid: string,
        firstPage: ReadyQueryResultsPage,
        pageSize: number,
    ): Promise<ReadyQueryResultsPage> {
        const mergedRows = [...firstPage.rows];
        const { nextPage: firstNextPage } = firstPage;
        let nextPage = firstNextPage;
        while (typeof nextPage === 'number' && nextPage > 0) {
            const page = await getQueryResultsPage(
                apiKey,
                projectUuid,
                queryUuid,
                nextPage,
                pageSize,
            );
            if (page.status !== QueryHistoryStatus.READY) break;
            mergedRows.push(...page.rows);
            nextPage = page.nextPage;
        }
        return {
            ...firstPage,
            rows: mergedRows,
        };
    }

    async function runMetricQueryUntilReady(
        apiKey: string,
        projectUuid: string,
        partialBody: {
            context?: ExecuteAsyncMetricQueryRequestParams['context'];
            invalidateCache?: boolean;
            parameters?: ExecuteAsyncMetricQueryRequestParams['parameters'];
            dateZoom?: ExecuteAsyncMetricQueryRequestParams['dateZoom'];
            pivotConfiguration?: ExecuteAsyncMetricQueryRequestParams['pivotConfiguration'];
            dashboardUuid?: string;
            query: Record<string, unknown>;
        },
        options: {
            pageSize: number;
            maxPollAttempts: number;
            pollIntervalMs: number;
        },
    ): Promise<{
        queryUuid: string;
        rows: unknown[];
        columns: unknown;
        executeResult: ApiExecuteAsyncMetricQueryResults;
    }> {
        const normalizedQuery = normalizeMetricQueryRequest(partialBody.query);
        const limitedQuery = {
            ...normalizedQuery,
            limit: clampLimit(normalizedQuery.limit, maxLimit),
        };
        const body: ExecuteAsyncMetricQueryRequestParams = {
            context: partialBody.context,
            invalidateCache: partialBody.invalidateCache,
            parameters: partialBody.parameters,
            dateZoom: partialBody.dateZoom,
            pivotConfiguration: partialBody.pivotConfiguration,
            dashboardUuid: partialBody.dashboardUuid,
            query: limitedQuery,
        };
        const executeResult = await executeMetricQuery(
            apiKey,
            projectUuid,
            body,
        );
        const { queryUuid } = executeResult;

        for (let i = 0; i < options.maxPollAttempts; i += 1) {
            const page = await getQueryResultsPage(
                apiKey,
                projectUuid,
                queryUuid,
                1,
                options.pageSize,
            );
            if (page.status === QueryHistoryStatus.ERROR) {
                throw new Error(page.error ?? 'Query failed');
            }
            if (page.status === QueryHistoryStatus.CANCELLED) {
                return {
                    queryUuid,
                    rows: [],
                    columns: {},
                    executeResult,
                };
            }
            if (page.status === QueryHistoryStatus.READY) {
                const mergedPage = await collectAllReadyRows(
                    apiKey,
                    projectUuid,
                    queryUuid,
                    page,
                    options.pageSize,
                );
                return {
                    queryUuid,
                    rows: mergedPage.rows,
                    columns: mergedPage.columns,
                    executeResult,
                };
            }
            await new Promise((r) => setTimeout(r, options.pollIntervalMs));
        }
        throw new Error(
            `Query ${ 
                queryUuid 
                } timed out after ${ 
                options.maxPollAttempts 
                } polls`,
        );
    }

    async function runSavedChart(
        apiKey: string,
        projectUuid: string,
        body: {
            chartUuid: string;
            versionUuid?: string;
            parameters?: Record<string, unknown>;
            limit?: number;
        },
        options: {
            pageSize: number;
            maxPollAttempts: number;
            pollIntervalMs: number;
        },
    ): Promise<{
        queryUuid: string;
        rows: unknown[];
        columns: unknown;
        fields: ApiExecuteAsyncMetricQueryResults['fields'];
        warnings: ApiExecuteAsyncMetricQueryResults['warnings'];
        parameterReferences: ApiExecuteAsyncMetricQueryResults['parameterReferences'];
        usedParametersValues: ApiExecuteAsyncMetricQueryResults['usedParametersValues'];
    }> {
        const payload = {
            ...body,
            limit:
                body.limit !== undefined
                    ? clampLimit(body.limit, maxLimit)
                    : body.limit,
        };
        const executeResult = await requestJson<{
            results: ApiExecuteAsyncMetricQueryResults;
        }>(
            apiKey,
            `/api/v2/projects/${ 
                encodeURIComponent(projectUuid) 
                }/query/chart`,
            {
                method: 'POST',
                body: JSON.stringify(payload),
            },
        ).then((r) => r.results);

        const { queryUuid } = executeResult;

        for (let i = 0; i < options.maxPollAttempts; i += 1) {
            const page = await getQueryResultsPage(
                apiKey,
                projectUuid,
                queryUuid,
                1,
                options.pageSize,
            );
            if (page.status === QueryHistoryStatus.ERROR) {
                throw new Error(page.error ?? 'Query failed');
            }
            if (page.status === QueryHistoryStatus.CANCELLED) {
                return {
                    queryUuid,
                    rows: [],
                    columns: {},
                    fields: executeResult.fields,
                    warnings: executeResult.warnings,
                    parameterReferences: executeResult.parameterReferences,
                    usedParametersValues: executeResult.usedParametersValues,
                };
            }
            if (page.status === QueryHistoryStatus.READY) {
                const mergedPage = await collectAllReadyRows(
                    apiKey,
                    projectUuid,
                    queryUuid,
                    page,
                    options.pageSize,
                );
                return {
                    queryUuid,
                    rows: mergedPage.rows,
                    columns: mergedPage.columns,
                    fields: executeResult.fields,
                    warnings: executeResult.warnings,
                    parameterReferences: executeResult.parameterReferences,
                    usedParametersValues: executeResult.usedParametersValues,
                };
            }
            await new Promise((r) => setTimeout(r, options.pollIntervalMs));
        }
        throw new Error(
            `Saved chart query ${ 
                queryUuid 
                } timed out after ${ 
                options.maxPollAttempts 
                } polls`,
        );
    }

    async function runDashboardChart(
        apiKey: string,
        projectUuid: string,
        body: {
            chartUuid: string;
            dashboardUuid: string;
            parameters?: Record<string, unknown>;
            limit?: number;
            dashboardFilters?: {
                dimensions?: unknown[];
                metrics?: unknown[];
                tableCalculations?: unknown[];
            };
            dashboardSorts?: unknown[];
        },
        options: {
            pageSize: number;
            maxPollAttempts: number;
            pollIntervalMs: number;
        },
    ): Promise<{
        queryUuid: string;
        rows: unknown[];
        columns: unknown;
        fields: ApiExecuteAsyncMetricQueryResults['fields'];
        warnings: ApiExecuteAsyncMetricQueryResults['warnings'];
        parameterReferences: ApiExecuteAsyncMetricQueryResults['parameterReferences'];
        usedParametersValues: ApiExecuteAsyncMetricQueryResults['usedParametersValues'];
    }> {
        const payload = {
            chartUuid: body.chartUuid,
            dashboardUuid: body.dashboardUuid,
            dashboardFilters: body.dashboardFilters ?? {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            dashboardSorts: body.dashboardSorts ?? [],
            parameters: body.parameters,
            limit:
                body.limit !== undefined
                    ? clampLimit(body.limit, maxLimit)
                    : body.limit,
        };
        const executeResult = await requestJson<{
            results: ApiExecuteAsyncMetricQueryResults;
        }>(
            apiKey,
            `/api/v2/projects/${encodeURIComponent(
                projectUuid,
            )}/query/dashboard-chart`,
            {
                method: 'POST',
                body: JSON.stringify(payload),
            },
        ).then((r) => r.results);

        const { queryUuid } = executeResult;

        for (let i = 0; i < options.maxPollAttempts; i += 1) {
            const page = await getQueryResultsPage(
                apiKey,
                projectUuid,
                queryUuid,
                1,
                options.pageSize,
            );
            if (page.status === QueryHistoryStatus.ERROR) {
                throw new Error(page.error ?? 'Query failed');
            }
            if (page.status === QueryHistoryStatus.CANCELLED) {
                return {
                    queryUuid,
                    rows: [],
                    columns: {},
                    fields: executeResult.fields,
                    warnings: executeResult.warnings,
                    parameterReferences: executeResult.parameterReferences,
                    usedParametersValues: executeResult.usedParametersValues,
                };
            }
            if (page.status === QueryHistoryStatus.READY) {
                const mergedPage = await collectAllReadyRows(
                    apiKey,
                    projectUuid,
                    queryUuid,
                    page,
                    options.pageSize,
                );
                return {
                    queryUuid,
                    rows: mergedPage.rows,
                    columns: mergedPage.columns,
                    fields: executeResult.fields,
                    warnings: executeResult.warnings,
                    parameterReferences: executeResult.parameterReferences,
                    usedParametersValues: executeResult.usedParametersValues,
                };
            }
            await new Promise((r) => setTimeout(r, options.pollIntervalMs));
        }
        throw new Error(
            `Dashboard chart query ${queryUuid} timed out after ${options.maxPollAttempts} polls`,
        );
    }

    async function pollQueryPageUntilReady(
        apiKey: string,
        projectUuid: string,
        queryUuid: string,
        options: {
            pageSize: number;
            maxPollAttempts: number;
            pollIntervalMs: number;
        },
    ): Promise<ApiGetAsyncQueryResults> {
        for (let i = 0; i < options.maxPollAttempts; i += 1) {
            const page = await getQueryResultsPage(
                apiKey,
                projectUuid,
                queryUuid,
                1,
                options.pageSize,
            );
            const st = page.status as string;
            if (
                page.status === QueryHistoryStatus.ERROR ||
                st === 'expired'
            ) {
                throw new Error(
                    'error' in page ? (page.error ?? 'Query failed') : 'Query failed',
                );
            }
            if (
                page.status === QueryHistoryStatus.READY ||
                page.status === QueryHistoryStatus.CANCELLED
            ) {
                if (page.status === QueryHistoryStatus.READY) {
                    return collectAllReadyRows(
                        apiKey,
                        projectUuid,
                        queryUuid,
                        page,
                        options.pageSize,
                    );
                }
                return page;
            }
            await new Promise((r) => setTimeout(r, options.pollIntervalMs));
        }
        throw new Error(
            `Query ${ 
                queryUuid 
                } timed out after ${ 
                options.maxPollAttempts 
                } polls`,
        );
    }

    async function executeFieldValueSearch(
        apiKey: string,
        projectUuid: string,
        body: Record<string, unknown>,
    ): Promise<unknown> {
        const table =
            typeof body.table === 'string'
                ? body.table
                : (() => {
                      throw new Error('table is required');
                  })();
        const fieldId =
            typeof body.fieldId === 'string'
                ? body.fieldId
                : (() => {
                      throw new Error('fieldId is required');
                  })();
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${encodeURIComponent(
                projectUuid,
            )}/field/${encodeURIComponent(fieldId)}/search`,
            {
                method: 'POST',
                body: JSON.stringify({
                    table,
                    search:
                        typeof body.search === 'string'
                            ? body.search
                            : typeof body.query === 'string'
                              ? body.query
                              : '',
                    limit:
                        typeof body.limit === 'number'
                            ? body.limit
                            : clampLimit(100, maxLimit),
                    filters: body.filters,
                    forceRefresh:
                        typeof body.forceRefresh === 'boolean'
                            ? body.forceRefresh
                            : false,
                    parameters:
                        typeof body.parameters === 'object' ? body.parameters : undefined,
                    dashboardSlug:
                        typeof body.dashboardSlug === 'string'
                            ? body.dashboardSlug
                            : undefined,
                    dashboardName:
                        typeof body.dashboardName === 'string'
                            ? body.dashboardName
                            : undefined,
                }),
            },
        );
        return json.results ?? json;
    }

    async function searchFieldValuesUntilReady(
        apiKey: string,
        projectUuid: string,
        args: {
            table: string;
            fieldId: string;
            query: string;
            filters?: unknown;
            limit?: number;
        },
        options: {
            pageSize: number;
            maxPollAttempts: number;
            pollIntervalMs: number;
        },
    ): Promise<{ queryUuid: string; page: ApiGetAsyncQueryResults }> {
        const body: Record<string, unknown> = {
            table: args.table,
            fieldId: args.fieldId,
            search: args.query ?? '',
            limit: args.limit ?? 100,
            filters: args.filters,
            context: QueryExecutionContext.FILTER_AUTOCOMPLETE,
        };
        const result = (await executeFieldValueSearch(
            apiKey,
            projectUuid,
            body,
        )) as Record<string, unknown>;
        const values = Array.isArray(result.results) ? result.results : [];
        const rows = values.map((value) => ({ value }));
        const queryUuid = 'field-values-v1-search';
        const page = {
            status: QueryHistoryStatus.READY,
            rows,
            columns: {
                value: {
                    type: 'string',
                    reference: 'value',
                },
            },
        } as unknown as ApiGetAsyncQueryResults;
        return { queryUuid, page };
    }

    async function executeSqlQuery(
        apiKey: string,
        projectUuid: string,
        body: ExecuteAsyncSqlQueryRequestParams,
    ): Promise<ApiExecuteAsyncSqlQueryResults> {
        const json = await requestJson<{ results: ApiExecuteAsyncSqlQueryResults }>(
            apiKey,
            `/api/v2/projects/${ 
                encodeURIComponent(projectUuid) 
                }/query/sql`,
            {
                method: 'POST',
                body: JSON.stringify({
                    ...body,
                    context: body.context ?? QueryExecutionContext.SQL_RUNNER,
                }),
            },
        );
        return json.results;
    }

    async function runSqlUntilReady(
        apiKey: string,
        projectUuid: string,
        args: {
            sql: string;
            limit?: number;
            invalidateCache?: boolean;
            parameters?: Record<string, unknown>;
        },
        options: {
            pageSize: number;
            maxPollAttempts: number;
            pollIntervalMs: number;
        },
    ): Promise<{ queryUuid: string; page: ApiGetAsyncQueryResults }> {
        const body = {
            sql: args.sql,
            limit:
                args.limit !== undefined
                    ? clampLimit(args.limit, maxLimit)
                    : clampLimit(500, maxLimit),
            invalidateCache: args.invalidateCache,
            parameters: args.parameters,
            context: QueryExecutionContext.SQL_RUNNER,
        } as ExecuteAsyncSqlQueryRequestParams;
        const { queryUuid } = await executeSqlQuery(apiKey, projectUuid, body);
        const page = await pollQueryPageUntilReady(
            apiKey,
            projectUuid,
            queryUuid,
            options,
        );
        return { queryUuid, page };
    }

    return {
        runMetricQueryUntilReady,
        runSavedChart,
        runDashboardChart,
        searchFieldValuesUntilReady,
        runSqlUntilReady,
    };
}

import type {
    ApiExecuteAsyncMetricQueryResults,
    ApiGetAsyncQueryResults,
    ExecuteAsyncMetricQueryRequestParams,
} from '@lightdash/common';
import { QueryHistoryStatus } from '@lightdash/common';
import type { LightdashMcpEnvConfig } from './config';
import {
    clampLimit,
    normalizeMetricQueryRequest,
} from './normalizeMetricQuery';

function authHeaders(apiKey: string): Record<string, string> {
    return {
        Authorization: 'ApiKey ' + apiKey,
        'Content-Type': 'application/json',
    };
}

async function readErrorBody(res: Response): Promise<string> {
    const text = await res.text();
    try {
        const j = JSON.parse(text) as {
            error?: {
                name?: string;
                message?: string;
                data?: unknown;
                statusCode?: number;
            };
            message?: string;
        };
        const message = j.error?.message ?? j.message;
        const errorName = j.error?.name;
        const statusCode = j.error?.statusCode;
        const details =
            j.error?.data !== undefined ? JSON.stringify(j.error.data) : '';
        const parts = [errorName, statusCode, message, details]
            .filter((part): part is string | number => Boolean(part))
            .map((part) => String(part));
        return parts.length > 0 ? parts.join(' | ') : text;
    } catch {
        return text;
    }
}

export function createLightdashRestClient(config: LightdashMcpEnvConfig) {
    const { baseUrl, maxLimit } = config;

    async function requestJson<T>(
        apiKey: string,
        urlPath: string,
        init?: RequestInit,
    ): Promise<T> {
        const res = await fetch(baseUrl + urlPath, {
            ...init,
            headers: {
                ...authHeaders(apiKey),
                ...(init?.headers as Record<string, string> | undefined),
            },
        });
        if (!res.ok) {
            const msg = await readErrorBody(res);
            throw new Error('Lightdash API ' + res.status + ': ' + msg);
        }
        return res.json() as Promise<T>;
    }

    async function listExplores(
        apiKey: string,
        projectUuid: string,
        filtered: boolean,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/projects/' +
                encodeURIComponent(projectUuid) +
                '/explores?filtered=' +
                (filtered ? 'true' : 'false'),
        );
        return json.results ?? json;
    }

    async function getExplore(
        apiKey: string,
        projectUuid: string,
        exploreId: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/projects/' +
                encodeURIComponent(projectUuid) +
                '/explores/' +
                encodeURIComponent(exploreId),
        );
        return json.results ?? json;
    }

    async function executeMetricQuery(
        apiKey: string,
        projectUuid: string,
        body: ExecuteAsyncMetricQueryRequestParams,
    ): Promise<ApiExecuteAsyncMetricQueryResults> {
        const json = await requestJson<{
            results: ApiExecuteAsyncMetricQueryResults;
        }>(
            apiKey,
            '/api/v2/projects/' +
                encodeURIComponent(projectUuid) +
                '/query/metric-query',
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
            '/api/v2/projects/' +
                encodeURIComponent(projectUuid) +
                '/query/' +
                encodeURIComponent(queryUuid) +
                '?page=' +
                page +
                '&pageSize=' +
                pageSize,
        );
        return json.results;
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
                return {
                    queryUuid,
                    rows: page.rows,
                    columns: page.columns,
                    executeResult,
                };
            }
            await new Promise((r) => setTimeout(r, options.pollIntervalMs));
        }
        throw new Error(
            'Query ' +
                queryUuid +
                ' timed out after ' +
                options.maxPollAttempts +
                ' polls',
        );
    }

    // ----- 新增：语义化 API -----

    async function listProjects(apiKey: string): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/org/projects',
        );
        return json.results ?? json;
    }

    async function listSpaces(
        apiKey: string,
        projectUuid: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/projects/' +
                encodeURIComponent(projectUuid) +
                '/spaces',
        );
        return json.results ?? json;
    }

    async function searchContent(
        apiKey: string,
        projectUuid: string,
        options: {
            search?: string;
            contentTypes?: string[];
            page?: number;
            pageSize?: number;
        },
    ): Promise<unknown> {
        const params = new URLSearchParams();
        if (options.search) params.set('search', options.search);
        if (options.contentTypes?.length) {
            options.contentTypes.forEach((t) => params.append('contentTypes', t));
        }
        if (options.page) params.set('page', String(options.page));
        if (options.pageSize) params.set('pageSize', String(options.pageSize));
        // v2 content API 需要 projectUuids 参数
        params.set('projectUuids', projectUuid);

        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v2/content?' + params.toString(),
        );
        return json.results ?? json;
    }

    async function getSavedChart(
        apiKey: string,
        chartUuid: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/saved/' + encodeURIComponent(chartUuid),
        );
        return json.results ?? json;
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
            '/api/v2/projects/' +
                encodeURIComponent(projectUuid) +
                '/query/chart',
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
                return {
                    queryUuid,
                    rows: page.rows,
                    columns: page.columns,
                    fields: executeResult.fields,
                    warnings: executeResult.warnings,
                    parameterReferences: executeResult.parameterReferences,
                    usedParametersValues: executeResult.usedParametersValues,
                };
            }
            await new Promise((r) => setTimeout(r, options.pollIntervalMs));
        }
        throw new Error(
            'Saved chart query ' +
                queryUuid +
                ' timed out after ' +
                options.maxPollAttempts +
                ' polls',
        );
    }

    return {
        listExplores,
        getExplore,
        executeMetricQuery,
        getQueryResultsPage,
        runMetricQueryUntilReady,
        // 新增
        listProjects,
        listSpaces,
        searchContent,
        getSavedChart,
        runSavedChart,
    };
}

export type LightdashRestClient = ReturnType<typeof createLightdashRestClient>;

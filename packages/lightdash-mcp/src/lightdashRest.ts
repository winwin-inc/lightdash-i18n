import type {
    ApiExecuteAsyncMetricQueryResults,
    ApiGetAsyncQueryResults,
    ExecuteAsyncMetricQueryRequestParams,
} from '@lightdash/common';
import { QueryHistoryStatus } from '@lightdash/common';
import type { LightdashMcpEnvConfig } from './config';
import { clampLimit, normalizeMetricQueryRequest } from './normalizeMetricQuery';

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
            error?: { message?: string };
            message?: string;
        };
        return j.error?.message ?? j.message ?? text;
    } catch {
        return text;
    }
}

export function createLightdashRestClient(config: LightdashMcpEnvConfig) {
    const { baseUrl, apiKey, maxLimit } = config;

    async function requestJson<T>(urlPath: string, init?: RequestInit): Promise<T> {
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
        projectUuid: string,
        filtered: boolean,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            '/api/v1/projects/' +
                encodeURIComponent(projectUuid) +
                '/explores?filtered=' +
                (filtered ? 'true' : 'false'),
        );
        return json.results ?? json;
    }

    async function getExplore(
        projectUuid: string,
        exploreId: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            '/api/v1/projects/' +
                encodeURIComponent(projectUuid) +
                '/explores/' +
                encodeURIComponent(exploreId),
        );
        return json.results ?? json;
    }

    async function executeMetricQuery(
        projectUuid: string,
        body: ExecuteAsyncMetricQueryRequestParams,
    ): Promise<ApiExecuteAsyncMetricQueryResults> {
        const json = await requestJson<{
            results: ApiExecuteAsyncMetricQueryResults;
        }>(
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
        projectUuid: string,
        queryUuid: string,
        page: number,
        pageSize: number,
    ): Promise<ApiGetAsyncQueryResults> {
        const json = await requestJson<{ results: ApiGetAsyncQueryResults }>(
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
        const executeResult = await executeMetricQuery(projectUuid, body);
        const { queryUuid } = executeResult;

        for (let i = 0; i < options.maxPollAttempts; i += 1) {
            const page = await getQueryResultsPage(
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

    return {
        listExplores,
        getExplore,
        executeMetricQuery,
        getQueryResultsPage,
        runMetricQueryUntilReady,
    };
}

export type LightdashRestClient = ReturnType<typeof createLightdashRestClient>;

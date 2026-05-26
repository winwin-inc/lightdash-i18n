import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { QueryHistoryStatus } from '@lightdash/common';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import { metricQueryResultToCsvColumns, rowsToCsv } from '../../lib/csvUtils';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';
import {
    toArray,
    toArrayLike,
    toFilters,
    toObjectLike,
    toOptionalQueryContext,
    toSorts,
    toStringArray,
} from './metricQueryToolArgs';

export type CoreQueryToolsDeps = {
    getFieldResolver: (
        apiKey: string,
        projectUuid: string,
        exploreName: string,
    ) => Promise<(field: string) => string>;
    defaultPoll: {
        pageSize: number;
        maxPollAttempts: number;
        pollIntervalMs: number;
    };
};

export function registerQueryTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
    deps: CoreQueryToolsDeps,
): void {
    const poll = deps.defaultPoll;

    registerToolTyped(
        server,
        'core-tool',
        'search_field_values',
        '搜索某维度字段取值（POST …/query/field-values + 轮询）。query 可空字符串表示不限。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            table: z.string(),
            fieldId: z.string(),
            query: z.string().nullable().optional(),
            filters: z.any().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const { queryUuid, page } = await api.searchFieldValuesUntilReady(
                apiKey,
                projectUuid,
                {
                    table: args.table as string,
                    fieldId: args.fieldId as string,
                    query:
                        args.query === null || args.query === undefined
                            ? ''
                            : String(args.query),
                    filters: args.filters,
                    limit: 100,
                },
                poll,
            );
            const payload =
                page.status === QueryHistoryStatus.READY
                    ? {
                          queryUuid,
                          rows: page.rows,
                          columns: page.columns,
                      }
                    : { queryUuid, page };
            return {
                content: [
                    { type: 'text', text: JSON.stringify(payload, null, 2) },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'run_sql',
        '执行原始 SQL（POST …/query/sql + 轮询）。limit 受 LIGHTDASH_MAX_LIMIT 约束。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            sql: z.string(),
            limit: z.number().optional(),
            invalidateCache: z.boolean().optional(),
            parameters: z.any().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const { queryUuid, page } = await api.runSqlUntilReady(
                apiKey,
                projectUuid,
                {
                    sql: args.sql as string,
                    limit: args.limit as number | undefined,
                    invalidateCache: args.invalidateCache as boolean | undefined,
                    parameters: toObjectLike(args.parameters, 'parameters'),
                },
                poll,
            );
            const payload =
                page.status === QueryHistoryStatus.READY
                    ? {
                          queryUuid,
                          rows: page.rows,
                          columns: page.columns,
                      }
                    : { queryUuid, page };
            return {
                content: [
                    { type: 'text', text: JSON.stringify(payload, null, 2) },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'run_metric_query',
        '异步指标查询（v2 metric-query + 轮询）。参数为扁平字段，不使用 query 嵌套。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            exploreName: z.string().min(1),
            dimensions: z.array(z.string()).optional(),
            metrics: z.array(z.string()).optional(),
            filters: z.any().optional(),
            sorts: z.any().optional(),
            limit: z.number().optional(),
            tableCalculations: z.any().optional(),
            additionalMetrics: z.any().optional(),
            customDimensions: z.any().optional(),
            timezone: z.string().optional(),
            metricOverrides: z.any().optional(),
            context: z.string().optional(),
            invalidateCache: z.boolean().optional(),
            parameters: z.any().optional(),
            dateZoom: z.any().optional(),
            pivotConfiguration: z.any().optional(),
            dashboardUuid: z.string().optional(),
            pageSize: z.number().optional(),
            maxPollAttempts: z.number().optional(),
            pollIntervalMs: z.number().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const pageSize = (args.pageSize as number | undefined) ?? poll.pageSize;
            const maxPollAttempts =
                (args.maxPollAttempts as number | undefined) ??
                poll.maxPollAttempts;
            const pollIntervalMs =
                (args.pollIntervalMs as number | undefined) ??
                poll.pollIntervalMs;
            const exploreName = args.exploreName as string;
            const resolveFieldId = await deps.getFieldResolver(
                apiKey,
                projectUuid,
                exploreName,
            );
            const result = await api.runMetricQueryUntilReady(
                apiKey,
                projectUuid,
                {
                    context: toOptionalQueryContext(args.context),
                    invalidateCache: args.invalidateCache as boolean | undefined,
                    parameters: toObjectLike(args.parameters, 'parameters') as
                        | never
                        | undefined,
                    dateZoom: toObjectLike(args.dateZoom, 'dateZoom') as
                        | never
                        | undefined,
                    pivotConfiguration: toObjectLike(
                        args.pivotConfiguration,
                        'pivotConfiguration',
                    ) as never | undefined,
                    dashboardUuid: args.dashboardUuid as string | undefined,
                    query: {
                        exploreName,
                        dimensions: toStringArray(args.dimensions).map(
                            resolveFieldId,
                        ),
                        metrics: toStringArray(args.metrics).map(resolveFieldId),
                        filters: toFilters(args.filters, resolveFieldId),
                        sorts: toSorts(args.sorts, resolveFieldId),
                        limit: args.limit as number | undefined,
                        tableCalculations: toArray(args.tableCalculations),
                        additionalMetrics: toArrayLike(
                            args.additionalMetrics,
                            'additionalMetrics',
                        ),
                        customDimensions: toArrayLike(
                            args.customDimensions,
                            'customDimensions',
                        ),
                        timezone: args.timezone as string | undefined,
                        metricOverrides: toObjectLike(
                            args.metricOverrides,
                            'metricOverrides',
                        ),
                    },
                },
                { pageSize, maxPollAttempts, pollIntervalMs },
            );
            const rowsUnknown = result.rows as unknown[];
            const rowRecords = rowsUnknown.filter(
                (r): r is Record<string, unknown> =>
                    r !== null && typeof r === 'object' && !Array.isArray(r),
            );
            const { columnIds, headerLabels } = metricQueryResultToCsvColumns({
                columns: result.columns,
                fields: result.executeResult.fields,
                rows: rowsUnknown,
            });
            const csv =
                columnIds.length > 0
                    ? rowsToCsv({
                          columnIds,
                          headerLabels,
                          rows: rowRecords,
                      })
                    : '';
            const structuredContent = {
                queryUuid: result.queryUuid,
                rows: result.rows,
                columns: result.columns,
                fields: result.executeResult.fields,
                warnings: result.executeResult.warnings,
            };
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            csv.length > 0
                                ? csv
                                : '(no tabular columns; see JSON block)',
                    },
                    {
                        type: 'text',
                        text: JSON.stringify(structuredContent, null, 2),
                    },
                ],
                structuredContent,
            };
        },
    );
}

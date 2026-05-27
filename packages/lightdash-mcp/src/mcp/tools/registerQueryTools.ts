import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { QueryExecutionContext, QueryHistoryStatus } from '@lightdash/common';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import { metricQueryResultToCsvColumns, rowsToCsv } from '../../lib/csvUtils';
import { assertReadonlySql } from '../../lib/sqlSafety';
import { rowsToScalarFlat } from '../../lib/toolOutput';
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

function toMetricQueryBlock(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            return null;
        } catch {
            return null;
        }
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

function hasFlatMetricInputs(args: Record<string, unknown>): boolean {
    return (
        args.exploreName !== undefined ||
        args.dimensions !== undefined ||
        args.metrics !== undefined ||
        args.filters !== undefined ||
        args.sorts !== undefined ||
        args.limit !== undefined ||
        args.tableCalculations !== undefined ||
        args.additionalMetrics !== undefined ||
        args.customDimensions !== undefined ||
        args.timezone !== undefined ||
        args.metricOverrides !== undefined
    );
}

function getNormalizedDimensionFilterFieldIds(
    normalizedFilters: Record<string, unknown>,
): string[] {
    const { dimensions } = normalizedFilters;
    if (!Array.isArray(dimensions)) return [];
    return dimensions
        .map((rule) => {
            if (!rule || typeof rule !== 'object') return null;
            const { target } = rule as Record<string, unknown>;
            if (!target || typeof target !== 'object') return null;
            const { fieldId } = target as Record<string, unknown>;
            return typeof fieldId === 'string' ? fieldId : null;
        })
        .filter((fieldId): fieldId is string => fieldId !== null);
}

function buildMissingFilterErrorMessage(params: {
    fieldLabel: string;
    fieldId: string;
}): string {
    return [
        `缺少必需的筛选条件：explore 表中存在「${params.fieldLabel}」字段`,
        `(fieldId: ${params.fieldId})，`,
        '但 filters.dimensions.and 中未找到该字段的筛选条件。',
        '请在 filters.dimensions.and 里补充该字段后重试。',
    ].join('\n');
}

function formatRunMetricQueryError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('filters.dimensions.and')) return message;
    return `run_metric_query 执行失败：${message}\n请检查 queryConfig/exploreName、filters、sorts 与字段拼写是否正确。`;
}

function toSqlIdentifier(input: string): string {
    return `"${input.replace(/"/g, '""')}"`;
}

export function inferSqlDistinctField(table: string, fieldId: string): string {
    const prefix = `${table}_`;
    if (fieldId.startsWith(prefix) && fieldId.length > prefix.length) {
        return fieldId.slice(prefix.length);
    }
    return fieldId;
}

export function isFieldValuesEndpointMissing(message: string): boolean {
    const normalized = message.toLowerCase();
    const isHttp404 = /^lightdash api 404:/i.test(message);
    const mentionsFieldValues =
        normalized.includes('field-values') ||
        normalized.includes('/query/field-values') ||
        normalized.includes('/field/') ||
        normalized.includes('api endpoint not found') ||
        normalized.includes('notfounderror');
    return isHttp404 && mentionsFieldValues;
}

export function extractV1FieldValues(
    directResult: Record<string, unknown>,
): string[] {
    const candidates =
        Array.isArray(directResult.results)
            ? directResult.results
            : Array.isArray(directResult.values)
              ? directResult.values
              : Array.isArray(directResult.rows)
                ? directResult.rows
                : [];
    return candidates
        .map((value) => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }
            if (typeof value === 'object' && !Array.isArray(value)) {
                const row = value as Record<string, unknown>;
                if (typeof row.value === 'string') return row.value;
                if (
                    typeof row.value === 'number' ||
                    typeof row.value === 'boolean'
                ) {
                    return String(row.value);
                }
            }
            return null;
        })
        .filter((v): v is string => v !== null);
}

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
        '搜索某维度字段取值（优先走项目 field search 接口）。query 可空字符串表示不限。若接口不可用，将回退到 SQL DISTINCT（再失败则回退 metric-query）。',
        {
            projectUuid: z.string().optional(),
            table: z.string(),
            fieldId: z.string(),
            query: z.string().nullable().optional(),
            filters: z.any().optional(),
            full: z.boolean().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const full = (args.full as boolean | undefined) ?? false;
            const queryText =
                args.query === null || args.query === undefined
                    ? ''
                    : String(args.query);
            let payload: Record<string, unknown>;
            const hasFilters = args.filters !== undefined && args.filters !== null;
            try {
                const directResult = (await api.searchFieldUniqueValues(
                    apiKey,
                    projectUuid,
                    {
                        table: args.table as string,
                        fieldId: args.fieldId as string,
                        search: queryText,
                        filters: args.filters,
                        limit: 100,
                    },
                )) as Record<string, unknown>;
                const rawValues = extractV1FieldValues(directResult);
                if (rawValues.length === 0) {
                    throw new Error('FIELD_VALUES_EMPTY');
                }
                payload = {
                    queryUuid: null,
                    rows: rawValues.map((value) => ({ value })),
                    source: 'field-values-v1-endpoint',
                    cached:
                        typeof directResult.cached === 'boolean'
                            ? directResult.cached
                            : null,
                    refreshedAt:
                        (directResult.refreshedAt as string | undefined) ?? null,
                };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                const shouldFallback =
                    isFieldValuesEndpointMissing(message) ||
                    message === 'FIELD_VALUES_EMPTY';
                if (!shouldFallback) {
                    throw new Error(
                        `search_field_values 执行失败：${message}\n请检查字段 fieldId、权限以及项目上下文是否正确。`,
                    );
                }
                const table = args.table as string;
                const fieldId = args.fieldId as string;
                const fallbackErrors: string[] = [`primary: ${message}`];
                if (!hasFilters) {
                    const sqlField = inferSqlDistinctField(table, fieldId);
                    const escapedTable = toSqlIdentifier(table);
                    const escapedField = toSqlIdentifier(sqlField);
                    const escapedAlias = toSqlIdentifier(fieldId);
                    const escapedQuery = queryText.replace(/'/g, "''");
                    const sql = queryText.trim().length
                        ? `SELECT DISTINCT ${escapedField} AS ${escapedAlias} FROM ${escapedTable} WHERE CAST(${escapedField} AS TEXT) ILIKE '%${escapedQuery}%' LIMIT 100`
                        : `SELECT DISTINCT ${escapedField} AS ${escapedAlias} FROM ${escapedTable} LIMIT 100`;
                    try {
                        const sqlResult = await api.runSqlUntilReady(
                            apiKey,
                            projectUuid,
                            {
                                sql,
                                limit: 100,
                                invalidateCache: false,
                            },
                            poll,
                        );
                        payload = {
                            queryUuid: sqlResult.queryUuid,
                            rows: rowsToScalarFlat(
                                (sqlResult.page as { rows?: unknown }).rows ?? [],
                            ),
                            columns: (
                                sqlResult.page as { columns?: unknown }
                            ).columns,
                            source: 'sql-distinct-fallback',
                            note: 'field-values 接口不可用，已回退至 SELECT DISTINCT（假设仓库支持 CAST(.. AS TEXT) + ILIKE）',
                        };
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: full
                                        ? JSON.stringify(payload, null, 2)
                                        : JSON.stringify(
                                              {
                                                  rows:
                                                      (payload.rows as
                                                          | unknown[]
                                                          | undefined) ?? [],
                                                  source: payload.source,
                                              },
                                              null,
                                              2,
                                          ),
                                },
                            ],
                        };
                    } catch (sqlError) {
                        const sqlMessage =
                            sqlError instanceof Error
                                ? sqlError.message
                                : String(sqlError);
                        fallbackErrors.push(`sql: ${sqlMessage}`);
                    }
                }
                try {
                    const resolveFieldId = await deps.getFieldResolver(
                        apiKey,
                        projectUuid,
                        table,
                    );
                    const resolvedField = resolveFieldId(fieldId);
                    const fallback = await api.runMetricQueryUntilReady(
                        apiKey,
                        projectUuid,
                        {
                            query: {
                                exploreName: table,
                                dimensions: [resolvedField],
                                metrics: [],
                                filters: args.filters ?? {},
                                limit: 100,
                            },
                        },
                        poll,
                    );
                    const flatRows = rowsToScalarFlat(fallback.rows) as Record<
                        string,
                        unknown
                    >[];
                    const lowerQuery = queryText.trim().toLowerCase();
                    const values = Array.from(
                        new Set(
                            flatRows
                                .map((r) => r[resolvedField])
                                .filter((v) => v !== null && v !== undefined)
                                .map((v) => String(v))
                                .filter((v) =>
                                    lowerQuery.length > 0
                                        ? v.toLowerCase().includes(lowerQuery)
                                        : true,
                                ),
                        ),
                    );
                    payload = {
                        queryUuid: fallback.queryUuid,
                        rows: values.map((value) => ({ value })),
                        columns: [resolvedField],
                        source: 'metric-query-fallback',
                        note: hasFilters
                            ? 'field-values 接口不可用，且存在 filters，已回退至 metric-query 去重检索'
                            : 'SQL DISTINCT 回退失败，已回退至 metric-query 近似去重',
                    };
                } catch (metricError) {
                    const metricMessage =
                        metricError instanceof Error
                            ? metricError.message
                            : String(metricError);
                    fallbackErrors.push(`metric-query: ${metricMessage}`);
                    throw new Error(
                        `search_field_values 执行失败，且所有回退均失败：\n${fallbackErrors.join('\n')}`,
                    );
                }
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: full
                            ? JSON.stringify(payload, null, 2)
                            : JSON.stringify(
                                  {
                                      rows:
                                          (payload.rows as unknown[] | undefined) ??
                                          [],
                                      source: payload.source,
                                  },
                                  null,
                                  2,
                              ),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'run_sql',
        '执行原始 SQL（POST …/query/sql + 轮询）。⚠️ 仅支持 SELECT/CTE 只读语句；limit 受 LIGHTDASH_MAX_LIMIT 约束。',
        {
            projectUuid: z.string().optional(),
            sql: z.string(),
            limit: z.number().optional(),
            invalidateCache: z.boolean().optional(),
            parameters: z.any().optional(),
            full: z.boolean().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            assertReadonlySql(args.sql as string);
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
            const full = (args.full as boolean | undefined) ?? false;
            const payload =
                page.status === QueryHistoryStatus.READY
                    ? full
                        ? {
                              queryUuid,
                              rows: page.rows,
                              columns: page.columns,
                          }
                        : {
                              queryUuid,
                              rows: rowsToScalarFlat(page.rows),
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
        '异步指标查询（v2 metric-query + 轮询）。推荐使用 queryConfig(JSON 块)；metricQuery/扁平参数保留兼容。示例：run_metric_query(queryConfig:{exploreName:"orders",dimensions:["orders_date"],metrics:["orders_count"],filters:{dimensions:{and:[{target:{fieldId:"orders_date"},operator:"inThePast",values:["30 days"]}]}}})。',
        {
            projectUuid: z.string().optional(),
            queryConfig: z.any().optional(),
            exploreName: z.string().min(1).optional(),
            metricQuery: z.any().optional(),
            requiredFilterFieldIds: z.array(z.string()).optional(),
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
            full: z.boolean().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
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
            const exploreName = args.exploreName as string | undefined;
            const queryConfigBlock = toMetricQueryBlock(args.queryConfig);
            const metricQueryBlock = toMetricQueryBlock(args.metricQuery);
            const effectiveExploreName =
                (queryConfigBlock?.exploreName as string | undefined) ??
                (metricQueryBlock?.exploreName as string | undefined) ??
                exploreName;
            if (!effectiveExploreName) {
                throw new Error(
                    'run_metric_query 缺少 exploreName，请在 exploreName 或 metricQuery.exploreName 中提供',
                );
            }
            const resolveFieldId = await deps.getFieldResolver(
                apiKey,
                projectUuid,
                effectiveExploreName,
            );
            const mqDimensions =
                (
                    (queryConfigBlock?.dimensions as unknown[] | undefined) ??
                    (metricQueryBlock?.dimensions as unknown[] | undefined)
                )?.filter(
                    (d): d is string => typeof d === 'string',
                ) ?? toStringArray(args.dimensions);
            const mqMetrics =
                (
                    (queryConfigBlock?.metrics as unknown[] | undefined) ??
                    (metricQueryBlock?.metrics as unknown[] | undefined)
                )?.filter(
                    (d): d is string => typeof d === 'string',
                ) ?? toStringArray(args.metrics);
            try {
                const normalizedFilters = toFilters(
                    queryConfigBlock?.filters ??
                        metricQueryBlock?.filters ??
                        args.filters,
                    resolveFieldId,
                );
                const requiredFilterFieldIds = (
                    (queryConfigBlock?.requiredFilterFieldIds as
                        | unknown[]
                        | undefined) ??
                    (args.requiredFilterFieldIds as unknown[] | undefined) ??
                    []
                ).filter((x): x is string => typeof x === 'string');
                if (requiredFilterFieldIds.length > 0) {
                    const existingFieldIds = new Set(
                        getNormalizedDimensionFilterFieldIds(normalizedFilters),
                    );
                    const missing = requiredFilterFieldIds.find(
                        (fieldId) => !existingFieldIds.has(resolveFieldId(fieldId)),
                    );
                    if (missing) {
                        const resolvedMissing = resolveFieldId(missing);
                        throw new Error(
                            buildMissingFilterErrorMessage({
                                fieldLabel: missing,
                                fieldId: resolvedMissing,
                            }),
                        );
                    }
                }
                const result = await api.runMetricQueryUntilReady(
                    apiKey,
                    projectUuid,
                    {
                        context:
                            toOptionalQueryContext(args.context) ??
                            QueryExecutionContext.MCP,
                        invalidateCache: args.invalidateCache as
                            | boolean
                            | undefined,
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
                            exploreName: effectiveExploreName,
                            dimensions: mqDimensions.map(resolveFieldId),
                            metrics: mqMetrics.map(resolveFieldId),
                            filters: normalizedFilters,
                            sorts: toSorts(
                                queryConfigBlock?.sorts ??
                                    metricQueryBlock?.sorts ??
                                    args.sorts,
                                resolveFieldId,
                            ),
                            limit:
                                (queryConfigBlock?.limit as number | undefined) ??
                                (metricQueryBlock?.limit as number | undefined) ??
                                (args.limit as number | undefined),
                            tableCalculations: toArray(
                                queryConfigBlock?.tableCalculations ??
                                    metricQueryBlock?.tableCalculations ??
                                    args.tableCalculations,
                            ),
                            additionalMetrics: toArrayLike(
                                queryConfigBlock?.additionalMetrics ??
                                    metricQueryBlock?.additionalMetrics ??
                                    args.additionalMetrics,
                                'additionalMetrics',
                            ),
                            customDimensions: toArrayLike(
                                queryConfigBlock?.customDimensions ??
                                    metricQueryBlock?.customDimensions ??
                                    args.customDimensions,
                                'customDimensions',
                            ),
                            timezone:
                                (queryConfigBlock?.timezone as
                                    | string
                                    | undefined) ??
                                (metricQueryBlock?.timezone as
                                    | string
                                    | undefined) ??
                                (args.timezone as string | undefined),
                            metricOverrides: toObjectLike(
                                queryConfigBlock?.metricOverrides ??
                                    metricQueryBlock?.metricOverrides ??
                                    args.metricOverrides,
                                'metricOverrides',
                            ),
                        },
                    },
                    { pageSize, maxPollAttempts, pollIntervalMs },
                );
            const full = (args.full as boolean | undefined) ?? false;
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
                ...(full
                    ? {
                          queryUuid: result.queryUuid,
                          rows: result.rows,
                          columns: result.columns,
                          fields: result.executeResult.fields,
                          warnings: result.executeResult.warnings,
                      }
                    : {
                          queryUuid: result.queryUuid,
                          rows: rowsToScalarFlat(result.rows),
                      }),
                deprecatedInputsUsed:
                    queryConfigBlock === null &&
                    metricQueryBlock === null &&
                    hasFlatMetricInputs(args as Record<string, unknown>)
                        ? [
                              'exploreName',
                              'dimensions',
                              'metrics',
                              'filters',
                              'sorts',
                              'limit',
                          ]
                        : [],
            };
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            csv.length > 0
                                ? csv
                                : '(no tabular columns)',
                    },
                    ...(full
                        ? [
                              {
                                  type: 'text' as const,
                                  text: JSON.stringify(structuredContent, null, 2),
                              },
                          ]
                        : []),
                ],
                structuredContent,
            };
            } catch (error) {
                throw new Error(formatRunMetricQueryError(error));
            }
        },
    );
}

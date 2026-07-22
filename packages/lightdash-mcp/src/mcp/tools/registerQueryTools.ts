import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { QueryExecutionContext, QueryHistoryStatus } from '@lightdash/common';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import {
    buildDashboardSelectionRequiredResult,
    createDashboardContextResolver,
} from '../../lib/dashboardContextResolver';
import { rowsToScalarFlat } from '../../lib/toolOutput';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';
import { RUN_METRIC_QUERY_FLAT_DESCRIPTION } from '../toolDescriptions/runMetricQueryFlat';
import { RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION } from '../toolDescriptions/runSemanticMetricQuery';
import {
    toArray,
    toArrayLike,
    toFilters,
    toObjectLike,
    toOptionalQueryContext,
    toSorts,
    toStringArray,
} from './metricQueryToolArgs';
import {
    assertNoFlatMetricQueryArgs,
    assertNoSemanticMetricQueryArgs,
    metricQueryInputSchema,
    prepareSemanticMetricQueryBody,
} from './metricQueryPassthrough';
import { buildMetricQueryToolResult } from './metricQueryToolResult';

function collectFilterRulesFromGroup(group: unknown): unknown[] {
    if (Array.isArray(group)) return group;
    if (group && typeof group === 'object' && !Array.isArray(group)) {
        const { and } = group as { and?: unknown };
        if (Array.isArray(and)) return and;
    }
    return [];
}

function getNormalizedDimensionFilterFieldIds(
    normalizedFilters: Record<string, unknown>,
): string[] {
    const rules = collectFilterRulesFromGroup(normalizedFilters.dimensions);
    return rules
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

function formatFlatMetricQueryError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('filters.dimensions.and')) return message;
    return `run_metric_query 执行失败：${message}\n请检查 exploreName、dimensions、metrics、filters、sorts 与字段拼写；Explorer 整段 JSON 请用 run_semantic_metric_query。`;
}

function formatSemanticMetricQueryError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `run_semantic_metric_query 执行失败：${message}\n校验由 Lightdash API 完成；422 时请修改 metricQuery 后重试。`;
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
    getExploreMetadata: (
        apiKey: string,
        projectUuid: string,
        exploreName: string,
    ) => Promise<{
        explore: unknown;
        resolve: (field: string) => string;
        requiresDashboardContext: boolean;
    }>;
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
    const dashboardContextResolver = createDashboardContextResolver(api);

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

    const metricQueryValueFormatSchema = z.enum(['raw', 'formatted']).optional();

    const sharedMetricQueryPollParams = {
        projectUuid: z.string().optional(),
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
        valueFormat: metricQueryValueFormatSchema,
    };

    registerToolTyped(
        server,
        'core-tool',
        'run_semantic_metric_query',
        RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION,
        {
            projectUuid: z.string().optional(),
            metricQuery: metricQueryInputSchema,
            dashboardUuid: z.string().optional(),
            limit: z.number().optional(),
            invalidateCache: z.boolean().optional(),
            full: z.boolean().optional(),
            valueFormat: metricQueryValueFormatSchema,
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            assertNoFlatMetricQueryArgs(args as Record<string, unknown>);
            const full = (args.full as boolean | undefined) ?? false;
            const valueFormat =
                (args.valueFormat as 'raw' | 'formatted' | undefined) ?? 'raw';
            try {
                const {
                    query: queryBody,
                    dashboardUuid: embeddedDashboardUuid,
                    projectUuid: embeddedProjectUuid,
                } = prepareSemanticMetricQueryBody(
                    args.metricQuery,
                    args.limit as number | undefined,
                );
                const projectUuid = resolveCoreToolsProjectUuid(
                    config,
                    apiKey,
                    (args.projectUuid as string | undefined) ??
                        embeddedProjectUuid,
                );
                const explicitDashboardUuid =
                    (args.dashboardUuid as string | undefined) ??
                    embeddedDashboardUuid;
                const exploreName =
                    typeof queryBody.exploreName === 'string'
                        ? queryBody.exploreName
                        : undefined;
                const requiresDashboardContext = exploreName
                    ? (
                          await deps.getExploreMetadata(
                              apiKey,
                              projectUuid,
                              exploreName,
                          )
                      ).requiresDashboardContext
                    : false;
                const resolveResult =
                    requiresDashboardContext || explicitDashboardUuid
                    ? await dashboardContextResolver.resolve({
                          apiKey,
                          projectUuid,
                          dashboardUuid: explicitDashboardUuid,
                          exploreName,
                      })
                    : null;
                if (resolveResult?.status === 'needs_selection') {
                    return buildDashboardSelectionRequiredResult({
                        source: resolveResult.source,
                        candidates: resolveResult.candidates,
                        exploreName,
                    });
                }
                if (
                    requiresDashboardContext &&
                    resolveResult?.status === 'none'
                ) {
                    return buildDashboardSelectionRequiredResult({
                        source: 'exploreName',
                        candidates: [],
                        exploreName,
                    });
                }
                const resolvedDashboardContext =
                    resolveResult?.status === 'resolved'
                        ? resolveResult.context
                        : null;
                const result = await api.runMetricQueryUntilReady(
                    apiKey,
                    projectUuid,
                    {
                        context: QueryExecutionContext.MCP,
                        invalidateCache: args.invalidateCache as
                            | boolean
                            | undefined,
                        dashboardUuid: resolvedDashboardContext?.dashboardUuid,
                        query: queryBody,
                    },
                    poll,
                );
                return buildMetricQueryToolResult({
                    queryUuid: result.queryUuid,
                    rows: result.rows,
                    columns: result.columns,
                    executeResult: result.executeResult,
                    full,
                    valueFormat,
                    extraStructured: {
                        mode: 'semantic_passthrough',
                        ...(resolvedDashboardContext
                            ? { resolvedDashboardContext }
                            : {
                                  resolvedDashboardContext: {
                                      source: 'unresolved',
                                      candidateCount: 0,
                                      note:
                                          resolveResult?.status === 'none'
                                              ? resolveResult.hint
                                              : requiresDashboardContext
                                                ? '未找到 explore 关联 dashboard，已按原语义查询执行'
                                                : '该 explore 的 sql_filter 不依赖 dashboardSlug，已按原语义查询执行',
                                  },
                              }),
                    },
                });
            } catch (error) {
                throw new Error(formatSemanticMetricQueryError(error));
            }
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'run_metric_query',
        RUN_METRIC_QUERY_FLAT_DESCRIPTION,
        {
            ...sharedMetricQueryPollParams,
            exploreName: z.string().min(1),
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
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            assertNoSemanticMetricQueryArgs(args as Record<string, unknown>);
            const pageSize = (args.pageSize as number | undefined) ?? poll.pageSize;
            const maxPollAttempts =
                (args.maxPollAttempts as number | undefined) ??
                poll.maxPollAttempts;
            const pollIntervalMs =
                (args.pollIntervalMs as number | undefined) ??
                poll.pollIntervalMs;
            const exploreName = args.exploreName as string;
            const exploreMetadata = await deps.getExploreMetadata(
                apiKey,
                projectUuid,
                exploreName,
            );
            const resolveFieldId = exploreMetadata.resolve;
            const mqDimensions = toStringArray(args.dimensions);
            const mqMetrics = toStringArray(args.metrics);
            const full = (args.full as boolean | undefined) ?? false;
            const valueFormat =
                (args.valueFormat as 'raw' | 'formatted' | undefined) ?? 'raw';
            try {
                const normalizedFilters = toFilters(
                    args.filters,
                    resolveFieldId,
                );
                const requiredFilterFieldIds = toStringArray(
                    args.requiredFilterFieldIds,
                );
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
                const resolveResult =
                    exploreMetadata.requiresDashboardContext ||
                    args.dashboardUuid
                    ? await dashboardContextResolver.resolve({
                          apiKey,
                          projectUuid,
                          dashboardUuid: args.dashboardUuid as
                              | string
                              | undefined,
                          exploreName,
                      })
                    : null;
                if (resolveResult?.status === 'needs_selection') {
                    return buildDashboardSelectionRequiredResult({
                        source: resolveResult.source,
                        candidates: resolveResult.candidates,
                        exploreName,
                    });
                }
                if (
                    exploreMetadata.requiresDashboardContext &&
                    resolveResult?.status === 'none'
                ) {
                    return buildDashboardSelectionRequiredResult({
                        source: 'exploreName',
                        candidates: [],
                        exploreName,
                    });
                }
                const resolvedDashboardContext =
                    resolveResult?.status === 'resolved'
                        ? resolveResult.context
                        : null;
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
                        dashboardUuid: resolvedDashboardContext?.dashboardUuid,
                        query: {
                            exploreName,
                            dimensions: mqDimensions.map(resolveFieldId),
                            metrics: mqMetrics.map(resolveFieldId),
                            filters: normalizedFilters,
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
                return buildMetricQueryToolResult({
                    queryUuid: result.queryUuid,
                    rows: result.rows,
                    columns: result.columns,
                    executeResult: result.executeResult,
                    full,
                    valueFormat,
                    extraStructured: {
                        mode: 'flat',
                        ...(resolvedDashboardContext
                            ? { resolvedDashboardContext }
                            : {
                                  resolvedDashboardContext: {
                                      source: 'unresolved',
                                      candidateCount: 0,
                                      note:
                                          resolveResult?.status === 'none'
                                              ? resolveResult.hint
                                              : exploreMetadata.requiresDashboardContext
                                                ? '未找到 explore 关联 dashboard，已按原语义查询执行'
                                                : '该 explore 的 sql_filter 不依赖 dashboardSlug，已按原语义查询执行',
                                  },
                              }),
                    },
                });
            } catch (error) {
                throw new Error(formatFlatMetricQueryError(error));
            }
        },
    );
}

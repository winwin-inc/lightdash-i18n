import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { QueryExecutionContext } from '@lightdash/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import {
    buildDashboardSelectionRequiredResult,
    createDashboardContextResolver,
    getSharedDashboardContextResolver,
    type ResolvedDashboardContext,
} from '../../lib/dashboardContextResolver';
import { buildUnresolvedDashboardNote } from '../../lib/dashboardContextNote';
import {
    createRequiredDashboardGuard,
    DASHBOARD_AUTO_RESOLVED_HINT,
    formatDashboardAccessError,
    type DashboardGuardContext,
} from '../../lib/requiredDashboardContext';
import { rowsToScalarFlat } from '../../lib/toolOutput';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { assertExploreQueryable } from '../access/assertExploreQueryable';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';
import { registerToolTyped } from '../registerToolTyped';
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

function isExploreQueryDeniedMessage(message: string): boolean {
    return message.includes('已拒绝查询');
}

function formatFlatMetricQueryError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('filters.dimensions.and')) return message;
    if (isExploreQueryDeniedMessage(message)) return message;
    return `run_metric_query 执行失败：${message}\n请检查 exploreName、dimensions、metrics、filters、sorts 与字段拼写；Explorer 整段 JSON 请用 run_semantic_metric_query。`;
}

function formatSemanticMetricQueryError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (isExploreQueryDeniedMessage(message)) return message;
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

/** field-values 响应里可能承载取值的数组字段 */
const FIELD_VALUES_ARRAY_KEYS = ['results', 'values', 'rows'];

/**
 * Returns the first array found in the given keys of the payload.
 */
function pickFirstArray(
    payload: Record<string, unknown>,
    keys: string[],
): unknown[] {
    for (const key of keys) {
        const value = payload[key];
        if (Array.isArray(value)) {
            return value;
        }
    }
    return [];
}

export function extractV1FieldValues(
    directResult: Record<string, unknown>,
): string[] {
    const candidates = pickFirstArray(directResult, FIELD_VALUES_ARRAY_KEYS);
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

/**
 * 严格模式用：区分「响应里根本没有值数组」与「值数组为空」。
 *
 * 返回 null 表示响应形状异常（没有任何数组字段）——调用方必须按错误处理，
 * 不能静默当成「该字段没有取值」。
 */
export function extractV1FieldValuesStrict(
    directResult: Record<string, unknown>,
): string[] | null {
    const hasArray = FIELD_VALUES_ARRAY_KEYS.some((key) =>
        Array.isArray(directResult[key]),
    );
    if (!hasArray) {
        return null;
    }
    return extractV1FieldValues(directResult);
}

/** field-values 响应形状异常的哨兵文案 */
const FIELD_VALUES_SHAPE_INVALID = 'FIELD_VALUES_RESPONSE_SHAPE_INVALID';

/** 严格模式下解析出的看板上下文（额外带 dashboardUrl 与自动解析提示） */
type StrictResolvedDashboardContext = ResolvedDashboardContext & {
    /** 浏览器可打开的看板链接 */
    dashboardUrl?: string;
    /** 自动解析到唯一看板时的提示 */
    note?: string;
};

function toStrictResolvedDashboardContext(
    context: DashboardGuardContext,
): StrictResolvedDashboardContext {
    const resolved: StrictResolvedDashboardContext = {
        dashboardUuid: context.dashboardUuid,
        dashboardSlug: context.dashboardSlug,
        dashboardName: context.dashboardName,
        source: context.source,
        candidateCount: context.candidateCount,
    };
    if (context.dashboardUrl) {
        resolved.dashboardUrl = context.dashboardUrl;
    }
    if (context.source !== 'explicitDashboardUuid') {
        resolved.note = DASHBOARD_AUTO_RESOLVED_HINT;
    }
    return resolved;
}

/** 严格模式（文档 §4.2 / §9）的工具描述补充段 */
const STRICT_MODE_DESCRIPTION = [
    '## 强制看板模式（MCP_DASHBOARD_STRICT=true）',
    '查数前必须解析出 dashboardUuid：显式传入的看板会被校验（可打开 + 属于本项目 + 属于该数据集的关联看板）；未传入时按数据集反查关联看板（唯一则自动使用，多个则返回 dashboard_selection_required 让调用方选择，0 个则按“是否已配置看板”阻断）。',
    '阻断时返回 status ∈ { dashboard_permission_required, dashboard_configuration_required, dashboard_selection_required, dashboard_not_found, dashboard_context_unavailable } 与对应 action，不会执行查询。',
].join('\n');

function withStrictModeDescription(
    description: string,
    strictMode: boolean,
): string {
    return strictMode
        ? `${description}\n\n${STRICT_MODE_DESCRIPTION}`
        : description;
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
    const strictMode = config.dashboardStrict;
    // 严格模式：所有查询工具共用同一个 guard（共享 60s 反查缓存）
    const strictGuard = strictMode
        ? createRequiredDashboardGuard(
              api,
              config,
              getSharedDashboardContextResolver(api, {
                  blockOnMultiple: true,
                  publicBaseUrl: config.publicBaseUrl,
              }),
          )
        : null;

    type StrictGuardOutcome =
        | { blocked: true; result: CallToolResult }
        | { blocked: false; context: DashboardGuardContext };

    /**
     * 严格模式下解析看板上下文。
     *
     * 非严格模式返回 null（走原有 resolver 分支，行为不变）；
     * 严格模式下失败一律阻断并返回 guard 构造的结果。
     */
    async function resolveStrictDashboard(params: {
        apiKey: string;
        projectUuid: string;
        dashboardUuid?: string;
        chartUuid?: string;
        exploreName?: string;
    }): Promise<StrictGuardOutcome | null> {
        if (!strictGuard) {
            return null;
        }
        const guard = await strictGuard.ensure(params);
        if (!guard.ok) {
            return { blocked: true, result: guard.result };
        }
        return { blocked: false, context: guard.context };
    }

    registerToolTyped(
        server,
        'core-tool',
        'search_field_values',
        strictMode
            ? '搜索某维度字段取值（走项目 field search 接口）。table 须在 get_my_access 的 explores.queryable 或 metadataOnly；attributeDenied 与未知表会拒绝查询，不会返回空结果。query 可空字符串表示不限。强制看板模式：查数前必须解析出 dashboardUuid；field search 无命中值时直接返回空列表（source=field-values-v1-endpoint），不做 SQL DISTINCT 回退；仅当 field search 接口不可用（404）时回退到带 dashboardUuid 的 metric-query。'
            : '搜索某维度字段取值（优先走项目 field search 接口）。table 须在 get_my_access 的 explores.queryable 或 metadataOnly；attributeDenied 与未知表会拒绝查询，不会返回空结果。query 可空字符串表示不限。若接口不可用，将回退到 SQL DISTINCT（再失败则回退 metric-query）。',
        {
            projectUuid: z.string().optional(),
            table: z.string(),
            fieldId: z.string(),
            query: z.string().nullable().optional(),
            filters: z.any().optional(),
            full: z.boolean().optional(),
            dashboardUuid: z.string().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            await assertExploreQueryable(
                api,
                apiKey,
                projectUuid,
                args.table as string,
                'fieldValues',
            );
            const full = (args.full as boolean | undefined) ?? false;
            const queryText =
                args.query === null || args.query === undefined
                    ? ''
                    : String(args.query);
            let payload: Record<string, unknown>;
            const hasFilters = args.filters !== undefined && args.filters !== null;
            // 严格模式：查数前必须解析出 dashboardUuid（失败直接阻断，不查数）
            const strictOutcome = await resolveStrictDashboard({
                apiKey,
                projectUuid,
                dashboardUuid: args.dashboardUuid as string | undefined,
                exploreName: args.table as string,
            });
            if (strictOutcome?.blocked) {
                return strictOutcome.result;
            }
            const strictContext = strictOutcome?.context ?? null;
            const dashboardUuidForQuery =
                strictContext?.dashboardUuid ??
                (args.dashboardUuid as string | undefined);
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
                        dashboardUuid: dashboardUuidForQuery,
                    },
                )) as Record<string, unknown>;
                const rawValues = strictContext
                    ? extractV1FieldValuesStrict(directResult)
                    : extractV1FieldValues(directResult);
                if (rawValues === null) {
                    // 严格模式：响应形状异常 ≠ 该字段没有取值 → 按错误抛出
                    throw new Error(FIELD_VALUES_SHAPE_INVALID);
                }
                if (rawValues.length === 0 && !strictContext) {
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
                    ...(strictContext
                        ? {
                              resolvedDashboardContext:
                                  toStrictResolvedDashboardContext(strictContext),
                          }
                        : {}),
                    ...(strictContext && rawValues.length === 0
                        ? {
                              note: '强制看板模式：field search 无命中值，直接返回空列表，不做 SQL DISTINCT / metric-query 回退。',
                          }
                        : {}),
                };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                // 严格模式：看板类 403 / 404 先映射成 dashboard_* 状态
                const mapped = strictContext
                    ? formatDashboardAccessError({
                          error: e,
                          projectUuid,
                          dashboardUuid: dashboardUuidForQuery ?? null,
                          contact: config.dashboardContact,
                          publicBaseUrl: config.publicBaseUrl,
                      })
                    : null;
                if (mapped) {
                    return mapped;
                }
                if (message === FIELD_VALUES_SHAPE_INVALID) {
                    throw new Error(
                        'search_field_values 执行失败：field-values 接口返回结构异常（响应里没有 results / values / rows 数组），无法确认该字段是否真的没有取值；请稍后重试。',
                    );
                }
                const endpointMissing = isFieldValuesEndpointMissing(message);
                const shouldFallback = strictContext
                    ? endpointMissing
                    : endpointMissing || message === 'FIELD_VALUES_EMPTY';
                if (!shouldFallback) {
                    throw new Error(
                        `search_field_values 执行失败：${message}\n请检查字段 fieldId、权限以及项目上下文是否正确。`,
                    );
                }
                const table = args.table as string;
                const fieldId = args.fieldId as string;
                const fallbackErrors: string[] = [`primary: ${message}`];
                // 严格模式禁用 SQL DISTINCT 回退（裸 SQL 绕过看板上下文）
                if (!strictContext && !hasFilters) {
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
                            // 严格模式：回退的 metric-query 必须带上看板上下文
                            ...(strictContext
                                ? {
                                      dashboardUuid:
                                          dashboardUuidForQuery,
                                  }
                                : {}),
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
                    let fallbackNote =
                        'SQL DISTINCT 回退失败，已回退至 metric-query 近似去重';
                    if (strictContext) {
                        fallbackNote =
                            'field-values 接口不可用（404），已回退至带看板上下文的 metric-query 去重检索';
                    } else if (hasFilters) {
                        fallbackNote =
                            'field-values 接口不可用，且存在 filters，已回退至 metric-query 去重检索';
                    }
                    payload = {
                        queryUuid: fallback.queryUuid,
                        rows: values.map((value) => ({ value })),
                        columns: [resolvedField],
                        source: 'metric-query-fallback',
                        note: fallbackNote,
                        ...(strictContext
                            ? {
                                  resolvedDashboardContext:
                                      toStrictResolvedDashboardContext(
                                          strictContext,
                                      ),
                              }
                            : {}),
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
                                      ...(payload.resolvedDashboardContext
                                          ? {
                                                resolvedDashboardContext:
                                                    payload.resolvedDashboardContext,
                                            }
                                          : {}),
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
        withStrictModeDescription(
            RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION,
            strictMode,
        ),
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
            let dashboardUuidForQuery: string | undefined;
            let resolvedProjectUuid: string | undefined;
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
                resolvedProjectUuid = projectUuid;
                const explicitDashboardUuid =
                    (args.dashboardUuid as string | undefined) ??
                    embeddedDashboardUuid;
                const exploreName =
                    typeof queryBody.exploreName === 'string'
                        ? queryBody.exploreName
                        : undefined;
                if (exploreName) {
                    await assertExploreQueryable(
                        api,
                        apiKey,
                        projectUuid,
                        exploreName,
                    );
                }
                let resolvedDashboardContext:
                    | StrictResolvedDashboardContext
                    | ResolvedDashboardContext
                    | null = null;
                let resolveStatus: string | undefined;
                let unresolvedHint: string | undefined;
                let requiresDashboardContext = false;
                if (strictMode) {
                    // 严格模式：无条件解析看板上下文（不再依赖 requiresDashboardContext）
                    const strictOutcome = await resolveStrictDashboard({
                        apiKey,
                        projectUuid,
                        dashboardUuid: explicitDashboardUuid,
                        exploreName,
                    });
                    if (strictOutcome?.blocked) {
                        return strictOutcome.result;
                    }
                    if (strictOutcome) {
                        resolvedDashboardContext =
                            toStrictResolvedDashboardContext(
                                strictOutcome.context,
                            );
                        dashboardUuidForQuery =
                            strictOutcome.context.dashboardUuid;
                    }
                } else {
                    requiresDashboardContext = exploreName
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
                    resolvedDashboardContext =
                        resolveResult?.status === 'resolved'
                            ? resolveResult.context
                            : null;
                    resolveStatus = resolveResult?.status;
                    unresolvedHint =
                        resolveResult?.status === 'none'
                            ? resolveResult.hint
                            : undefined;
                    dashboardUuidForQuery =
                        resolvedDashboardContext?.dashboardUuid;
                }
                const result = await api.runMetricQueryUntilReady(
                    apiKey,
                    projectUuid,
                    {
                        context: QueryExecutionContext.MCP,
                        invalidateCache: args.invalidateCache as
                            | boolean
                            | undefined,
                        dashboardUuid: dashboardUuidForQuery,
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
                                      note: buildUnresolvedDashboardNote({
                                          resolveStatus,
                                          hint: unresolvedHint,
                                          requiresDashboardContext,
                                          contextMissingMessage:
                                              '未找到 explore 关联 dashboard，已按原语义查询执行',
                                          contextNotRequiredMessage:
                                              '该 explore 的 sql_filter 不依赖 dashboardSlug，已按原语义查询执行',
                                      }),
                                  },
                              }),
                    },
                });
            } catch (error) {
                if (strictMode && resolvedProjectUuid) {
                    const mapped = formatDashboardAccessError({
                        error,
                        projectUuid: resolvedProjectUuid,
                        dashboardUuid: dashboardUuidForQuery ?? null,
                        contact: config.dashboardContact,
                        publicBaseUrl: config.publicBaseUrl,
                    });
                    if (mapped) {
                        return mapped;
                    }
                }
                throw new Error(formatSemanticMetricQueryError(error));
            }
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'run_metric_query',
        withStrictModeDescription(RUN_METRIC_QUERY_FLAT_DESCRIPTION, strictMode),
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
            await assertExploreQueryable(
                api,
                apiKey,
                projectUuid,
                exploreName,
            );
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
            let dashboardUuidForQuery: string | undefined;
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
                let resolvedDashboardContext:
                    | StrictResolvedDashboardContext
                    | ResolvedDashboardContext
                    | null = null;
                let resolveStatus: string | undefined;
                let unresolvedHint: string | undefined;
                if (strictMode) {
                    // 严格模式：无条件解析看板上下文（不再依赖 requiresDashboardContext）
                    const strictOutcome = await resolveStrictDashboard({
                        apiKey,
                        projectUuid,
                        dashboardUuid: args.dashboardUuid as string | undefined,
                        exploreName,
                    });
                    if (strictOutcome?.blocked) {
                        return strictOutcome.result;
                    }
                    if (strictOutcome) {
                        resolvedDashboardContext =
                            toStrictResolvedDashboardContext(
                                strictOutcome.context,
                            );
                        dashboardUuidForQuery =
                            strictOutcome.context.dashboardUuid;
                    }
                } else {
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
                    resolvedDashboardContext =
                        resolveResult?.status === 'resolved'
                            ? resolveResult.context
                            : null;
                    resolveStatus = resolveResult?.status;
                    unresolvedHint =
                        resolveResult?.status === 'none'
                            ? resolveResult.hint
                            : undefined;
                    dashboardUuidForQuery =
                        resolvedDashboardContext?.dashboardUuid;
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
                        dashboardUuid: dashboardUuidForQuery,
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
                                      note: buildUnresolvedDashboardNote({
                                          resolveStatus,
                                          hint: unresolvedHint,
                                          requiresDashboardContext:
                                              exploreMetadata
                                                  .requiresDashboardContext,
                                          contextMissingMessage:
                                              '未找到 explore 关联 dashboard，已按原语义查询执行',
                                          contextNotRequiredMessage:
                                              '该 explore 的 sql_filter 不依赖 dashboardSlug，已按原语义查询执行',
                                      }),
                                  },
                              }),
                    },
                });
            } catch (error) {
                if (strictMode) {
                    const mapped = formatDashboardAccessError({
                        error,
                        projectUuid,
                        dashboardUuid: dashboardUuidForQuery ?? null,
                        contact: config.dashboardContact,
                        publicBaseUrl: config.publicBaseUrl,
                    });
                    if (mapped) {
                        return mapped;
                    }
                }
                throw new Error(formatFlatMetricQueryError(error));
            }
        },
    );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiExecuteAsyncMetricQueryResults } from '@lightdash/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import type { LightdashMcpEnvConfig } from '../config';
import {
    DEFAULT_WEB_PATH_TEMPLATES,
    enrichSavedChartResult,
} from '../lib/contentWebUrls';
import {
    buildDashboardSelectionRequiredResult,
    createDashboardContextResolver,
    getSharedDashboardContextResolver,
    type ResolvedDashboardContext,
} from '../lib/dashboardContextResolver';
import { buildUnresolvedDashboardNote } from '../lib/dashboardContextNote';
import {
    createRequiredDashboardGuard,
    DASHBOARD_AUTO_RESOLVED_HINT,
    formatDashboardAccessError,
    type DashboardGuardContext,
} from '../lib/requiredDashboardContext';
import {
    maybeSlimList,
    rowsToScalarFlat,
    slimSavedChart,
    slimSpace,
} from '../lib/toolOutput';
import { extractDashboardChartTiles } from '../lib/dashboardTiles';
import { getHttpRequestApiKey } from '../lib/requestContext';
import type { LightdashRestClient } from '../rest/lightdashRest';
import { resolveCoreToolsProjectUuid } from './coreToolsContext';
import { registerToolTyped } from './registerToolTyped';
import { buildMetricQueryToolResult } from './tools/metricQueryToolResult';

const metricQueryValueFormatSchema = z.enum(['raw', 'formatted']).optional();

const runSavedChartParams = {
    projectUuid: z.string().optional(),
    chartUuid: z.string(),
    dashboardUuid: z.string().optional(),
    versionUuid: z.string().optional(),
    parameters: z.any().optional(),
    limit: z.number().optional(),
    pageSize: z.number().optional(),
    maxPollAttempts: z.number().optional(),
    pollIntervalMs: z.number().optional(),
    full: z.boolean().optional(),
    valueFormat: metricQueryValueFormatSchema,
} satisfies ZodRawShape;

const getSiteInfoParams = {
} satisfies ZodRawShape;

const listSpacesParams = {
    projectUuid: z.string().optional(),
    full: z.boolean().optional(),
} satisfies ZodRawShape;

const getSavedChartParams = {
    chartUuid: z.string(),
    full: z
        .boolean()
        .optional()
        .describe(
            '默认 false：精简同时含 chartKind（认图）与 chartType（=chartConfig.type，配置结构标签）。true：完整对象含 chartConfig。',
        ),
} satisfies ZodRawShape;

const getDashboardTilesParams = {
    dashboardUuid: z.string(),
    full: z
        .boolean()
        .optional()
        .describe(
            '默认 false：精简含 chartKind（自 lastVersionChartKind；sql_chart/data_app 多为 null）、tile type、tabUuid/chartSlug（有则返回）。统计看板「自定义」图：数 chartKind==="custom"。',
        ),
} satisfies ZodRawShape;

const listChartsParams = {
    dashboardUuid: z.string(),
    full: z
        .boolean()
        .optional()
        .describe(
            '默认 false：仅 saved_chart 磁贴，精简含 chartKind。统计「自定义」：数 chartKind==="custom"。true 返回完整 tile。',
        ),
} satisfies ZodRawShape;

const runDashboardTilesParams = {
    projectUuid: z.string().optional(),
    dashboardUuid: z.string(),
    limitPerTile: z.number().optional(),
    full: z.boolean().optional(),
} satisfies ZodRawShape;

const getDashboardCodeParams = {
    projectUuid: z.string().optional(),
    dashboardUuid: z.string(),
    languageMap: z.boolean().optional(),
} satisfies ZodRawShape;

type ExtensionToolsDeps = {
    getExploreMetadata: (
        apiKey: string,
        projectUuid: string,
        exploreName: string,
    ) => Promise<{
        explore: unknown;
        resolve: (field: string) => string;
        requiresDashboardContext: boolean;
    }>;
};

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

function resolveExtensionApiKey(
    config: LightdashMcpEnvConfig,
): string {
    const key = getHttpRequestApiKey() ?? config.apiKey;
    if (!key) {
        throw new Error(
            'apiKey is required (x-api-key header or LIGHTDASH_API_KEY)',
        );
    }
    return key;
}

/**
 * 尽力解析 projectUuid（仅用于生成看板链接）。
 *
 * 看板不可访问（403 / 404）时拿不到 dashboard.projectUuid，这里回退到
 * 入参 / session / 环境变量；都拿不到时返回空串（链接可能不完整）。
 */
function resolveProjectUuidHint(
    config: LightdashMcpEnvConfig,
    apiKey: string,
    fromArgs: string | undefined,
): string {
    try {
        return resolveCoreToolsProjectUuid(config, apiKey, fromArgs);
    } catch {
        return fromArgs ?? '';
    }
}

function findExploreNameInSavedChart(value: unknown): string | undefined {
    const visit = (node: unknown, depth: number): string | undefined => {
        if (depth > 8 || !node || typeof node !== 'object') return undefined;
        if (Array.isArray(node)) {
            for (const item of node) {
                const found = visit(item, depth + 1);
                if (found) return found;
            }
            return undefined;
        }
        const row = node as Record<string, unknown>;
        if (typeof row.exploreName === 'string') return row.exploreName;
        if (typeof row.tableName === 'string') return row.tableName;
        if (typeof row.table === 'string') return row.table;
        for (const item of Object.values(row)) {
            const found = visit(item, depth + 1);
            if (found) return found;
        }
        return undefined;
    };
    return visit(value, 0);
}

export function registerExtensionTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
    deps: ExtensionToolsDeps,
): void {
    const dashboardContextResolver = createDashboardContextResolver(api);
    const strictMode = config.dashboardStrict;
    // 严格模式：与查询工具共用同一个 guard（共享 60s 反查缓存）
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
        'tool-call',
        'get_site_info',
        '返回站点根地址：siteBaseUrl（拼 webUrl / 浏览器打开用）、apiBaseUrl（服务 API 用）。不含密钥。打开图表或看板请用各工具返回的 webUrl，不要用 apiBaseUrl 拼链接。',
        getSiteInfoParams,
        async () => {
            const payload = {
                siteBaseUrl: config.publicBaseUrl,
                apiBaseUrl: config.baseUrl,
                note: 'webUrl = siteBaseUrl + 路径；apiBaseUrl 仅供对照，不用于打开页面。',
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(payload, null, 2),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'tool-call',
        'list_spaces',
        '列出当前项目下的空间（内容文件夹）。可选 projectUuid；省略时与核心工具一致：本次参数 > set_project 会话 > 环境 LIGHTDASH_PROJECT_UUID。',
        listSpacesParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const data = await api.listSpaces(apiKey, projectUuid);
            const full = (args.full as boolean | undefined) ?? false;
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            maybeSlimList(data, full, slimSpace),
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
        'tool-call',
        'get_saved_chart',
        '查看已保存图表元数据（含 webUrl）。默认精简同时含 chartKind（认图：line/vertical_bar/custom/…；UI「自定义」= custom）与 chartType（=chartConfig.type，配置结构标签；cartesian 可含多种形态，勿当折线/柱状）。读完整配置用 full=true。跑数前可先确认参数。',
        getSavedChartParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const data = await api.getSavedChart(
                apiKey,
                args.chartUuid as string,
            );
            const enriched = enrichSavedChartResult(
                config.publicBaseUrl,
                DEFAULT_WEB_PATH_TEMPLATES.chart,
                data,
            );
            const full = (args.full as boolean | undefined) ?? false;
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            full ? enriched : slimSavedChart(enriched),
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
        'tool-call',
        'run_saved_chart',
        strictMode
            ? '按已保存图表跑数；可用 parameters 传筛选（如年份、区域）。limit 会按环境上限自动封顶。可选 projectUuid；省略时与核心工具一致。强制看板模式：固定走看板图表接口（/query/dashboard-chart），该接口不支持 versionUuid，传入的 versionUuid 会被忽略；查数前必须解析出 dashboardUuid（未传时按 chartUuid 反查关联看板：唯一则自动使用，多个返回 status=dashboard_selection_required 让调用方选择，0 个按“是否已配置看板”阻断），不会执行查询。'
            : '按已保存图表跑数；可用 parameters 传筛选（如年份、区域）。limit 会按环境上限自动封顶。可选 projectUuid；省略时与核心工具一致。可选 dashboardUuid；未传且需要看板上下文时：反查有候选则自动选用并查数（多个时取排序后第一个，返回 resolvedDashboardContext 含 candidates）；0 个候选才返回 status=dashboard_selection_required 空列表。',
        runSavedChartParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const pageSize = (args.pageSize as number | undefined) ?? 500;
            const maxPollAttempts =
                (args.maxPollAttempts as number | undefined) ?? 120;
            const pollIntervalMs =
                (args.pollIntervalMs as number | undefined) ?? 500;
            const limit = (args.limit as number | undefined) ?? 500;
            const chartUuid = args.chartUuid as string;
            const chart = await api.getSavedChart(apiKey, chartUuid);
            let resolvedDashboardContext:
                | StrictResolvedDashboardContext
                | ResolvedDashboardContext
                | null = null;
            let dashboardUuidForQuery: string | undefined;
            let resolveStatus: string | undefined;
            let unresolvedHint: string | undefined;
            let requiresDashboardContext = false;
            if (strictMode) {
                // 严格模式：无条件解析看板上下文（不再依赖 requiresDashboardContext）
                const strictOutcome = await resolveStrictDashboard({
                    apiKey,
                    projectUuid,
                    dashboardUuid: args.dashboardUuid as string | undefined,
                    chartUuid,
                });
                if (strictOutcome?.blocked) {
                    return strictOutcome.result;
                }
                if (strictOutcome) {
                    resolvedDashboardContext = toStrictResolvedDashboardContext(
                        strictOutcome.context,
                    );
                    dashboardUuidForQuery = strictOutcome.context.dashboardUuid;
                }
            } else {
                const exploreName = findExploreNameInSavedChart(chart);
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
                    requiresDashboardContext || args.dashboardUuid
                    ? await dashboardContextResolver.resolve({
                          apiKey,
                          projectUuid,
                          dashboardUuid: args.dashboardUuid as string | undefined,
                          chartUuid,
                      })
                    : null;
                if (resolveResult?.status === 'needs_selection') {
                    return buildDashboardSelectionRequiredResult({
                        source: resolveResult.source,
                        candidates: resolveResult.candidates,
                        chartUuid,
                    });
                }
                if (
                    requiresDashboardContext &&
                    resolveResult?.status === 'none'
                ) {
                    return buildDashboardSelectionRequiredResult({
                        source: 'chartUuid',
                        candidates: [],
                        chartUuid,
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
                dashboardUuidForQuery = resolvedDashboardContext?.dashboardUuid;
            }
            const pollOptions = {
                pageSize,
                maxPollAttempts,
                pollIntervalMs,
            };
            // 严格模式：固定走看板图表接口（该接口不接受 versionUuid）
            let result: Awaited<ReturnType<typeof api.runSavedChart>>;
            try {
                result = resolvedDashboardContext
                    ? await api.runDashboardChart(
                          apiKey,
                          projectUuid,
                          {
                              chartUuid,
                              dashboardUuid: dashboardUuidForQuery as string,
                              parameters: args.parameters as
                                  | Record<string, unknown>
                                  | undefined,
                              limit,
                          },
                          pollOptions,
                      )
                    : await api.runSavedChart(
                          apiKey,
                          projectUuid,
                          {
                              chartUuid,
                              versionUuid: args.versionUuid as string | undefined,
                              parameters: args.parameters as
                                  | Record<string, unknown>
                                  | undefined,
                              limit,
                          },
                          pollOptions,
                      );
            } catch (error) {
                if (strictMode) {
                    // 严格模式：看板类 403 / 404 映射成 dashboard_* 状态
                    const mapped = formatDashboardAccessError({
                        error,
                        projectUuid,
                        dashboardUuid: dashboardUuidForQuery ?? null,
                    });
                    if (mapped) {
                        return mapped;
                    }
                }
                throw error;
            }
            const full = (args.full as boolean | undefined) ?? false;
            const valueFormat =
                (args.valueFormat as 'raw' | 'formatted' | undefined) ?? 'raw';

            return buildMetricQueryToolResult({
                queryUuid: result.queryUuid,
                rows: result.rows,
                columns: result.columns,
                executeResult: {
                    fields: result.fields,
                    warnings: result.warnings,
                } as ApiExecuteAsyncMetricQueryResults,
                full,
                valueFormat,
                extraStructured: {
                    mode: resolvedDashboardContext
                        ? 'dashboard_chart'
                        : 'saved_chart',
                    chartUuid,
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
                                          '未找到 chart 关联 dashboard，已回退普通 saved chart 查询',
                                      contextNotRequiredMessage:
                                          '该 chart 所属 explore 的 sql_filter 不依赖 dashboardSlug，已按原 saved chart 查询执行',
                                  }),
                              },
                          }),
                    ...(strictMode
                        ? {
                              versionUuidIgnored: true,
                              versionUuidNote:
                                  '强制看板模式固定走看板图表接口（/query/dashboard-chart），该接口不支持 versionUuid，传入的 versionUuid 已被忽略。',
                          }
                        : {}),
                },
            });
        },
    );

    registerToolTyped(
        server,
        'tool-call',
        'list_charts',
        '按 dashboardUuid 列出看板内 saved_chart 磁贴（层级浏览）。默认精简含 chartKind；统计「自定义」图：数 chartKind==="custom"。不含 sql_chart/data_app（见 get_dashboard_tiles）。按名称搜索用 find_charts。',
        listChartsParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const dashboard = (await api.getDashboard(
                apiKey,
                args.dashboardUuid as string,
            )) as Record<string, unknown>;
            const tiles = Array.isArray(dashboard.tiles)
                ? dashboard.tiles
                : [];
            const full = (args.full as boolean | undefined) ?? false;
            const charts = extractDashboardChartTiles(tiles, {
                full,
                savedChartsOnly: true,
                tileUuidKey: 'tileUuid',
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                dashboardUuid: args.dashboardUuid,
                                charts,
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
        'tool-call',
        'get_dashboard_tiles',
        '读取看板磁贴布局（type/坐标/chartUuid/chartKind 等）。默认精简：chartKind 来自 lastVersionChartKind（认图；UI「自定义」= custom）；sql_chart/data_app 的 chartKind 多为 null。统计自定义图可数 chartKind==="custom"。',
        getDashboardTilesParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const dashboard = (await api.getDashboard(
                apiKey,
                args.dashboardUuid as string,
            )) as Record<string, unknown>;
            const tiles = Array.isArray(dashboard.tiles)
                ? dashboard.tiles
                : [];
            const full = (args.full as boolean | undefined) ?? false;
            const payload = extractDashboardChartTiles(tiles, {
                full,
                savedChartsOnly: false,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                dashboardUuid: args.dashboardUuid,
                                tiles: payload,
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
        'tool-call',
        'run_dashboard_tiles',
        strictMode
            ? '批量执行看板内可运行磁贴（saved_chart）。sql_chart 与非查询磁贴会跳过并返回说明。强制看板模式：看板不可访问（403 / 404）时整批阻断，不会执行任何磁贴，而是返回 status=dashboard_permission_required / dashboard_not_found 与对应 action。'
            : '批量执行看板内可运行磁贴（saved_chart）。sql_chart 与非查询磁贴会跳过并返回说明。',
        runDashboardTilesParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            let dashboard: Record<string, unknown>;
            try {
                dashboard = (await api.getDashboard(
                    apiKey,
                    args.dashboardUuid as string,
                )) as Record<string, unknown>;
            } catch (error) {
                if (strictMode) {
                    // 严格模式：看板 403 / 404 在跑任何磁贴前整批阻断
                    const mapped = formatDashboardAccessError({
                        error,
                        projectUuid: resolveProjectUuidHint(
                            config,
                            apiKey,
                            args.projectUuid as string | undefined,
                        ),
                        dashboardUuid: args.dashboardUuid as string,
                    });
                    if (mapped) {
                        return mapped;
                    }
                }
                throw error;
            }
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                (args.projectUuid as string | undefined) ??
                    (dashboard.projectUuid as string | undefined),
            );
            const tiles = Array.isArray(dashboard.tiles)
                ? dashboard.tiles
                : [];
            const full = (args.full as boolean | undefined) ?? false;
            const limit = (args.limitPerTile as number | undefined) ?? 200;
            const results = await Promise.all(
                tiles.map(async (tile) => {
                    const row = tile as Record<string, unknown>;
                    const properties = (row.properties ?? {}) as Record<
                        string,
                        unknown
                    >;
                    const tileType = String(row.type ?? '');
                    const chartUuid =
                        (properties.savedChartUuid as string | undefined) ??
                        undefined;
                    if (tileType !== 'saved_chart' || !chartUuid) {
                        return {
                            tileUuid: row.uuid ?? null,
                            type: row.type ?? null,
                            status: 'skipped',
                            reason: '仅支持 saved_chart 磁贴，其他类型已跳过',
                        };
                    }
                    try {
                        const queryResult = await api.runDashboardChart(
                            apiKey,
                            projectUuid,
                            {
                                chartUuid,
                                dashboardUuid: args.dashboardUuid as string,
                                limit,
                            },
                            {
                                pageSize: 500,
                                maxPollAttempts: 120,
                                pollIntervalMs: 500,
                            },
                        );
                        const flatRows = rowsToScalarFlat(
                            (queryResult as { rows?: unknown }).rows ?? [],
                        );
                        return {
                            tileUuid: row.uuid ?? null,
                            type: row.type ?? null,
                            chartUuid,
                            status: 'success',
                            rows: full ? queryResult.rows : flatRows,
                            rowCount: Array.isArray(flatRows) ? flatRows.length : 0,
                        };
                    } catch (error) {
                        return {
                            tileUuid: row.uuid ?? null,
                            type: row.type ?? null,
                            chartUuid,
                            status: 'error',
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        };
                    }
                }),
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                dashboardUuid: args.dashboardUuid,
                                projectUuid,
                                resolvedDashboardContext: {
                                    dashboardUuid: args.dashboardUuid,
                                    source: 'explicitDashboardUuid',
                                    candidateCount: 1,
                                },
                                results,
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
        'tool-call',
        'get_dashboard_code',
        '导出看板 as-code 配置（用于迁移/备份）。',
        getDashboardCodeParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const data = await api.getDashboardsAsCode(apiKey, projectUuid, {
                ids: [args.dashboardUuid as string],
                languageMap: (args.languageMap as boolean | undefined) ?? false,
            });
            return {
                content: [
                    { type: 'text', text: JSON.stringify(data, null, 2) },
                ],
            };
        },
    );
}

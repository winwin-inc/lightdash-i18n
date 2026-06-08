import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiExecuteAsyncMetricQueryResults } from '@lightdash/common';
import { z, type ZodRawShape } from 'zod';
import type { LightdashMcpEnvConfig } from '../config';
import {
    DEFAULT_WEB_PATH_TEMPLATES,
    enrichSavedChartResult,
} from '../lib/contentWebUrls';
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
    full: z.boolean().optional(),
} satisfies ZodRawShape;

const getDashboardTilesParams = {
    dashboardUuid: z.string(),
    full: z.boolean().optional(),
} satisfies ZodRawShape;

const listChartsParams = {
    dashboardUuid: z.string(),
    full: z.boolean().optional(),
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

export function registerExtensionTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'tool-call',
        'get_site_info',
        '返回当前 MCP 所连 Lightdash 的站点根地址 siteBaseUrl（与 LIGHTDASH_SITE_URL 一致）；不含密钥。可与各工具返回的 webUrl 对照使用。',
        getSiteInfoParams,
        async () => {
            const payload = {
                siteBaseUrl: config.baseUrl,
                note: '图表/看板打开链接见 find_charts / find_dashboards / find_content、get_saved_chart 等工具返回的 webUrl。',
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
        '查看某张已保存图表的名称、可用参数、依赖的数据主题；跑数前先确认参数怎么填。返回含 siteBaseUrl 与 webUrl（浏览器打开该图表）。',
        getSavedChartParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const data = await api.getSavedChart(
                apiKey,
                args.chartUuid as string,
            );
            const enriched = enrichSavedChartResult(
                config.baseUrl,
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
        '按已保存图表跑数；可用 parameters 传筛选（如年份、区域）。limit 会按环境上限自动封顶。可选 projectUuid；省略时与核心工具一致：本次参数 > set_project 会话 > 环境 LIGHTDASH_PROJECT_UUID。',
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

            const result = await api.runSavedChart(
                apiKey,
                projectUuid,
                {
                    chartUuid: args.chartUuid as string,
                    versionUuid: args.versionUuid as string | undefined,
                    parameters: args.parameters as
                        | Record<string, unknown>
                        | undefined,
                    limit,
                },
                { pageSize, maxPollAttempts, pollIntervalMs },
            );
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
                    mode: 'saved_chart',
                    chartUuid: args.chartUuid as string,
                },
            });
        },
    );

    registerToolTyped(
        server,
        'tool-call',
        'list_charts',
        '按 dashboardUuid 列出看板内的已保存图表磁贴（层级浏览，非关键词搜索）。有 dashboardUuid 时用此工具；按名称搜索用 find_charts。',
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
        '读取看板磁贴布局（包含类型、坐标、关联图表信息）。',
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
        '批量执行看板内可运行磁贴（saved_chart）。sql_chart 与非查询磁贴会跳过并返回说明。',
        runDashboardTilesParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(config);
            const dashboard = (await api.getDashboard(
                apiKey,
                args.dashboardUuid as string,
            )) as Record<string, unknown>;
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
                        const queryResult = await api.runSavedChart(
                            apiKey,
                            projectUuid,
                            { chartUuid, limit },
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

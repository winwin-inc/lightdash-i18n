import {
    AnyType,
    Dashboard,
    ForbiddenError,
    getItemLabelWithoutTableName,
    getItemType,
    isDashboardChartTileType,
    MetricQuery,
    QueryExecutionContext,
    SavedChart,
    type DashboardQueryContextAttributes,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import {
    createRequiredDashboardGuard as createRequiredDashboardContextGuard,
    formatDashboardAccessError,
} from './access/requiredDashboardContext';
import { exploreRequiresDashboardContext } from './access/exploreRequiresDashboardContext';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import {
    PROJECT_UUID_PARAM_DESCRIPTION,
    resolveProjectContext,
} from './projectContext';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

const DEFAULT_QUERY_LIMIT = 500;

type RunSavedChartArgs = {
    savedChartUuid: string;
    projectUuid?: string;
    limit?: number;
    /** 强制看板模式（dashboardStrict）下传入的关联看板 UUID */
    dashboardUuid?: string;
};

type RunDashboardTilesArgs = {
    dashboardUuid: string;
    projectUuid?: string;
    limit?: number;
};

type QueryColumn = {
    fieldId: string;
    label: string;
    type: string;
};

type ChartRunResult = {
    columns: QueryColumn[];
    rows: Record<string, AnyType>[];
    rowCount: number;
    truncated: boolean;
};

type DashboardTileRunResult = {
    uuid: string;
    name: string;
    chartUuid: string | null;
    columns: QueryColumn[];
    rows: Record<string, AnyType>[];
    rowCount: number;
    error?: string;
};

/**
 * 单个磁贴的执行结果：返回 CallToolResult 表示严格模式下
 * 看板类 403/404 已把整批阻断（v1 对齐：提升为整批结果）。
 */
type DashboardTileRunOutcome = DashboardTileRunResult | CallToolResult;

const runSavedChartArgsSchema = {
    savedChartUuid: z
        .string()
        .describe('UUID (or slug) of the saved chart to run.'),
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Maximum number of rows to return. Defaults to 500 and is capped by the server query limit.',
        ),
};

/** 强制看板模式：run_saved_chart 增加可选 dashboardUuid 参数（非 strict 时不加） */
const dashboardUuidStrictParamSchema = z
    .string()
    .optional()
    .describe(
        '强制看板模式：本次查询关联的看板 UUID。未传时按 chartUuid 反查关联看板（唯一则自动使用；多个返回 status=dashboard_selection_required；一个都没有返回 dashboard_configuration_required）。',
    );

const runDashboardTilesArgsSchema = {
    dashboardUuid: z
        .string()
        .describe('UUID (or slug) of the dashboard whose tiles will be run.'),
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Maximum number of rows to return per tile. Defaults to 500 and is capped by the server query limit.',
        ),
};

/**
 * Computes the row limit to apply, capped by the server side query limit.
 */
const resolveRowLimit = (
    deps: McpToolDeps,
    limit: number | undefined,
): number => {
    const maxLimit =
        deps.lightdashConfig.ai.copilot.maxQueryLimit ?? DEFAULT_QUERY_LIMIT;
    return Math.min(limit ?? DEFAULT_QUERY_LIMIT, maxLimit);
};

/**
 * Mirrors the cell limit applied by `ProjectService.runMetricQuery` so that
 * the reported truncation state matches the executed query.
 */
const resolveEffectiveLimit = (
    deps: McpToolDeps,
    rowLimit: number,
    metricQuery: MetricQuery,
): number => {
    const numberColumns =
        metricQuery.dimensions.length + metricQuery.metrics.length;

    if (numberColumns === 0) {
        return rowLimit;
    }

    const cellsLimit = deps.lightdashConfig.query.csvCellsLimit;
    return Math.min(rowLimit, Math.floor(cellsLimit / numberColumns));
};

const buildColumns = (fields: Record<string, AnyType>): QueryColumn[] =>
    Object.entries(fields).map(([fieldId, item]) => ({
        fieldId,
        label: getItemLabelWithoutTableName(item),
        type: getItemType(item),
    }));

/**
 * 强制看板模式（MCP_DASHBOARD_STRICT，对齐 v1 环境变量同名义）。
 *
 * 默认 false：内部分析师零影响，非 strict 路径行为完全不变。
 */
const isDashboardStrict = (deps: McpToolDeps): boolean =>
    deps.lightdashConfig.mcp?.dashboardStrict === true;

/**
 * Runs the metric query of a saved chart and returns its rows.
 *
 * The chart metric query is executed as-is (filters, sorts, table
 * calculations and parameters are preserved), only the row limit is
 * overridden by the caller supplied limit.
 */
const runChartQuery = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
    chart: SavedChart,
    limit: number | undefined,
    dashboardContext?: DashboardQueryContextAttributes,
): Promise<ChartRunResult> => {
    const rowLimit = resolveRowLimit(deps, limit);
    const metricQuery: MetricQuery = {
        ...chart.metricQuery,
        limit: rowLimit,
    };
    const effectiveLimit = resolveEffectiveLimit(deps, rowLimit, metricQuery);

    const results = await deps.projectService.runMetricQuery({
        account: context.account,
        projectUuid,
        metricQuery,
        exploreName: metricQuery.exploreName,
        csvLimit: effectiveLimit,
        context: QueryExecutionContext.MCP,
        chartUuid: chart.uuid,
        dashboardContext,
        parameters: chart.parameters ?? {},
        queryTags: {
            project_uuid: projectUuid,
            user_uuid: context.user.userUuid,
            organization_uuid: context.organizationUuid,
        },
    });

    const rows = results.rows as Record<string, AnyType>[];

    return {
        columns: buildColumns(results.fields),
        rows,
        rowCount: rows.length,
        truncated: rows.length >= effectiveLimit,
    };
};

/**
 * Runs a single dashboard tile, returning the error message instead of
 * throwing when the tile query fails.
 */
const runDashboardTile = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
    tile: { uuid: string; properties: { title?: string } },
    chartUuid: string,
    limit: number | undefined,
    /** 严格模式下用于看板类 403/404 映射的 dashboardUuid */
    dashboardUuid: string,
    /** 磁贴查询的行级口径：所属看板的上下文（v1 对齐，sql_filter 依赖 slug） */
    dashboardContext: DashboardQueryContextAttributes,
): Promise<DashboardTileRunOutcome> => {
    const tileName = tile.properties.title ?? chartUuid;

    try {
        const chart = await deps.savedChartService.get(
            chartUuid,
            context.account,
            { projectUuid },
        );

        if (chart.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                `Chart does not belong to project ${projectUuid}`,
            );
        }

        const result = await runChartQuery(
            deps,
            context,
            projectUuid,
            chart,
            limit,
            dashboardContext,
        );

        return {
            uuid: tile.uuid,
            name: tile.properties.title ?? chart.name,
            chartUuid: chart.uuid,
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rowCount,
        };
    } catch (error) {
        // 严格模式：看板类 403/404 提升为整批结果（v1 对齐，已在执行的磁贴无法取消）
        if (isDashboardStrict(deps)) {
            const mapped = formatDashboardAccessError({
                error,
                projectUuid,
                dashboardUuid,
            });
            if (mapped) {
                return mapped;
            }
        }
        return {
            uuid: tile.uuid,
            name: tileName,
            chartUuid,
            columns: [],
            rows: [],
            rowCount: 0,
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error while running the tile',
        };
    }
};

/**
 * Registers the tools that run the queries of saved charts and dashboards.
 */
export const registerChartRunTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    const strict = isDashboardStrict(deps);
    // 看板上下文 guard（缓存共享）。strict 无条件 ensure；非 strict 时图表的
    // explore 需要看板上下文（sql_filter 引用 slug）或显式传 dashboardUuid
    // 才解析（v1 对齐）。
    const dashboardGuard = createRequiredDashboardContextGuard(deps);

    registry.register(
        McpToolName.RUN_SAVED_CHART,
        {
            description:
                'Run the query of a saved chart and get the resulting rows. Use get_saved_chart first to inspect the chart configuration. The chart filters, sorts and parameters are preserved; use limit to cap the number of returned rows.',
            // 强制看板模式：schema 增加可选 dashboardUuid 参数（非 strict 时保持原 schema）
            inputSchema: strict
                ? {
                      ...runSavedChartArgsSchema,
                      dashboardUuid: dashboardUuidStrictParamSchema,
                  }
                : runSavedChartArgsSchema,
        },
        async (args, context) => {
            const {
                savedChartUuid,
                projectUuid: explicitProjectUuid,
                limit,
                dashboardUuid,
            } = args as RunSavedChartArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            // `SavedChartService.get` applies the space permission filtering
            // and the viewer content scope of the calling user.
            const chart = await deps.savedChartService.get(
                savedChartUuid,
                context.account,
                { projectUuid },
            );

            if (chart.projectUuid !== projectUuid) {
                throw new ForbiddenError(
                    `Chart does not belong to project ${projectUuid}`,
                );
            }

            // 看板上下文（v1 对齐：先取图表，再解析）：strict 无条件；非 strict
            // 时图表 explore 需要上下文（sql_filter 引用看板 slug）或显式传了
            // dashboardUuid 才解析。blocked 返回结构化 payload，不执行查询。
            // 解析出的上下文传进查询：dbt sql_filter 行级权限依赖看板 slug，
            // 缺省会把行级过滤按 NA 跳过。
            let dashboardUuidForQuery: string | undefined = dashboardUuid;
            let dashboardContextForQuery:
                | DashboardQueryContextAttributes
                | undefined;
            const chartExplore = await deps.projectService.getExplore(
                context.account,
                projectUuid,
                chart.metricQuery.exploreName,
            );
            if (
                strict ||
                exploreRequiresDashboardContext(chartExplore) ||
                dashboardUuid !== undefined
            ) {
                const guardResult = await dashboardGuard.ensure(context, {
                    projectUuid,
                    dashboardUuid,
                    chartUuid: chart.uuid,
                });
                if (!guardResult.ok) {
                    return guardResult.result;
                }
                dashboardUuidForQuery = guardResult.context.dashboardUuid;
                dashboardContextForQuery = {
                    dashboardUuid: guardResult.context.dashboardUuid,
                    dashboardSlug: guardResult.context.dashboardSlug,
                    dashboardName: guardResult.context.dashboardName,
                };
            }

            let result: ChartRunResult;
            try {
                result = await runChartQuery(
                    deps,
                    context,
                    projectUuid,
                    chart,
                    limit,
                    dashboardContextForQuery,
                );
            } catch (error) {
                if (strict) {
                    // 严格模式：看板类 403/404 映射成 dashboard_* 状态
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

            return jsonToolResult({
                savedChartUuid: chart.uuid,
                name: chart.name,
                projectUuid,
                exploreName: chart.metricQuery.exploreName,
                columns: result.columns,
                rows: result.rows,
                rowCount: result.rowCount,
                truncated: result.truncated,
            });
        },
    );

    registry.register(
        McpToolName.RUN_DASHBOARD_TILES,
        {
            description:
                'Run the queries of every saved chart tile of a dashboard and get the resulting rows. Use get_dashboard_tiles to inspect the layout first. A tile that fails is reported with its error message and does not stop the other tiles from running.',
            inputSchema: runDashboardTilesArgsSchema,
        },
        async (args, context) => {
            const {
                dashboardUuid,
                projectUuid: explicitProjectUuid,
                limit,
            } = args as RunDashboardTilesArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            // `DashboardService.getByIdOrSlug` applies the space permission
            // filtering and the viewer dashboard allow list of the calling user.
            let dashboard: Dashboard;
            try {
                dashboard = await deps.dashboardService.getByIdOrSlug(
                    context.user,
                    dashboardUuid,
                    { projectUuid },
                );

                if (dashboard.projectUuid !== projectUuid) {
                    throw new ForbiddenError(
                        `Dashboard does not belong to project ${projectUuid}`,
                    );
                }
            } catch (error) {
                if (strict) {
                    // 严格模式：看板 403/404 在跑任何磁贴前整批阻断
                    const mapped = formatDashboardAccessError({
                        error,
                        projectUuid,
                        dashboardUuid,
                    });
                    if (mapped) {
                        return mapped;
                    }
                }
                throw error;
            }

            const savedChartTiles = dashboard.tiles.filter(
                isDashboardChartTileType,
            );

            const tiles: DashboardTileRunResult[] = [];

            // The tiles are run sequentially so that the warehouse is not
            // flooded with parallel queries for a single dashboard.
            // eslint-disable-next-line no-restricted-syntax
            for (const tile of savedChartTiles) {
                const chartUuid = tile.properties.savedChartUuid;

                if (!chartUuid) {
                    tiles.push({
                        uuid: tile.uuid,
                        name: tile.properties.title ?? tile.uuid,
                        chartUuid: null,
                        columns: [],
                        rows: [],
                        rowCount: 0,
                        error: 'Tile does not reference a saved chart',
                    });
                } else {
                    // The tiles are run sequentially so that the warehouse is
                    // not flooded with parallel queries for a single dashboard.
                    // eslint-disable-next-line no-await-in-loop
                    const tileResult = await runDashboardTile(
                        deps,
                        context,
                        projectUuid,
                        tile,
                        chartUuid,
                        limit,
                        dashboardUuid,
                        {
                            dashboardUuid: dashboard.uuid,
                            dashboardSlug: dashboard.slug,
                            dashboardName: dashboard.name,
                        },
                    );
                    if ('content' in tileResult) {
                        // 整批中止：返回看板类阻断结果（已在执行的磁贴无法取消）
                        return tileResult;
                    }
                    tiles.push(tileResult);
                }
            }

            const rowCount = tiles.reduce(
                (total, tile) => total + tile.rowCount,
                0,
            );

            return jsonToolResult({
                dashboardUuid: dashboard.uuid,
                name: dashboard.name,
                projectUuid,
                tiles,
                rowCount,
            });
        },
    );
};

import {
    AnyType,
    ForbiddenError,
    getItemLabelWithoutTableName,
    getItemType,
    isDashboardChartTileType,
    MetricQuery,
    QueryExecutionContext,
    SavedChart,
} from '@lightdash/common';
import { subject } from '@casl/ability';
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

const DEFAULT_QUERY_LIMIT = 500;

type RunSavedChartArgs = {
    savedChartUuid: string;
    projectUuid?: string;
    limit?: number;
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

const runSavedChartArgsSchema = {
    savedChartUuid: z
        .string()
        .describe('UUID (or slug) of the saved chart to run.'),
    projectUuid: z
        .string()
        .optional()
        .describe(
            'Project UUID the chart belongs to. Defaults to the project set with set_project.',
        ),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Maximum number of rows to return. Defaults to 500 and is capped by the server query limit.',
        ),
};

const runDashboardTilesArgsSchema = {
    dashboardUuid: z
        .string()
        .describe('UUID (or slug) of the dashboard whose tiles will be run.'),
    projectUuid: z
        .string()
        .optional()
        .describe(
            'Project UUID the dashboard belongs to. Defaults to the project set with set_project.',
        ),
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
 * Resolves the project to work on: explicit argument first, then the project
 * stored in the MCP context (set with `set_project`).
 */
const resolveProjectUuid = async (
    deps: McpToolDeps,
    context: McpToolContext,
    explicitProjectUuid?: string,
): Promise<string> => {
    if (explicitProjectUuid) {
        return explicitProjectUuid;
    }

    const contextRow = await deps.mcpContextModel.getContext(
        context.user.userUuid,
        context.organizationUuid,
    );
    const projectUuid = contextRow?.context.projectUuid;

    if (!projectUuid) {
        throw new ForbiddenError(
            'No project context set. Use set_project or provide projectUuid parameter.',
        );
    }

    return projectUuid;
};

/**
 * Throws when the user is not allowed to view the project.
 */
const assertCanViewProject = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
): Promise<void> => {
    const project = await deps.projectService.getProject(
        projectUuid,
        context.account,
    );

    if (
        !context.ability.can(
            'view',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid,
            }),
        )
    ) {
        throw new ForbiddenError('You do not have access to this project');
    }
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
): Promise<DashboardTileRunResult> => {
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
    registry.register(
        McpToolName.RUN_SAVED_CHART,
        {
            description:
                'Run the query of a saved chart and get the resulting rows. Use get_saved_chart first to inspect the chart configuration. The chart filters, sorts and parameters are preserved; use limit to cap the number of returned rows.',
            inputSchema: runSavedChartArgsSchema,
        },
        async (args, context) => {
            const {
                savedChartUuid,
                projectUuid: explicitProjectUuid,
                limit,
            } = args as RunSavedChartArgs;

            const projectUuid = await resolveProjectUuid(
                deps,
                context,
                explicitProjectUuid,
            );

            await assertCanViewProject(deps, context, projectUuid);


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

            const result = await runChartQuery(
                deps,
                context,
                projectUuid,
                chart,
                limit,
            );

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

            const projectUuid = await resolveProjectUuid(
                deps,
                context,
                explicitProjectUuid,
            );

            await assertCanViewProject(deps, context, projectUuid);


            // `DashboardService.getByIdOrSlug` applies the space permission
            // filtering and the viewer dashboard allow list of the calling user.
            const dashboard = await deps.dashboardService.getByIdOrSlug(
                context.user,
                dashboardUuid,
                { projectUuid },
            );

            if (dashboard.projectUuid !== projectUuid) {
                throw new ForbiddenError(
                    `Dashboard does not belong to project ${projectUuid}`,
                );
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
                    );
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

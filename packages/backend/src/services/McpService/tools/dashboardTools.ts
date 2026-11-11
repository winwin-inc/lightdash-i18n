import {
    assertUnreachable,
    ChartKind,
    Dashboard,
    DashboardTile,
    DashboardTileTypes,
    ForbiddenError,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { formatDashboardAccessError } from './access/requiredDashboardContext';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import {
    PROJECT_UUID_PARAM_DESCRIPTION,
    resolveProjectContext,
} from './projectContext';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

type GetDashboardArgs = {
    dashboardUuid: string;
    projectUuid?: string;
    full?: boolean;
};

type DashboardTileSummary = {
    uuid: string;
    type: DashboardTileTypes;
    title: string | null;
    x: number;
    y: number;
    h: number;
    w: number;
    tabUuid: string | null;
    chartUuid: string | null;
    chartName: string | null;
    chartKind: ChartKind | null;
    chartSlug: string | null;
};

const getDashboardArgsSchema = {
    dashboardUuid: z
        .string()
        .describe('UUID (or slug) of the dashboard to read.'),
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    full: z
        .boolean()
        .optional()
        .describe(
            'When true the full dashboard configuration (filters, parameters, tabs and the raw tile definitions) is returned. Defaults to false.',
        ),
};

const getDashboardTilesArgsSchema = {
    dashboardUuid: z
        .string()
        .describe('UUID (or slug) of the dashboard to read the tiles of.'),
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
};

/**
 * Converts a dashboard tile into a flat, LLM friendly summary.
 */
const summariseTile = (tile: DashboardTile): DashboardTileSummary => {
    const base = {
        uuid: tile.uuid,
        x: tile.x,
        y: tile.y,
        h: tile.h,
        w: tile.w,
        tabUuid: tile.tabUuid ?? null,
    };

    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return {
                ...base,
                type: tile.type,
                title: tile.properties.title ?? null,
                chartUuid: tile.properties.savedChartUuid ?? null,
                chartName: tile.properties.chartName ?? null,
                chartKind: tile.properties.lastVersionChartKind ?? null,
                chartSlug: tile.properties.chartSlug ?? null,
            };
        case DashboardTileTypes.SQL_CHART:
            return {
                ...base,
                type: tile.type,
                title: tile.properties.title ?? null,
                chartUuid: tile.properties.savedSqlUuid ?? null,
                chartName: tile.properties.chartName ?? null,
                chartKind: null,
                chartSlug: tile.properties.chartSlug ?? null,
            };
        case DashboardTileTypes.MARKDOWN:
        case DashboardTileTypes.LOOM:
        case DashboardTileTypes.DATA_APP:
            return {
                ...base,
                type: tile.type,
                title: tile.properties.title ?? null,
                chartUuid: null,
                chartName: null,
                chartKind: null,
                chartSlug: null,
            };
        default:
            return assertUnreachable(tile, 'Unknown dashboard tile type');
    }
};

/**
 * 强制看板模式（MCP_DASHBOARD_STRICT，对齐 v1 环境变量同名义）。
 *
 * 默认 false：内部分析师零影响，非 strict 路径行为完全不变。
 */
const isDashboardStrict = (deps: McpToolDeps): boolean =>
    deps.lightdashConfig.mcp?.dashboardStrict === true;

/**
 * Reads a dashboard, enforcing the project scope and the user permissions.
 *
 * 强制看板模式下，看板类 403/404 映射成 dashboard_* 状态的结构化 payload
 * （blocked=true）；非看板类错误与非 strict 路径原样抛出，行为不变。
 */
const readDashboard = async (
    deps: McpToolDeps,
    context: McpToolContext,
    dashboardUuidOrSlug: string,
    explicitProjectUuid?: string,
): Promise<
    | { blocked: false; projectUuid: string; dashboard: Dashboard }
    | { blocked: true; result: CallToolResult }
> => {
    const { projectUuid } = await resolveProjectContext(
        deps,
        context,
        explicitProjectUuid,
    );

    try {
        // `DashboardService.getByIdOrSlug` applies the space permission filtering
        // and the viewer dashboard allow list of the calling user.
        const dashboard = await deps.dashboardService.getByIdOrSlug(
            context.user,
            dashboardUuidOrSlug,
            { projectUuid },
        );

        if (dashboard.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                `Dashboard does not belong to project ${projectUuid}`,
            );
        }

        return { blocked: false, projectUuid, dashboard };
    } catch (error) {
        if (isDashboardStrict(deps)) {
            const mapped = formatDashboardAccessError({
                error,
                projectUuid,
                dashboardUuid: dashboardUuidOrSlug,
            });
            if (mapped) {
                return { blocked: true, result: mapped };
            }
        }
        throw error;
    }
};

const dashboardWebUrl = (
    deps: McpToolDeps,
    projectUuid: string,
    dashboardUuid: string,
): string =>
    `${deps.lightdashConfig.siteUrl}/projects/${encodeURIComponent(
        projectUuid,
    )}/dashboards/${encodeURIComponent(dashboardUuid)}/view`;

/**
 * Registers the read-only dashboard tools.
 */
export const registerDashboardTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.GET_DASHBOARD_CODE,
        {
            description:
                'Get the definition of a dashboard: its name, description, space, URL and the list of tiles it contains (each tile with the UUID, name, type and visualisation kind of the chart it renders). Use full=true to also get the dashboard filters, parameters, tabs and the raw tile definitions.',
            inputSchema: getDashboardArgsSchema,
        },
        async (args, context) => {
            const {
                dashboardUuid,
                projectUuid: explicitProjectUuid,
                full = false,
            } = args as GetDashboardArgs;

            const read = await readDashboard(
                deps,
                context,
                dashboardUuid,
                explicitProjectUuid,
            );
            if (read.blocked) {
                return read.result;
            }
            const { projectUuid, dashboard } = read;

            const tiles = dashboard.tiles.map(summariseTile);

            const summary = {
                uuid: dashboard.uuid,
                name: dashboard.name,
                description: dashboard.description ?? null,
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
                spaceUuid: dashboard.spaceUuid,
                spaceName: dashboard.spaceName,
                slug: dashboard.slug,
                isPrivate: dashboard.isPrivate,
                views: dashboard.views,
                updatedAt: dashboard.updatedAt,
                updatedByUser: dashboard.updatedByUser ?? null,
                tileCount: tiles.length,
                webUrl: dashboardWebUrl(deps, projectUuid, dashboard.uuid),
                tiles,
            };

            if (!full) {
                return jsonToolResult(summary);
            }

            return jsonToolResult({
                ...summary,
                filters: dashboard.filters,
                parameters: dashboard.parameters ?? {},
                tabs: dashboard.tabs,
                config: dashboard.config ?? null,
                rawTiles: dashboard.tiles,
            });
        },
    );

    registry.register(
        McpToolName.GET_DASHBOARD_TILES,
        {
            description:
                'Get the layout of the tiles of a dashboard without running anything: for each tile the UUID, type, position, and the UUID, name and visualisation kind (chartKind) of the chart it renders.',
            inputSchema: getDashboardTilesArgsSchema,
        },
        async (args, context) => {
            const { dashboardUuid, projectUuid: explicitProjectUuid } =
                args as GetDashboardArgs;

            const read = await readDashboard(
                deps,
                context,
                dashboardUuid,
                explicitProjectUuid,
            );
            if (read.blocked) {
                return read.result;
            }
            const { projectUuid, dashboard } = read;

            const tiles = dashboard.tiles.map(summariseTile);

            return jsonToolResult({
                dashboardUuid: dashboard.uuid,
                name: dashboard.name,
                projectUuid,
                tileCount: tiles.length,
                tiles,
            });
        },
    );
};

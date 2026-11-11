import {
    ForbiddenError,
    getChartKind,
    SavedChart,
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

type GetSavedChartArgs = {
    savedChartUuid: string;
    projectUuid?: string;
    full?: boolean;
};

const getSavedChartArgsSchema = {
    savedChartUuid: z
        .string()
        .describe('UUID (or slug) of the saved chart to read.'),
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    full: z
        .boolean()
        .optional()
        .describe(
            'When true the full chart configuration (metric query, chart config, parameters) is returned. Defaults to false, which returns a summary only.',
        ),
};

/**
 * Registers the read-only saved chart tool.
 */
export const registerSavedChartTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.GET_SAVED_CHART,
        {
            description:
                'Get the metadata of a saved chart: name, description, space, visualisation kind (chartKind, e.g. line/vertical_bar/custom), the URL to open it in Lightdash and the last update time. Use full=true to also get the chart configuration (metric query, chart config and parameters) before running it.',
            inputSchema: getSavedChartArgsSchema,
        },
        async (args, context) => {
            const {
                savedChartUuid,
                projectUuid: explicitProjectUuid,
                full = false,
            } = args as GetSavedChartArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            // 强制看板模式：图表所在空间 / 看板类 403/404 映射成 dashboard_*
            // 状态的结构化 payload；非看板类错误原样抛出（行为不变）。
            // 只读工具不查数，不适用 guard.ensure（v1 对齐）。
            let chart: SavedChart;
            try {
                // `SavedChartService.get` applies the space permission filtering
                // and the viewer content scope of the calling user.
                chart = await deps.savedChartService.get(
                    savedChartUuid,
                    context.account,
                    { projectUuid },
                );

                if (chart.projectUuid !== projectUuid) {
                    throw new ForbiddenError(
                        `Chart does not belong to project ${projectUuid}`,
                    );
                }
            } catch (error) {
                if (deps.lightdashConfig.mcp?.dashboardStrict === true) {
                    const mapped = formatDashboardAccessError({
                        error,
                        projectUuid,
                        dashboardUuid: null,
                    });
                    if (mapped) {
                        return mapped;
                    }
                }
                throw error;
            }

            const chartKind =
                getChartKind(chart.chartConfig.type, chart.chartConfig.config) ??
                null;

            const summary = {
                uuid: chart.uuid,
                name: chart.name,
                description: chart.description ?? null,
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
                spaceUuid: chart.spaceUuid,
                spaceName: chart.spaceName,
                slug: chart.slug,
                isPrivate: chart.isPrivate,
                tableName: chart.tableName,
                chartKind,
                chartType: chart.chartConfig.type,
                dashboardUuid: chart.dashboardUuid,
                dashboardName: chart.dashboardName,
                updatedAt: chart.updatedAt,
                updatedByUser: chart.updatedByUser ?? null,
                webUrl: `${deps.lightdashConfig.siteUrl}/projects/${encodeURIComponent(
                    chart.projectUuid,
                )}/saved/${encodeURIComponent(chart.uuid)}`,
            };

            if (!full) {
                return jsonToolResult(summary);
            }

            return jsonToolResult({
                ...summary,
                metricQuery: chart.metricQuery,
                chartConfig: chart.chartConfig,
                tableConfig: chart.tableConfig,
                parameters: chart.parameters ?? {},
                merge: chart.merge ?? null,
                pivotConfig: chart.pivotConfig ?? null,
                colorPalette: chart.colorPalette,
            });
        },
    );
};

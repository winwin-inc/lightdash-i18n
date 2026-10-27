import { ForbiddenError, getChartKind } from '@lightdash/common';
import { subject } from '@casl/ability';
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
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
        .describe(
            'Project UUID the chart belongs to. Defaults to the project set with set_project.',
        ),
    full: z
        .boolean()
        .optional()
        .describe(
            'When true the full chart configuration (metric query, chart config, parameters) is returned. Defaults to false, which returns a summary only.',
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

import {
    AnyType,
    ContentSortByColumns,
    ContentType,
    DashboardTileTypes,
    ForbiddenError,
    SummaryContent,
} from '@lightdash/common';
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import {
    PROJECT_UUID_PARAM_DESCRIPTION,
    resolveProjectContext,
} from './projectContext';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type ListSpacesArgs = {
    projectUuid?: string;
    page?: number;
    pageSize?: number;
    full?: boolean;
};

type ListDashboardsArgs = ListSpacesArgs & {
    /**
     * 省略时空项目级列出：返回该项目下当前用户可见的全部看板。
     */
    spaceUuid?: string;
};

type ListChartsArgs = {
    dashboardUuid: string;
    projectUuid?: string;
    full?: boolean;
};

type SlimContentItem = {
    uuid: string;
    name: string;
    contentType: ContentType;
    projectUuid: string;
    spaceUuid: string | null;
    spaceName: string | null;
    description: string | null;
    updatedAt: string | null;
    webUrl: string | null;
};

/**
 * A saved chart tile of a dashboard.
 */
type ChartTileItem = {
    uuid: string;
    name: string;
    contentType: ContentType;
    projectUuid: string;
    spaceUuid: string;
    webUrl: string;
    updatedAt: string | null;
    dashboardUuid: string;
    dashboardName: string;
    title: string | null;
    chartKind: string | null;
};

const paginationSchema = {
    page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(`1-based page number. Defaults to ${DEFAULT_PAGE}.`),
    pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_SIZE)
        .optional()
        .describe(
            `Number of items per page. Defaults to ${DEFAULT_PAGE_SIZE}, maximum ${MAX_PAGE_SIZE}.`,
        ),
};

const fullSchema = z
    .boolean()
    .optional()
    .describe(
        'When false (default) only a compact summary of every item is returned. When true the full content summary is returned.',
    );

const listSpacesArgsSchema = {
    projectUuid: z.string().optional().describe(PROJECT_UUID_PARAM_DESCRIPTION),
    ...paginationSchema,
    full: fullSchema,
};

const listDashboardsArgsSchema = {
    spaceUuid: z
        .string()
        .optional()
        .describe(
            'UUID of the space to list the dashboards of. Omit it to list every dashboard of the project the caller can view (permission filtered, including dashboards of private spaces the caller has access to).',
        ),
    projectUuid: z.string().optional().describe(PROJECT_UUID_PARAM_DESCRIPTION),
    ...paginationSchema,
    full: fullSchema,
};

const listChartsArgsSchema = {
    dashboardUuid: z
        .string()
        .describe(
            'UUID (or slug) of the dashboard to list the saved chart tiles of.',
        ),
    projectUuid: z.string().optional().describe(PROJECT_UUID_PARAM_DESCRIPTION),
    full: fullSchema,
};

/**
 * Builds the browser URL of a content item.
 */
const buildWebUrl = (
    siteUrl: string,
    projectUuid: string,
    contentType: ContentType,
    uuid: string,
): string | null => {
    const base = siteUrl.replace(/\/$/, '');
    switch (contentType) {
        case ContentType.CHART:
            return `${base}/projects/${encodeURIComponent(
                projectUuid,
            )}/saved/${encodeURIComponent(uuid)}`;
        case ContentType.DASHBOARD:
            return `${base}/projects/${encodeURIComponent(
                projectUuid,
            )}/dashboards/${encodeURIComponent(uuid)}/view`;
        case ContentType.SPACE:
            return `${base}/projects/${encodeURIComponent(
                projectUuid,
            )}/spaces/${encodeURIComponent(uuid)}`;
        case ContentType.DATA_APP:
            return null;
        default:
            return null;
    }
};

const toSlimItem = (
    siteUrl: string,
    content: SummaryContent,
): SlimContentItem => {
    const projectUuid = content.project.uuid;
    const space = content.space ?? null;

    return {
        uuid: content.uuid,
        name: content.name,
        contentType: content.contentType,
        projectUuid,
        spaceUuid: space?.uuid ?? null,
        spaceName: space?.name ?? null,
        description: content.description ?? null,
        updatedAt: content.lastUpdatedAt
            ? new Date(content.lastUpdatedAt).toISOString()
            : null,
        webUrl: buildWebUrl(
            siteUrl,
            projectUuid,
            content.contentType,
            content.uuid,
        ),
    };
};

/**
 * Returns the full content summary, enriched with the browser URL.
 */
const toFullItem = (siteUrl: string, content: SummaryContent): AnyType => ({
    ...content,
    webUrl: buildWebUrl(
        siteUrl,
        content.project.uuid,
        content.contentType,
        content.uuid,
    ),
});

/**
 * Lists the content of a project through the content service, which applies
 * the project and space permission filtering.
 */
const listContent = async (
    deps: McpToolDeps,
    context: McpToolContext,
    filters: {
        projectUuids: string[];
        spaceUuids?: string[];
        contentTypes: ContentType[];
    },
    page: number,
    pageSize: number,
): Promise<AnyType[]> => {
    const queryArgs: {
        sortBy?: ContentSortByColumns;
        sortDirection?: 'asc' | 'desc';
    } = {
        sortBy: ContentSortByColumns.LAST_UPDATED_AT,
        sortDirection: 'desc',
    };

    const paginated = await deps.contentService.find(
        context.user,
        filters,
        queryArgs,
        { page, pageSize },
    );

    return paginated.data;
};

/**
 * Registers the tools that list the content of a project: spaces, the
 * dashboards of a space, the saved chart tiles of a dashboard and the verified
 * content of a project.
 */
export const registerContentListTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.LIST_SPACES,
        {
            description:
                'List the spaces of a Lightdash project. Use it to browse the spaces of a project (not a keyword search - use find_spaces for that). Each space lists its uuid, name, description, number of charts and dashboards and the URL to open it in the browser.',
            inputSchema: listSpacesArgsSchema,
        },
        async (args, context) => {
            const {
                projectUuid: explicitProjectUuid,
                page = DEFAULT_PAGE,
                pageSize = DEFAULT_PAGE_SIZE,
                full = false,
            } = args as ListSpacesArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            const contents = await listContent(
                deps,
                context,
                {
                    projectUuids: [projectUuid],
                    contentTypes: [ContentType.SPACE],
                },
                page,
                pageSize,
            );

            return jsonToolResult(
                contents.map((content) =>
                    full
                        ? toFullItem(deps.lightdashConfig.siteUrl, content)
                        : toSlimItem(deps.lightdashConfig.siteUrl, content),
                ),
            );
        },
    );

    registry.register(
        McpToolName.LIST_DASHBOARDS,
        {
            description:
                'List the dashboards of a Lightdash project (not a keyword search - use find_dashboards for that). Pass spaceUuid to browse the dashboards of a single space; omit it to list every dashboard the caller can view in the project in one call (permission filtered, and dashboards of private spaces the caller has access to are included). Each dashboard lists its uuid, name, space name, description and the URL to open it in the browser. Results are paginated (pageSize default 50, max 100), so page through when the project has more dashboards.',
            inputSchema: listDashboardsArgsSchema,
        },
        async (args, context) => {
            const {
                spaceUuid,
                projectUuid: explicitProjectUuid,
                page = DEFAULT_PAGE,
                pageSize = DEFAULT_PAGE_SIZE,
                full = false,
            } = args as ListDashboardsArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            // 空字符串等同于省略：不把它当成一个待匹配的 spaceUuid
            const scopedSpaceUuid =
                typeof spaceUuid === 'string' && spaceUuid.trim().length > 0
                    ? spaceUuid.trim()
                    : undefined;

            const contents = await listContent(
                deps,
                context,
                {
                    projectUuids: [projectUuid],
                    // 省略 spaceUuid：项目级列举（仍由 ContentService 做空间 /
                    // 看板白名单的权限过滤）
                    spaceUuids:
                        scopedSpaceUuid === undefined
                            ? undefined
                            : [scopedSpaceUuid],
                    contentTypes: [ContentType.DASHBOARD],
                },
                page,
                pageSize,
            );

            return jsonToolResult(
                contents.map((content) =>
                    full
                        ? toFullItem(deps.lightdashConfig.siteUrl, content)
                        : toSlimItem(deps.lightdashConfig.siteUrl, content),
                ),
            );
        },
    );

    registry.register(
        McpToolName.LIST_CHARTS,
        {
            description:
                'List the saved chart tiles of a Lightdash dashboard. Use it to discover which charts a dashboard is made of. Each item lists the saved chart uuid, the chart name, the chart kind (the visualisation type, e.g. line or vertical_bar) and the URL to open the chart in the browser.',
            inputSchema: listChartsArgsSchema,
        },
        async (args, context) => {
            const {
                dashboardUuid,
                projectUuid: explicitProjectUuid,
                full = false,
            } = args as ListChartsArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            // `getByIdOrSlug` applies the dashboard/space permission checks.
            const dashboard = await deps.dashboardService.getByIdOrSlug(
                context.user,
                dashboardUuid,
            );

            if (
                explicitProjectUuid &&
                dashboard.projectUuid !== explicitProjectUuid
            ) {
                throw new ForbiddenError(
                    'The dashboard does not belong to the requested project',
                );
            }

            const { siteUrl } = deps.lightdashConfig;
            const items: ChartTileItem[] = dashboard.tiles
                .filter((tile) => tile.type === DashboardTileTypes.SAVED_CHART)
                .map((tile) => {
                    const properties =
                        tile.type === DashboardTileTypes.SAVED_CHART
                            ? tile.properties
                            : { savedChartUuid: null };
                    const chartUuid = properties.savedChartUuid;
                    return {
                        uuid: chartUuid ?? '',
                        name:
                            properties.chartName ??
                            properties.title ??
                            'Untitled chart',
                        contentType: ContentType.CHART,
                        projectUuid: dashboard.projectUuid,
                        spaceUuid: dashboard.spaceUuid,
                        webUrl:
                            chartUuid === null
                                ? ''
                                : buildWebUrl(
                                      siteUrl,
                                      dashboard.projectUuid,
                                      ContentType.CHART,
                                      chartUuid,
                                  ) ?? '',
                        updatedAt: dashboard.updatedAt
                            ? new Date(dashboard.updatedAt).toISOString()
                            : null,
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                        title: properties.title ?? null,
                        chartKind: properties.lastVersionChartKind ?? null,
                    };
                })
                .filter((item) => item.uuid !== '');

            return jsonToolResult(
                full
                    ? items.map((item) => ({
                          ...item,
                          dashboardUpdatedAt: dashboard.updatedAt
                              ? new Date(dashboard.updatedAt).toISOString()
                              : null,
                      }))
                    : items,
            );
        },
    );
};

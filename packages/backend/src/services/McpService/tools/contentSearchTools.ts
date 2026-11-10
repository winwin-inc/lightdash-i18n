import {
    AnyType,
    ContentSortByColumns,
    ContentType,
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

/**
 * Content types searched by the generic `find_content` tool.
 */
const ALL_SEARCHABLE_CONTENT_TYPES: ContentType[] = [
    ContentType.CHART,
    ContentType.DASHBOARD,
    ContentType.SPACE,
];

type ContentSearchArgs = {
    projectUuid?: string;
    searchQueries: { label: string }[];
    page?: number;
    pageSize?: number;
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

const searchQueriesSchema = {
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    searchQueries: z
        .array(
            z.object({
                label: z
                    .string()
                    .describe(
                        'Keyword to search for. Matches content names, descriptions and space names.',
                    ),
            }),
        )
        .describe(
            'List of keywords to search for. Each keyword is searched separately and the results are returned per keyword.',
        ),
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
            `Number of results per keyword. Defaults to ${DEFAULT_PAGE_SIZE}, maximum ${MAX_PAGE_SIZE}.`,
        ),
    full: z
        .boolean()
        .optional()
        .describe(
            'When false (default) only a compact summary of every result is returned. When true the full content summary is returned.',
        ),
};

/**
 * Builds the browser URL of a content item.
 */
const buildWebUrl = (
    siteUrl: string,
    projectUuid: string,
    content: SummaryContent,
): string | null => {
    const base = siteUrl.replace(/\/$/, '');
    switch (content.contentType) {
        case ContentType.CHART:
            return `${base}/projects/${encodeURIComponent(
                projectUuid,
            )}/saved/${encodeURIComponent(content.uuid)}`;
        case ContentType.DASHBOARD:
            return `${base}/projects/${encodeURIComponent(
                projectUuid,
            )}/dashboards/${encodeURIComponent(content.uuid)}/view`;
        case ContentType.SPACE:
            return `${base}/projects/${encodeURIComponent(
                projectUuid,
            )}/spaces/${encodeURIComponent(content.uuid)}`;
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
    const spaceUuid = content.space?.uuid ?? null;

    return {
        uuid: content.uuid,
        name: content.name,
        contentType: content.contentType,
        projectUuid,
        spaceUuid,
        spaceName: content.space?.name ?? null,
        description: content.description ?? null,
        updatedAt: content.lastUpdatedAt
            ? new Date(content.lastUpdatedAt).toISOString()
            : null,
        webUrl: buildWebUrl(siteUrl, projectUuid, content),
    };
};

/**
 * Runs one keyword search and returns the results for it.
 */
const searchForLabel = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
    label: string,
    contentTypes: ContentType[] | undefined,
    page: number,
    pageSize: number,
    full: boolean,
): Promise<{ label: string; results: AnyType[] }> => {
    const filters = {
        projectUuids: [projectUuid],
        contentTypes,
        search: label,
    };

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

    const results = paginated.data.map((content) =>
        full
            ? {
                  ...content,
                  webUrl: buildWebUrl(
                      deps.lightdashConfig.siteUrl,
                      content.project.uuid,
                      content,
                  ),
              }
            : toSlimItem(deps.lightdashConfig.siteUrl, content),
    );

    return { label, results };
};

/**
 * Runs the search for every keyword of the tool arguments.
 */
const runSearch = async (
    deps: McpToolDeps,
    context: McpToolContext,
    args: ContentSearchArgs,
    contentTypes: ContentType[] | undefined,
): Promise<AnyType> => {
    const {
        projectUuid: explicitProjectUuid,
        searchQueries,
        page = DEFAULT_PAGE,
        pageSize = DEFAULT_PAGE_SIZE,
        full = false,
    } = args;

    const { projectUuid } = await resolveProjectContext(
        deps,
        context,
        explicitProjectUuid,
    );

    const results = await Promise.all(
        searchQueries.map((query) =>
            searchForLabel(
                deps,
                context,
                projectUuid,
                query.label,
                contentTypes,
                page,
                pageSize,
                full,
            ),
        ),
    );

    return results;
};

/**
 * Registers the keyword search tools for charts, dashboards and spaces.
 */
export const registerContentSearchTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.FIND_CONTENT,
        {
            description:
                'Search charts, dashboards and spaces in a Lightdash project by keyword. Provide one or more search queries; each query is searched separately and the results are returned per query. Use find_charts, find_dashboards or find_spaces when you already know the content type. Set full=true to get the complete content summary instead of a compact one.',
            inputSchema: searchQueriesSchema,
        },
        async (args, context) => {
            const result = await runSearch(
                deps,
                context,
                args as ContentSearchArgs,
                ALL_SEARCHABLE_CONTENT_TYPES,
            );
            return jsonToolResult(result);
        },
    );

    registry.register(
        McpToolName.FIND_CHARTS,
        {
            description:
                'Search saved charts in a Lightdash project by keyword. Provide one or more search queries; each query is searched separately and the results are returned per query. Use full=true to get the complete chart summary instead of a compact one.',
            inputSchema: searchQueriesSchema,
        },
        async (args, context) => {
            const result = await runSearch(deps, context, args as ContentSearchArgs, [
                ContentType.CHART,
            ]);
            return jsonToolResult(result);
        },
    );

    registry.register(
        McpToolName.FIND_DASHBOARDS,
        {
            description:
                'Search dashboards in a Lightdash project by keyword. Provide one or more search queries; each query is searched separately and the results are returned per query. Use full=true to get the complete dashboard summary instead of a compact one.',
            inputSchema: searchQueriesSchema,
        },
        async (args, context) => {
            const result = await runSearch(deps, context, args as ContentSearchArgs, [
                ContentType.DASHBOARD,
            ]);
            return jsonToolResult(result);
        },
    );

    registry.register(
        McpToolName.FIND_SPACES,
        {
            description:
                'Search spaces in a Lightdash project by keyword. Provide one or more search queries; each query is searched separately and the results are returned per query. Use full=true to get the complete space summary instead of a compact one.',
            inputSchema: searchQueriesSchema,
        },
        async (args, context) => {
            const result = await runSearch(deps, context, args as ContentSearchArgs, [
                ContentType.SPACE,
            ]);
            return jsonToolResult(result);
        },
    );
};

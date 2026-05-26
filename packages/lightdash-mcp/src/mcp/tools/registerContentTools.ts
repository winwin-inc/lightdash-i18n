import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import {
    DEFAULT_WEB_PATH_TEMPLATES,
    enrichContentSearchResults,
} from '../../lib/contentWebUrls';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';

const searchQueriesSchema = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
    searchQueries: z.array(z.object({ label: z.string() })),
    page: z.number().optional(),
    pageSize: z.number().optional(),
};

async function runLabelWiseContentSearch(
    args: Record<string, unknown>,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
    contentTypes: string[] | undefined,
): Promise<CallToolResult> {
    const apiKey = resolveCoreToolsApiKey(
        config,
        args.apiKey as string | undefined,
    );
    const projectUuid = resolveCoreToolsProjectUuid(
        config,
        apiKey,
        args.projectUuid as string | undefined,
    );
    const labels = (args.searchQueries as { label: string }[]).map(
        (x) => x.label,
    );
    const merged: unknown[] = [];
    for (const label of labels) {
        const data = await api.searchContent(apiKey, projectUuid, {
            search: label,
            contentTypes,
            page: args.page as number | undefined,
            pageSize: args.pageSize as number | undefined,
        });
        const enriched = enrichContentSearchResults(
            config.baseUrl,
            DEFAULT_WEB_PATH_TEMPLATES,
            data,
        );
        merged.push({ label, results: enriched });
    }
    return {
        content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }],
    };
}

export function registerContentTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'find_content',
        '混合关键词搜索图表、看板、空间（v2 content API，不传 contentTypes 过滤）；返回含 webUrl。若已知类型优先用 find_charts / find_dashboards / find_spaces。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                undefined,
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_charts',
        '按关键词搜索已保存图表（v2 content API，`contentTypes` 固定为 chart）；返回含 webUrl。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                ['chart'],
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_dashboards',
        '按关键词搜索看板（v2 content API，`contentTypes` 固定为 dashboard）；返回含 webUrl。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                ['dashboard'],
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_spaces',
        '按关键词搜索空间（v2 content API，`contentTypes` 固定为 space）；返回含 webUrl。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                ['space'],
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'list_verified_content',
        '列出项目已验证图表/看板（GET …/content-verification）。',
        { apiKey: z.string().optional(), projectUuid: z.string().optional() },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const data = await api.listVerifiedContent(apiKey, projectUuid);
            return {
                content: [
                    { type: 'text', text: JSON.stringify(data, null, 2) },
                ],
            };
        },
    );
}

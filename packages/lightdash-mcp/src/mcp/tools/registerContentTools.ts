import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export function registerContentTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'find_content',
        '搜索图表、看板、空间（v2 content API）；返回含 webUrl。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            searchQueries: z.array(z.object({ label: z.string() })),
            page: z.number().optional(),
            pageSize: z.number().optional(),
        },
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
            const labels = (args.searchQueries as { label: string }[]).map(
                (x) => x.label,
            );
            const merged: unknown[] = [];
            for (const label of labels) {
                const data = await api.searchContent(apiKey, projectUuid, {
                    search: label,
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
                content: [
                    { type: 'text', text: JSON.stringify(merged, null, 2) },
                ],
            };
        },
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

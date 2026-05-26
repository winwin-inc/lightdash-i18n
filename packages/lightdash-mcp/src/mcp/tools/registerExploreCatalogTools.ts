import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import {
    extractCatalogItems,
    HEURISTIC_RANKING_VERSION,
    sortCatalogByHeuristic,
} from '../../lib/catalogSearchHeuristics';
import { getMcpSession } from '../../lib/mcpSessionStore';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';

export function registerExploreCatalogTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'list_explores',
        '列出项目 explores（REST: GET …/explores）。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            filtered: z.boolean().optional(),
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
            const filtered = (args.filtered as boolean | undefined) ?? true;
            const data = await api.listExplores(apiKey, projectUuid, filtered);
            return {
                content: [
                    { type: 'text', text: JSON.stringify(data, null, 2) },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_explores',
        '用数据目录搜索「找 explore」（GET …/dataCatalog?type=table&search=…）。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            searchQuery: z.string(),
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
            const tags = getMcpSession(apiKey).tags ?? undefined;
            const catalog = await api.getCatalog(apiKey, projectUuid, {
                search: args.searchQuery as string,
                type: 'table',
                catalogTags: tags ?? undefined,
            });
            const sq = args.searchQuery as string;
            const items = extractCatalogItems(catalog);
            const catalogResults =
                items.length > 0
                    ? sortCatalogByHeuristic(items, sq)
                    : catalog;
            const payload = {
                searchQuery: sq,
                heuristicRankingVersion: HEURISTIC_RANKING_VERSION,
                note: '基于 GET …/dataCatalog 的目录检索；条目含 heuristicScore 并按其降序排列。',
                catalogResults,
            };
            return {
                content: [
                    { type: 'text', text: JSON.stringify(payload, null, 2) },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_fields',
        '在指定 explore（table）内用目录搜索找字段（GET …/dataCatalog?type=field&search=…）。支持多组关键词；分页为简化版（每关键词一条 catalog 调用）。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            table: z.string(),
            fieldSearchQueries: z.array(z.object({ label: z.string() })),
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
            const table = args.table as string;
            const queries = args.fieldSearchQueries as { label: string }[];
            const tags = getMcpSession(apiKey).tags ?? undefined;
            const results: unknown[] = [];
            for (const q of queries) {
                const searchStr = `${table} ${q.label}`.trim();
                const catalog = await api.getCatalog(apiKey, projectUuid, {
                    search: searchStr,
                    type: 'field',
                    catalogTags: tags ?? undefined,
                });
                const items = extractCatalogItems(catalog);
                const catalogResults =
                    items.length > 0
                        ? sortCatalogByHeuristic(items, searchStr)
                        : catalog;
                results.push({
                    label: q.label,
                    heuristicRankingVersion: HEURISTIC_RANKING_VERSION,
                    catalogResults,
                });
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                table,
                                searchQueries: results,
                                note: '基于 dataCatalog；分页为简化实现。catalogResults 条目含 heuristicScore 并按其降序排列。',
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );
}

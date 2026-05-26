import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import {
    extractCatalogItems,
    HEURISTIC_RANKING_VERSION,
    sortCatalogByHeuristic,
} from '../../lib/catalogSearchHeuristics';
import { maybeSlimList, slimExplore } from '../../lib/toolOutput';
import { getMcpSession } from '../../lib/mcpSessionStore';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';

type FieldCandidate = {
    fieldId: string;
    name: string | null;
    label: string | null;
    type: string | null;
};

function collectFieldsFromExplore(explore: unknown): FieldCandidate[] {
    const result: FieldCandidate[] = [];
    const seen = new Set<string>();
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;
        const fieldId = typeof obj.fieldId === 'string' ? obj.fieldId : null;
        if (fieldId && !seen.has(fieldId)) {
            seen.add(fieldId);
            result.push({
                fieldId,
                name: typeof obj.name === 'string' ? obj.name : null,
                label: typeof obj.label === 'string' ? obj.label : null,
                type: typeof obj.type === 'string' ? obj.type : null,
            });
        }
        Object.values(obj).forEach(walk);
    };
    walk(explore);
    return result;
}

function searchFieldsInExplore(
    fields: FieldCandidate[],
    label: string,
    page: number,
    pageSize: number,
): { rows: FieldCandidate[]; total: number; totalPageCount: number } {
    const q = label.trim().toLowerCase();
    const matched =
        q.length === 0
            ? fields
            : fields.filter((f) =>
                  [f.fieldId, f.name ?? '', f.label ?? '']
                      .join(' ')
                      .toLowerCase()
                      .includes(q),
              );
    const total = matched.length;
    const totalPageCount = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
        rows: matched.slice(start, start + pageSize),
        total,
        totalPageCount,
    };
}

export function registerExploreCatalogTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'list_explores',
        '列出项目 explores（REST: GET …/explores）。默认精简字段；full=true 返回完整结构。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            filtered: z.boolean().optional(),
            page: z.number().optional(),
            pageSize: z.number().optional(),
            full: z.boolean().optional(),
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
            const full = (args.full as boolean | undefined) ?? false;
            const page = Math.max(1, (args.page as number | undefined) ?? 1);
            const pageSize = Math.max(
                1,
                (args.pageSize as number | undefined) ?? 50,
            );
            const data = await api.listExplores(apiKey, projectUuid, filtered);
            const arrayData = Array.isArray(data) ? data : [];
            const totalResults = arrayData.length;
            const totalPageCount = Math.max(
                1,
                Math.ceil(totalResults / pageSize),
            );
            const paged = arrayData.slice(
                (page - 1) * pageSize,
                (page - 1) * pageSize + pageSize,
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                page,
                                pageSize,
                                totalResults,
                                totalPageCount,
                                data: maybeSlimList(paged, full, slimExplore),
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_explores',
        '用数据目录搜索「找 explore」（GET …/dataCatalog?type=table&search=…）。默认精简字段；full=true 返回完整结构。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            searchQuery: z.string(),
            full: z.boolean().optional(),
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
            const full = (args.full as boolean | undefined) ?? false;
            const items = extractCatalogItems(catalog);
            const catalogResults =
                items.length > 0
                    ? sortCatalogByHeuristic(items, sq)
                    : catalog;
            const payload = {
                searchQuery: sq,
                heuristicRankingVersion: HEURISTIC_RANKING_VERSION,
                note: '基于 GET …/dataCatalog 的目录检索；条目含 heuristicScore 并按其降序排列。',
                catalogResults: maybeSlimList(catalogResults, full, slimExplore),
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
        '在指定 explore（table）内找字段。主结果来自 dataCatalog（catalog-first 排序）；explore 定义仅作补全与纠错提示。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
            table: z.string(),
            fieldSearchQueries: z.array(z.object({ label: z.string() })),
            page: z.number().optional(),
            pageSize: z.number().optional(),
            full: z.boolean().optional(),
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
            const full = (args.full as boolean | undefined) ?? false;
            const page = Math.max(1, (args.page as number | undefined) ?? 1);
            const pageSize = Math.max(
                1,
                (args.pageSize as number | undefined) ?? 15,
            );
            const tags = getMcpSession(apiKey).tags ?? undefined;
            const results: unknown[] = [];
            const explore = await api.getExplore(apiKey, projectUuid, table);
            const exploreFields = collectFieldsFromExplore(explore);
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
                const catalogRows = Array.isArray(catalogResults)
                    ? catalogResults
                    : extractCatalogItems(catalogResults);
                const catalogTotal = catalogRows.length;
                const catalogTotalPageCount = Math.max(
                    1,
                    Math.ceil(catalogTotal / pageSize),
                );
                const catalogPaged = catalogRows.slice(
                    (page - 1) * pageSize,
                    (page - 1) * pageSize + pageSize,
                );
                const exploreMatched = searchFieldsInExplore(
                    exploreFields,
                    q.label,
                    page,
                    pageSize,
                );
                results.push({
                    label: q.label,
                    heuristicRankingVersion: HEURISTIC_RANKING_VERSION,
                    page,
                    pageSize,
                    primaryCatalogResults: maybeSlimList(
                        catalogPaged,
                        full,
                        (item) => {
                            const row = item as Record<string, unknown>;
                            return {
                                name:
                                    (row.name as string | undefined) ??
                                    (row.fieldId as string | undefined) ??
                                    null,
                                label: (row.label as string | undefined) ?? null,
                                fieldId:
                                    (row.fieldId as string | undefined) ?? null,
                                heuristicScore:
                                    (row.heuristicScore as number | undefined) ??
                                    null,
                            };
                        },
                    ),
                    catalogPagination: {
                        totalResults: catalogTotal,
                        totalPageCount: catalogTotalPageCount,
                    },
                    supplementalExploreHints: full
                        ? exploreMatched.rows
                        : exploreMatched.rows.map((f) => ({
                              fieldId: f.fieldId,
                              label: f.label,
                              type: f.type,
                          })),
                    explorePagination: {
                        totalResults: exploreMatched.total,
                        totalPageCount: exploreMatched.totalPageCount,
                    },
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
                                note: full
                                    ? 'catalog-first（主结果）+ explore-hints（补全）模式，full 返回完整细节。'
                                    : 'catalog-first（主结果）+ explore-hints（补全）模式，默认精简。',
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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getItemId } from '@lightdash/common';
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

export function isFieldInTable(fieldId: string, table: string): boolean {
    return fieldId.startsWith(`${table}_`);
}

export function resolveFieldIdFromParts(
    fieldId: unknown,
    table: unknown,
    name: unknown,
): string | null {
    if (typeof fieldId === 'string' && fieldId.length > 0) return fieldId;
    if (
        typeof table === 'string' &&
        table.length > 0 &&
        typeof name === 'string' &&
        name.length > 0
    ) {
        return getItemId({ table, name });
    }
    return null;
}

export function collectFieldsFromExplore(explore: unknown): FieldCandidate[] {
    const result: FieldCandidate[] = [];
    const seen = new Set<string>();
    const pushCandidate = (params: {
        fieldId: unknown;
        table: unknown;
        name: unknown;
        label: unknown;
        type: unknown;
    }): void => {
        const resolvedFieldId = resolveFieldIdFromParts(
            params.fieldId,
            params.table,
            params.name,
        );
        if (!resolvedFieldId || seen.has(resolvedFieldId)) return;
        seen.add(resolvedFieldId);
        result.push({
            fieldId: resolvedFieldId,
            name: typeof params.name === 'string' ? params.name : null,
            label: typeof params.label === 'string' ? params.label : null,
            type: typeof params.type === 'string' ? params.type : null,
        });
    };
    const root = explore as Record<string, unknown> | null;
    const tables = Array.isArray(root?.tables) ? root.tables : [];
    tables.forEach((tableItem) => {
        if (!tableItem || typeof tableItem !== 'object') return;
        const tableObj = tableItem as Record<string, unknown>;
        const tableName = tableObj.name;
        const dimensions = Array.isArray(tableObj.dimensions)
            ? tableObj.dimensions
            : [];
        const metrics = Array.isArray(tableObj.metrics) ? tableObj.metrics : [];
        [...dimensions, ...metrics].forEach((fieldItem) => {
            if (!fieldItem || typeof fieldItem !== 'object') return;
            const fieldObj = fieldItem as Record<string, unknown>;
            pushCandidate({
                fieldId: fieldObj.fieldId,
                table: fieldObj.table ?? tableName,
                name: fieldObj.name,
                label: fieldObj.label,
                type: fieldObj.type,
            });
        });
    });
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;
        pushCandidate({
            fieldId: obj.fieldId,
            table: obj.table ?? obj.tableName,
            name: obj.name,
            label: obj.label,
            type: obj.type,
        });
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
            const exploreFields = collectFieldsFromExplore(explore).filter((field) =>
                isFieldInTable(field.fieldId, table),
            );
            for (const q of queries) {
                const searchStr = q.label.trim();
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
                const tableScopedCatalogRows = catalogRows.filter((item) => {
                    if (!item || typeof item !== 'object') return false;
                    const row = item as Record<string, unknown>;
                    if (row.tableName === table) return true;
                    const resolvedFieldId = resolveFieldIdFromParts(
                        row.fieldId,
                        row.tableName,
                        row.name,
                    );
                    return (
                        typeof resolvedFieldId === 'string' &&
                        resolvedFieldId.startsWith(`${table}_`)
                    );
                });
                const catalogTotal = tableScopedCatalogRows.length;
                const catalogPaged = tableScopedCatalogRows.slice(
                    (page - 1) * pageSize,
                    (page - 1) * pageSize + pageSize,
                );
                const exploreMatched = searchFieldsInExplore(
                    exploreFields,
                    q.label,
                    page,
                    pageSize,
                );
                const primaryRows =
                    catalogPaged.length > 0 ? catalogPaged : exploreMatched.rows;
                const primarySource = catalogPaged.length > 0 ? 'catalog' : 'explore-hints';
                const primaryTotal =
                    primarySource === 'catalog'
                        ? catalogTotal
                        : exploreMatched.total;
                const primaryTotalPageCount = Math.max(
                    1,
                    Math.ceil(primaryTotal / pageSize),
                );
                results.push({
                    label: q.label,
                    heuristicRankingVersion: HEURISTIC_RANKING_VERSION,
                    page,
                    pageSize,
                    source: primarySource,
                    primaryCatalogResults: maybeSlimList(
                        primaryRows,
                        full,
                        (item) => {
                            const row = item as Record<string, unknown>;
                            const resolvedFieldId = resolveFieldIdFromParts(
                                row.fieldId,
                                row.tableName,
                                row.name,
                            );
                            return {
                                name:
                                    (row.name as string | undefined) ??
                                    resolvedFieldId ??
                                    null,
                                label: (row.label as string | undefined) ?? null,
                                fieldId: resolvedFieldId,
                                heuristicScore:
                                    (row.heuristicScore as number | undefined) ??
                                    null,
                            };
                        },
                    ),
                    catalogPagination: {
                        totalResults: primaryTotal,
                        totalPageCount: primaryTotalPageCount,
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

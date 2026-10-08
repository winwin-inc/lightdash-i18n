import { extractCatalogItems } from '../../lib/catalogSearchHeuristics';
import type { LightdashRestClient } from '../../rest/lightdashRest';

const CATALOG_PAGE_SIZE = 500;

function paginationTotalPageCount(result: unknown): number | null {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return null;
    }
    const pagination = (result as { pagination?: unknown }).pagination;
    if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) {
        return null;
    }
    const totalPageCount = (pagination as { totalPageCount?: unknown })
        .totalPageCount;
    return typeof totalPageCount === 'number' && totalPageCount > 0
        ? totalPageCount
        : null;
}

export async function listAllCatalogTables(
    api: LightdashRestClient,
    apiKey: string,
    projectUuid: string,
): Promise<unknown[]> {
    const first = await api.getCatalog(apiKey, projectUuid, {
        type: 'table',
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
    });
    const items = extractCatalogItems(first);
    const totalPageCount = paginationTotalPageCount(first);
    if (totalPageCount === null || totalPageCount <= 1) {
        return items;
    }
    const pages = await Promise.all(
        Array.from({ length: totalPageCount - 1 }, (_, index) =>
            api.getCatalog(apiKey, projectUuid, {
                type: 'table',
                page: index + 2,
                pageSize: CATALOG_PAGE_SIZE,
            }),
        ),
    );
    return pages.reduce<unknown[]>(
        (acc, page) => acc.concat(extractCatalogItems(page)),
        items,
    );
}

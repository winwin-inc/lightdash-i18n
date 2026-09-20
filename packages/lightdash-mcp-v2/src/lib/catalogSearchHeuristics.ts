/** 对 dataCatalog 返回的目录条目做轻量打分与排序。 */
export const HEURISTIC_RANKING_VERSION = '1';

export type CatalogItemLike = Record<string, unknown>;

export type CatalogItemWithHeuristic<T extends CatalogItemLike = CatalogItemLike> =
    T & { heuristicScore: number };

/** 从 getCatalog 的 unknown 结果中取出可遍历的条目列表（数组或 { data: [] }）。 */
export function extractCatalogItems(catalog: unknown): CatalogItemLike[] {
    if (Array.isArray(catalog)) {
        return catalog.filter(
            (x): x is CatalogItemLike =>
                x !== null && typeof x === 'object' && !Array.isArray(x),
        );
    }
    if (
        catalog &&
        typeof catalog === 'object' &&
        'data' in catalog &&
        Array.isArray((catalog as { data: unknown }).data)
    ) {
        return (catalog as { data: unknown[] }).data.filter(
            (x): x is CatalogItemLike =>
                x !== null && typeof x === 'object' && !Array.isArray(x),
        );
    }
    return [];
}

function strField(item: CatalogItemLike, key: string): string {
    const v = item[key];
    return typeof v === 'string' ? v : '';
}

function normalizeForMatch(s: string): string {
    return s.trim().toLowerCase();
}

function tokenizeQuery(q: string): string[] {
    return normalizeForMatch(q)
        .split(/[\s/_,.-]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

/**
 * 单条启发式分数（越大越靠前）。规则固定、可测；变更时请递增 HEURISTIC_RANKING_VERSION。
 */
export function scoreCatalogItem(
    item: CatalogItemLike,
    searchQuery: string,
): number {
    const qRaw = searchQuery.trim();
    if (qRaw.length === 0) {
        return 0;
    }

    const name = normalizeForMatch(strField(item, 'name'));
    const label = normalizeForMatch(strField(item, 'label'));
    const description = normalizeForMatch(strField(item, 'description'));
    const tableName = normalizeForMatch(strField(item, 'tableName'));
    const full = normalizeForMatch(qRaw);
    const tokens = tokenizeQuery(qRaw);

    let score = 0;

    // 整句匹配（优先于表名 / 标签）
    if (name === full) {
        score += 10_000;
    } else if (label === full) {
        score += 9_500;
    } else if (tableName && tableName === full) {
        score += 9_000;
    } else if (name.startsWith(full) && full.length >= 2) {
        score += 4_000;
    } else if (label.startsWith(full) && full.length >= 2) {
        score += 3_800;
    } else if (name.includes(full)) {
        score += 2_500;
    } else if (label.includes(full)) {
        score += 2_200;
    } else if (description.includes(full)) {
        score += 800;
    }

    // 分词命中（多词查询）
    for (const t of tokens) {
        if (t.length === 0) continue;
        if (name === t) {
            score += 600;
        } else if (label === t) {
            score += 550;
        } else if (name.startsWith(t)) {
            score += 300;
        } else if (label.startsWith(t)) {
            score += 280;
        } else if (name.includes(t)) {
            score += 150;
        } else if (label.includes(t)) {
            score += 120;
        } else if (tableName.includes(t)) {
            score += 100;
        } else if (description.includes(t)) {
            score += 40;
        }
    }

    return score;
}

function stableTieKey(item: CatalogItemLike): string {
    const name = strField(item, 'name');
    const label = strField(item, 'label');
    const uuid = strField(item, 'catalogSearchUuid');
    return `${name}\u0000${label}\u0000${uuid}`;
}

/**
 * 返回新数组：每项附带 heuristicScore，按分数降序；同分按 name/label/uuid 稳定序。
 */
export function sortCatalogByHeuristic<T extends CatalogItemLike>(
    items: T[],
    searchQuery: string,
): CatalogItemWithHeuristic<T>[] {
    const enriched = items.map((item) => {
        const heuristicScore = scoreCatalogItem(item, searchQuery);
        return { ...item, heuristicScore } as CatalogItemWithHeuristic<T>;
    });

    enriched.sort((a, b) => {
        if (b.heuristicScore !== a.heuristicScore) {
            return b.heuristicScore - a.heuristicScore;
        }
        return stableTieKey(a).localeCompare(stableTieKey(b));
    });

    return enriched;
}

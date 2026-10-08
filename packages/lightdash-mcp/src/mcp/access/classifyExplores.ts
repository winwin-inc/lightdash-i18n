export type ExploreAccessItem = {
    name: string;
    label: string;
    groupLabel: string | null;
};

export type ClassifiedExplores = {
    queryable: ExploreAccessItem[];
    metadataOnly: ExploreAccessItem[];
    attributeDenied: ExploreAccessItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

export function toExploreAccessItem(value: unknown): ExploreAccessItem | null {
    const row = asRecord(value);
    if (!row) {
        return null;
    }
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (name.length === 0) {
        return null;
    }
    const label =
        typeof row.label === 'string' && row.label.trim().length > 0
            ? row.label
            : name;
    const groupLabel =
        typeof row.groupLabel === 'string' && row.groupLabel.trim().length > 0
            ? row.groupLabel
            : null;
    return { name, label, groupLabel };
}

export function collectExploreAccessItems(value: unknown): ExploreAccessItem[] {
    if (Array.isArray(value)) {
        return value
            .map(toExploreAccessItem)
            .filter((item): item is ExploreAccessItem => item !== null);
    }
    const row = asRecord(value);
    if (row && Array.isArray(row.data)) {
        return collectExploreAccessItems(row.data);
    }
    return [];
}

function sortExploreItems(items: ExploreAccessItem[]): ExploreAccessItem[] {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export function classifyExplores(
    explores: ExploreAccessItem[],
    catalog: ExploreAccessItem[],
    runMetricQuery: boolean,
): ClassifiedExplores {
    const catalogByName = new Map(
        catalog.map((item) => [item.name, item] as const),
    );
    const queryable: ExploreAccessItem[] = [];
    const metadataOnly: ExploreAccessItem[] = [];
    catalogByName.forEach((item) => {
        if (runMetricQuery) {
            queryable.push(item);
        } else {
            metadataOnly.push(item);
        }
    });
    const attributeDenied = explores.filter(
        (item) => !catalogByName.has(item.name),
    );
    return {
        queryable: sortExploreItems(queryable),
        metadataOnly: sortExploreItems(metadataOnly),
        attributeDenied: sortExploreItems(attributeDenied),
    };
}

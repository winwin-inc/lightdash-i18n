/**
 * Pure helpers to classify the explores of a project into the ones the user
 * can query, the ones where only metadata is visible, and the ones that are
 * hidden because the user does not have the required user attributes.
 *
 * Ported from `packages/lightdash-mcp/src/mcp/access/classifyExplores.ts`.
 */

export type ExploreAccessItem = {
    name: string;
    label: string;
    groupLabel: string | null;
};

export type ClassifiedExplores = {
    /** Explores the user is allowed to query. */
    queryable: ExploreAccessItem[];
    /** Explores where only the metadata is visible to the user. */
    metadataOnly: ExploreAccessItem[];
    /** Explores hidden by user attribute restrictions. */
    attributeDenied: ExploreAccessItem[];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

/**
 * Converts an arbitrary object into an explore access item, `null` when the
 * object does not describe an explore.
 */
export const toExploreAccessItem = (
    value: unknown,
): ExploreAccessItem | null => {
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
};

/**
 * Converts a list of arbitrary objects into explore access items.
 */
export const collectExploreAccessItems = (
    value: unknown,
): ExploreAccessItem[] => {
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
};

const sortExploreItems = (items: ExploreAccessItem[]): ExploreAccessItem[] =>
    [...items].sort((left, right) => left.name.localeCompare(right.name));

/**
 * Classifies the explores of a project.
 *
 * @param explores the explores that are hidden from the user (for example by
 * user attribute restrictions)
 * @param catalog the catalog tables that are visible to the user
 * @param runMetricQuery whether the user is allowed to run metric queries
 */
export const classifyExplores = (
    explores: ExploreAccessItem[],
    catalog: ExploreAccessItem[],
    runMetricQuery: boolean,
): ClassifiedExplores => {
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
};

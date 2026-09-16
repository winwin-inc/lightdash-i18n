import { getItemId } from '@lightdash/common';

export function normalizeAlias(input: string): string {
    return input.trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function hasDashboardSlugReference(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return (
        value.includes('lightdash.user.dashboardSlug') ||
        value.includes('dashboardSlug')
    );
}

export function exploreRequiresDashboardContext(explore: unknown): boolean {
    const root = asRecord(explore);
    const baseTable = root?.baseTable;
    const tables = asRecord(root?.tables);
    if (typeof baseTable !== 'string' || !tables) return false;
    const table = asRecord(tables[baseTable]);
    if (!table) return false;
    return (
        hasDashboardSlugReference(table.sqlWhere) ||
        hasDashboardSlugReference(table.uncompiledSqlWhere)
    );
}

export function createFieldIdResolverFromExplore(
    explore: unknown,
    exploreName: string,
): (field: string) => string {
    const aliases = new Map<string, string>();
    const addAlias = (alias: string | undefined, fieldId: string): void => {
        if (!alias) return;
        const key = normalizeAlias(alias);
        if (key.length === 0) return;
        if (!aliases.has(key)) aliases.set(key, fieldId);
    };

    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;
        const tableName =
            typeof obj.table === 'string'
                ? obj.table
                : typeof obj.tableName === 'string'
                  ? obj.tableName
                  : undefined;
        const fallbackFieldId =
            tableName && typeof obj.name === 'string'
                ? getItemId({ table: tableName, name: obj.name })
                : undefined;
        const fieldId =
            typeof obj.fieldId === 'string' ? obj.fieldId : fallbackFieldId;
        if (fieldId) {
            addAlias(fieldId, fieldId);
            if (fieldId.startsWith(`${exploreName}_`)) {
                addAlias(fieldId.slice(exploreName.length + 1), fieldId);
            }
            addAlias(
                typeof obj.name === 'string' ? obj.name : undefined,
                fieldId,
            );
            addAlias(
                typeof obj.label === 'string' ? obj.label : undefined,
                fieldId,
            );
        }
        Object.values(obj).forEach(walk);
    };
    walk(explore);

    return (field: string): string => {
        const direct = aliases.get(normalizeAlias(field));
        if (direct) return direct;
        const prefixed = aliases.get(
            normalizeAlias(`${exploreName}_${field}`),
        );
        if (prefixed) return prefixed;
        return field;
    };
}

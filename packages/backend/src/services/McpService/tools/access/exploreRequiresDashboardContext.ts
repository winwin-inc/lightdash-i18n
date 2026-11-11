import type { Explore } from '@lightdash/common';

/**
 * v1（packages/lightdash-mcp fieldIdResolver.exploreRequiresDashboardContext）
 * 对齐移植：explore 基表的 sql_where 引用了看板 slug（dbt `sql_filter` 行级
 * 权限）时，查询必须携带看板上下文（dashboardUuid/slug/name），否则行级
 * 过滤会按缺省口径（NA）跳过。
 */
function hasDashboardSlugReference(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return (
        value.includes('lightdash.user.dashboardSlug') ||
        value.includes('dashboardSlug')
    );
}

export function exploreRequiresDashboardContext(
    explore: Explore | undefined,
): boolean {
    if (!explore || !explore.baseTable) return false;
    const tables = explore.tables as Record<
        string,
        { sqlWhere?: unknown; uncompiledSqlWhere?: unknown } | undefined
    >;
    const table = tables?.[explore.baseTable];
    if (!table) return false;
    return (
        hasDashboardSlugReference(table.sqlWhere) ||
        hasDashboardSlugReference(table.uncompiledSqlWhere)
    );
}

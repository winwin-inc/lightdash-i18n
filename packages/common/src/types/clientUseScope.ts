/**
 * 客户使用模式（client-use）下受限角色（viewer / interactive_viewer）的可见内容范围。
 *
 * 全部由「看板白名单」（Admin RPC `findAllDashboardByMobile`）反推得到：
 * - `dashboardUuids`: 白名单内的看板
 * - `chartUuids`: 白名单看板磁贴引用的图表（dbt 图表 + SQL 图表）
 * - `spaceUuids`: 上述看板 / 图表所属的空间（已归一到根空间）
 * - `exploreNames`: 上述看板磁贴图表使用的数据集（ad-hoc 查询口径）
 *
 * 语义：数组为空表示该维度没有任何可见内容（fail-closed，不可回退到公开空间）。
 */
export type ViewerContentScope = {
    dashboardUuids: string[];
    chartUuids: string[];
    spaceUuids: string[];
    exploreNames: string[];
};

/**
 * Minimal user shape required to resolve the client-use allow-list
 * (the mobile number is derived from the email).
 */
export type ViewerContentScopeUser = {
    userUuid: string;
    email: string | undefined;
};

/**
 * Resolves the visible content scope of a user in a project.
 * Implemented by the dashboard service; injected into services that cannot
 * depend on it (to avoid a circular dependency).
 */
export type ViewerContentScopeResolver = {
    getViewerContentScope: (
        user: ViewerContentScopeUser,
        projectUuid: string,
    ) => Promise<ViewerContentScope | undefined>;
};

/**
 * 客户使用模式（client-use）下受限角色（viewer / interactive_viewer）的可见内容范围。
 *
 * 全部由「看板白名单」（Admin RPC `findAllDashboardByMobile`）反推得到：
 * - `dashboardUuids`: 白名单内的看板
 * - `chartUuids`: 白名单看板磁贴引用的图表（dbt 图表 + SQL 图表）
 * - `spaceUuids`: 持有可见内容的空间（上述看板 / 图表所属空间）∪ 这些空间的所有祖先
 *   （「可见内容 + 祖先」口径，保证嵌套空间树可导航）
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

/**
 * Why the client-use allow-list is (not) applied to a user in a project.
 *
 * - `not_client_use`: the project is not in client-use mode → no filtering
 * - `role_not_restricted`: the effective project role is not
 *   viewer / interactive_viewer → no filtering
 * - `user_not_found`: the user has no row in the `users` table
 * - `no_email`: the user has no email → the mobile number cannot be derived
 * - `rpc_not_configured`: `ADMIN_API_HOST` / `ADMIN_API_KEY` are missing
 * - `rpc_error`: the Admin RPC call failed (fail-closed: nothing is visible)
 * - `rpc_empty`: the RPC answered but the mobile has no dashboard in this project
 * - `rpc_ok`: the RPC answered with at least one dashboard
 */
export type ViewerContentScopeStatus =
    | 'not_client_use'
    | 'role_not_restricted'
    | 'user_not_found'
    | 'no_email'
    | 'rpc_not_configured'
    | 'rpc_error'
    | 'rpc_empty'
    | 'rpc_ok';

/**
 * Where the effective project role comes from.
 * Project level wins over organization level (see docs/client-use-viewer-content-scope.md).
 */
export type ViewerProjectRoleSource =
    | 'project_membership'
    | 'group_membership'
    | 'organization'
    | 'none';

/**
 * Diagnostic payload of the client-use content scope.
 *
 * It exists to answer "why can this user not see any dashboard?":
 * is the allow-list empty, did the RPC fail, is the role wrong,
 * or is the user simply not a restricted role?
 */
export type ViewerContentScopeDiagnostics = {
    projectUuid: string;
    /** `projects.is_client_use` */
    clientUseEnabled: boolean;
    /** `ADMIN_API_HOST` + `ADMIN_API_KEY` are both configured */
    rpcConfigured: boolean;
    /** Effective project role (project membership > group > organization) */
    effectiveProjectRole: string | null;
    roleSource: ViewerProjectRoleSource;
    /** The allow-list / content scope applies to this user */
    scopeApplied: boolean;
    status: ViewerContentScopeStatus;
    /** Human readable explanation (Chinese, for support) */
    reason: string;
    /** Mobile number derived from the user email (`local part`) */
    mobile: string | null;
    /** Dashboards returned by the Admin RPC for this project */
    allowedDashboardCount: number;
    allowedDashboardUuids: string[];
    /** Name of the allow-listed dashboards, when they can be resolved */
    allowedDashboardNames: string[];
    /** Size of the derived content scope (null when the scope does not apply) */
    scopeCounts: {
        dashboards: number;
        charts: number;
        spaces: number;
        explores: number;
    } | null;
};

export type ApiMyContentScopeResponse = {
    status: 'ok';
    results: ViewerContentScopeDiagnostics;
};

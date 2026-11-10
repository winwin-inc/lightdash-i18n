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
    /** 客户使用模式白名单是否对当前用户生效（来自
     *  DashboardService.getViewerContentScopeDiagnostics，即
     *  GET /api/v1/user?projectUuid= 的 clientUse 诊断）。
     *  未知（null）时调用方必须按非受控中性口径出文案。 */
    scope: ExploreScopeInfo;
};

/** 客户使用模式（client-use）白名单是否对当前令牌生效（v1 对齐移植） */
export type ExploreScopeInfo = {
    /** true = 白名单生效（受控角色）；false = 不生效；null = 未知 */
    scopeApplied: boolean | null;
    /** 后端诊断状态（rpc_error / no_email / …），未知为 null */
    clientUseStatus: string | null;
};

export function unknownExploreScope(): ExploreScopeInfo {
    return { scopeApplied: null, clientUseStatus: null };
}

/** 白名单生效：受控角色（客户使用模式 + viewer / interactive_viewer） */
export function isRestrictedScope(scope: ExploreScopeInfo): boolean {
    return scope.scopeApplied === true;
}

/**
 * 白名单因为「取不到授权数据」而不是「没开通」被清空的状态。
 *
 * 只列后端真正会返回 `uuids = new Set()`（fail-closed，`scopeApplied = true`）的状态：
 * - `rpc_error`：Admin RPC 调用失败；
 * - `no_email`：用户没有邮箱（取不到手机号）。
 *
 * 不列 `rpc_not_configured` / `user_not_found`：后端这两态返回 `uuids = undefined`
 * （fail-open、不收窄），不会走到「看不到表」。
 * 判据见 DashboardService.fetchAllowedDashboardUuids。
 */
const SCOPE_UNAVAILABLE_STATUSES = new Set(['rpc_error', 'no_email']);

export function isScopeAuthorizationUnavailable(
    scope: ExploreScopeInfo,
): boolean {
    return (
        scope.scopeApplied === true &&
        scope.clientUseStatus !== null &&
        SCOPE_UNAVAILABLE_STATUSES.has(scope.clientUseStatus)
    );
}

/**
 * 把 clientUse 诊断（ViewerContentScopeDiagnostics）压成分流用的 scope 信息。
 *
 * 诊断缺失 / 形状异常时返回「未知」（两个字段都是 null），调用方必须按
 * 中性口径出文案，不得断言「不是权限问题」。
 */
export function toExploreScopeInfo(clientUse: unknown): ExploreScopeInfo {
    if (
        !clientUse ||
        typeof clientUse !== 'object' ||
        Array.isArray(clientUse)
    ) {
        return unknownExploreScope();
    }
    const row = clientUse as Record<string, unknown>;
    return {
        scopeApplied:
            typeof row.scopeApplied === 'boolean' ? row.scopeApplied : null,
        clientUseStatus: typeof row.status === 'string' ? row.status : null,
    };
}

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
    scope: ExploreScopeInfo = unknownExploreScope(),
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
        scope,
    };
};

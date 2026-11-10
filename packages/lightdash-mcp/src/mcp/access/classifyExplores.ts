export type ExploreAccessItem = {
    name: string;
    label: string;
    groupLabel: string | null;
};

/**
 * 客户使用模式（client-use）白名单是否对当前令牌生效。
 *
 * 来自 `GET /api/v1/user?projectUuid=` 的 `clientUse` 诊断
 * （`ViewerContentScopeDiagnostics`，见 packages/common/src/types/clientUseScope.ts）。
 * 后端未升级 / 字段缺失时为 `null`（未知，按非受控口径输出文案）。
 *
 * 用途：受控角色（viewer / interactive_viewer + 项目已开客户使用模式）查不到表时
 * 是「没授权」，非受控角色查不到表时是「没权限 / 没索引」，两者文案不同。
 */
export type ExploreScopeInfo = {
    /** true = 白名单生效（受控角色）；false = 未生效；null = 无法判断 */
    scopeApplied: boolean | null;
    /** `ViewerContentScopeStatus`，用于区分「没授权」与「授权服务故障」 */
    clientUseStatus: string | null;
};

export type ClassifiedExplores = {
    queryable: ExploreAccessItem[];
    metadataOnly: ExploreAccessItem[];
    /**
     * 在项目已选表里、但不在当前可见目录里。原因可能是用户属性限制，
     * 也可能是客户使用模式白名单没开通这张表所在的看板。
     */
    attributeDenied: ExploreAccessItem[];
    scope: ExploreScopeInfo;
};

/** 「看不见的原因」未知（后端未返回 clientUse 诊断） */
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
 * （fail-open、不收窄），不会走到「看不到表」，写进来只会变成死分支。
 * 判据见 packages/backend/src/services/DashboardService/DashboardService.ts
 * `fetchAllowedDashboardUuids`。
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
 * 把 `GET /api/v1/user?projectUuid=` 的 `clientUse` 诊断压成分流用的 scope 信息。
 *
 * 后端未升级 / 未带 projectUuid 时返回「未知」（两个字段都是 null），
 * 调用方必须按中性口径出文案，不得断言「不是权限问题」。
 */
export function toExploreScopeInfo(clientUse: unknown): ExploreScopeInfo {
    if (!clientUse || typeof clientUse !== 'object' || Array.isArray(clientUse)) {
        return unknownExploreScope();
    }
    const row = clientUse as Record<string, unknown>;
    return {
        scopeApplied:
            typeof row.scopeApplied === 'boolean' ? row.scopeApplied : null,
        clientUseStatus: typeof row.status === 'string' ? row.status : null,
    };
}

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
    scope: ExploreScopeInfo = unknownExploreScope(),
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
        scope,
    };
}

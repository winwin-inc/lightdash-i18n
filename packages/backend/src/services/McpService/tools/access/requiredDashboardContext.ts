import {
    ForbiddenError,
    LightdashError,
    NotFoundError,
    type DashboardQueryContext,
    type SessionUser,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDeps } from '../deps';
import type { McpToolContext } from '../types';

/**
 * 强制看板模式（MCP_DASHBOARD_STRICT=true）的唯一入口（v1 进程内移植）。
 *
 * v1（packages/lightdash-mcp/src/lib/requiredDashboardContext.ts）对齐移植：
 * 判定流程与全部文案逐行一致。差异仅在数据获取方式 —— 不再走 HTTP 与
 * API key，tools 直接调 service（见 deps.ts 的约定）：
 *  - v1 resolver.fetchContexts → deps.dashboardService.getDashboardContexts
 *    （includePrivate=true，排序与 v1 resolver 相同）；
 *  - v1 api.getDashboard 预检 → deps.dashboardService.getByIdOrSlug（该
 *    service 会写浏览记录，与 v1 的 GET /api/v1/dashboards/{uuid} 一致，
 *    因此仅「显式 uuid 未命中关联候选」的兜底预检才调它）。
 *
 * 所有会执行查询的工具在严格模式下都必须先拿到一个"已验证"的 dashboardUuid：
 *  - 显式传入的 dashboardUuid：先反查关联看板集合确认归属（文档 §4.4）；
 *    命中就直接用候选信息，不调 getByIdOrSlug；未命中才调它区分
 *    403 / 404 / 未关联（文档 §4.2）；
 *  - 未显式传入：反查关联集合，1 个自动使用、多个要求选择、
 *    0 个按 associatedCount 分流（文档 §4.3）。
 *
 * 任何一条不满足都不执行查询，也不降级为 `NA`（fail-closed）。
 */

export type DashboardGuardStatus =
    | 'dashboard_permission_required'
    | 'dashboard_configuration_required'
    | 'dashboard_selection_required'
    | 'dashboard_not_found'
    | 'dashboard_context_unavailable';

export type DashboardGuardContext = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    dashboardUrl: string;
    source:
        | 'explicitDashboardUuid'
        | 'uniqueExploreContext'
        | 'uniqueChartContext';
    candidateCount: number;
};

export type DashboardGuardResult =
    | { ok: true; context: DashboardGuardContext }
    | { ok: false; status: DashboardGuardStatus; result: CallToolResult };

/** 自动解析到唯一看板时的提示（工具侧回显给 agent） */
export const DASHBOARD_AUTO_RESOLVED_HINT =
    '对外查询建议每次显式传 dashboardUuid 以固定行级口径。';

/** parseConfig 的缺省联系文案（MCP_DASHBOARD_CONTACT） */
export const DEFAULT_DASHBOARD_CONTACT = '请联系客服开通看板访问权限。';

/** 候选看板（选择 / 未命中时的回显，不含 tiles / filters 等看板内容） */
export type DashboardCandidate = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    /** 浏览器可打开的看板链接（siteUrl 拼接） */
    dashboardUrl?: string;
};

type GuardPayload = Record<string, unknown>;

type DashboardSummary = {
    uuid: string;
    slug: string;
    name: string;
    projectUuid: string;
};

/** 反查缓存条目（对齐 v1 dashboardContextResolver 的 60s 缓存） */
type ContextCacheEntry = {
    expiresAt: number;
    contexts: DashboardQueryContext[];
    associatedCount: number | undefined;
};

type PreflightEntry = {
    expiresAt: number;
    dashboard: DashboardSummary;
};

/**
 * 反查关联看板缓存：按 (userUuid, projectUuid, filters) 缓存 60s。
 *
 * v1 缓存键里的凭证指纹 / userAttributesHeader 是 HTTP 侧多 token、
 * 管理员代查用的；v2 进程内每次都以当前 user 直查 service，键只需
 * 用户 + 项目 + 过滤条件。
 */
const CONTEXT_CACHE_TTL_MS = 60_000;
const contextCache = new Map<string, ContextCacheEntry>();

/**
 * 预检缓存：按 (userUuid, dashboardUuid) 缓存 60s（文档 §4.2.1）。
 *
 * 只用于「显式 uuid 未命中关联候选」后的兜底预检
 * （getByIdOrSlug 会写浏览记录，命中候选的正常路径不调它）。
 */
const PREFLIGHT_CACHE_TTL_MS = 60_000;
const preflightCache = new Map<string, PreflightEntry>();

/**
 * 模块级登记的文案 / 站点根地址。
 *
 * `createRequiredDashboardGuard` 初始化时写入，供独立调用的
 * `formatDashboardAccessError` 使用（它拿不到 deps）。
 */
let registeredContact: string | undefined;
let registeredPublicBaseUrl: string | undefined;

/** 仅测试用：清空两份缓存与登记的文案 */
export function resetRequiredDashboardContextForTests(): void {
    contextCache.clear();
    preflightCache.clear();
    registeredContact = undefined;
    registeredPublicBaseUrl = undefined;
}

function toCallToolResult(
    payload: GuardPayload,
    isError: boolean,
): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        ...(isError ? { isError: true } : {}),
    };
}

function trimSlash(s: string): string {
    return s.replace(/\/$/, '');
}

/** 看板浏览器链接：{siteUrl}/projects/{projectUuid}/dashboards/{uuid}/view */
function buildDashboardWebUrl(params: {
    publicBaseUrl: string;
    projectUuid: string;
    dashboardUuid: string;
}): string {
    const path = `/projects/${encodeURIComponent(
        params.projectUuid,
    )}/dashboards/${encodeURIComponent(params.dashboardUuid)}/view`;
    return `${trimSlash(params.publicBaseUrl)}${path}`;
}

function buildDashboardUrl(
    publicBaseUrl: string | undefined,
    projectUuid: string | null,
    dashboardUuid: string | null,
): string | null {
    // projectUuid 缺失时不能拼出 /projects//dashboards/... 这种坏链接
    if (!publicBaseUrl || !projectUuid || !dashboardUuid) {
        return null;
    }
    return buildDashboardWebUrl({
        publicBaseUrl,
        projectUuid,
        dashboardUuid,
    });
}

function buildPermissionRequiredPayload(params: {
    message: string;
    dashboardUuid: string | null;
    dashboardUrl: string | null;
    contact: string;
    hint: string;
    associatedCount?: number;
    detail?: string;
}): GuardPayload {
    const payload: GuardPayload = {
        status: 'dashboard_permission_required',
        action: 'request_dashboard_access',
        message: params.message,
        dashboardUuid: params.dashboardUuid,
        dashboardUrl: params.dashboardUrl,
        contact: params.contact,
        hint: params.hint,
    };
    if (params.associatedCount !== undefined) {
        payload.associatedCount = params.associatedCount;
    }
    if (params.detail !== undefined) {
        payload.detail = params.detail;
    }
    return payload;
}

function buildConfigurationRequiredPayload(params: {
    source: 'chartUuid' | 'exploreName';
    exploreName: string | undefined;
    chartUuid: string | undefined;
    associatedCount: number;
    contact: string;
}): GuardPayload {
    // 「配置问题」：读者是管理员（客户只会被告知联系客服），
    // 必须能直接动手 → 挂到看板 + 约 60 秒生效 + 如何重试。
    // 面向调用方只讲"没绑定看板、需要先绑定"，不提内部开关概念。
    const subject =
        params.exploreName !== undefined
            ? `「${params.exploreName}」还没有绑定任何看板`
            : '该图表还没有绑定任何看板';
    return {
        status: 'dashboard_configuration_required',
        action: 'configure_dashboard',
        message: `${subject}，需要先绑定看板才能查询。`,
        source: params.source,
        exploreName: params.exploreName ?? null,
        chartUuid: params.chartUuid ?? null,
        associatedCount: params.associatedCount,
        contact: params.contact,
        hint: [
            '下一步（管理员）：把该数据集挂到一个看板上并确认空间 / 看板授权，约 60 秒内生效，然后带 dashboardUuid 重试。',
            '下一步（客户）：请联系客服开通权限。',
        ].join('\n'),
    };
}

function buildSelectionRequiredPayload(params: {
    source: 'chartUuid' | 'exploreName';
    exploreName: string | undefined;
    chartUuid: string | undefined;
    candidates: DashboardCandidate[];
}): GuardPayload {
    return {
        status: 'dashboard_selection_required',
        action: 'select_dashboard',
        message:
            params.exploreName !== undefined
                ? `「${params.exploreName}」关联了多个看板，请选一个后重试。`
                : '该图表存在于多个看板，请选一个后重试。',
        source: params.source,
        exploreName: params.exploreName ?? null,
        chartUuid: params.chartUuid ?? null,
        candidateCount: params.candidates.length,
        candidates: params.candidates,
        hint: `下一步：把选中看板的 dashboardUuid 传回来。${DASHBOARD_AUTO_RESOLVED_HINT}`,
    };
}

function buildNotFoundPayload(params: {
    dashboardUuid: string | null;
    dashboardUrl: string | null;
    contact: string;
    candidates?: DashboardCandidate[];
    detail?: string;
}): GuardPayload {
    const payload: GuardPayload = {
        status: 'dashboard_not_found',
        action: 'verify_dashboard_uuid',
        message: '没有找到这个看板，或它不属于当前项目。',
        dashboardUuid: params.dashboardUuid,
        dashboardUrl: params.dashboardUrl,
        contact: params.contact,
        hint:
            params.candidates && params.candidates.length > 0
                ? '下一步：从下面候选中选一个已绑定的看板（或先用 list_dashboards / find_dashboards 查找）。'
                : '下一步：先确认看板是否属于当前项目，可用 list_dashboards / find_dashboards 查找后重试。',
    };
    if (params.candidates) {
        payload.candidates = params.candidates;
    }
    if (params.detail !== undefined) {
        payload.detail = params.detail;
    }
    return payload;
}

function buildContextUnavailablePayload(params: {
    message?: string;
    hint?: string;
    detail?: string;
}): GuardPayload {
    const payload: GuardPayload = {
        status: 'dashboard_context_unavailable',
        action: 'retry_later',
        message:
            params.message ??
            '暂时无法确认看板信息，本次查询已停止（网络或服务临时故障）。',
        hint: params.hint ?? '下一步：稍后重试；持续失败请联系客服。',
    };
    if (params.detail !== undefined) {
        payload.detail = params.detail;
    }
    return payload;
}

function errorDetail(error: unknown): string | undefined {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return undefined;
}

/**
 * 进程内异常的 detail：后端抛出的 LightdashError 没有 detail 字段，
 * 统一落到 message（对齐 v1 的 `(e as ApiError).detail ?? e.message`）。
 */
function getLightdashErrorDetail(error: LightdashError): string {
    return (error as LightdashError & { detail?: string }).detail ??
        error.message;
}

/** 看板类错误在 MCP 层的统一状态（与文档 §9 的状态枚举一致） */
type DashboardApiErrorKind =
    | 'dashboard_permission_required'
    | 'dashboard_not_found';

/** 403：看板归属口径不可信（跨项目 / 行级过滤无法应用） */
const DASHBOARD_NOT_FOUND_403_PATTERNS = [
    'dashboard does not belong to project',
    'row level security filter cannot be applied',
];

/** 403：看板 / 空间 / client-use 白名单权限不足 */
const DASHBOARD_PERMISSION_403_PATTERNS = [
    'contact your administrator to configure dashboard access permissions',
    'access to the space this dashboard belongs to',
    'access to this dashboard',
];

/**
 * 把进程内异常（LightdashError 的 statusCode + message）映射成看板类
 * 状态；不是看板类错误时返回 null。文案 pattern 与 v1 的
 * getDashboardErrorKind 完全一致（DashboardService 的报错文案不变）。
 */
function getDashboardErrorKind(error: unknown): DashboardApiErrorKind | null {
    if (!(error instanceof LightdashError)) {
        return null;
    }
    const detail = error.message.toLowerCase();
    if (error.statusCode === 403) {
        if (
            DASHBOARD_NOT_FOUND_403_PATTERNS.some((pattern) =>
                detail.includes(pattern),
            )
        ) {
            return 'dashboard_not_found';
        }
        if (
            DASHBOARD_PERMISSION_403_PATTERNS.some((pattern) =>
                detail.includes(pattern),
            )
        ) {
            return 'dashboard_permission_required';
        }
        return null;
    }
    if (error.statusCode === 404) {
        if (
            detail.includes('dashboard not found') ||
            detail.includes('dashboard does not belong to project')
        ) {
            return 'dashboard_not_found';
        }
        return null;
    }
    return null;
}

export interface RequiredDashboardGuard {
    /**
     * 校验并解析强制看板模式所需的 dashboardUuid。
     *
     * 与 v1 的差异：ensure 第一参是 McpToolContext（进程内没有 API key，
     * 以当前 user 直查 service，缓存键也用 userUuid）。
     */
    ensure(
        context: McpToolContext,
        params: {
            projectUuid: string;
            dashboardUuid?: string;
            chartUuid?: string;
            exploreName?: string;
        },
    ): Promise<DashboardGuardResult>;
}

export function createRequiredDashboardGuard(
    deps: McpToolDeps,
): RequiredDashboardGuard {
    registeredContact = deps.lightdashConfig.mcp.dashboardContact;
    registeredPublicBaseUrl = deps.lightdashConfig.siteUrl;

    const { siteUrl: publicBaseUrl, mcp } = deps.lightdashConfig;
    const contact = mcp.dashboardContact;

    function dashboardUrl(
        projectUuid: string,
        dashboardUuid: string | null,
    ): string | null {
        return buildDashboardUrl(publicBaseUrl, projectUuid, dashboardUuid);
    }

    function toCandidates(
        contexts: DashboardQueryContext[],
        projectUuid: string,
    ): DashboardCandidate[] {
        return contexts.map((context) => ({
            dashboardUuid: context.dashboardUuid,
            dashboardSlug: context.dashboardSlug,
            dashboardName: context.dashboardName,
            dashboardUrl:
                dashboardUrl(projectUuid, context.dashboardUuid) ?? undefined,
        }));
    }

    /**
     * 反查关联看板（带 60s 缓存，对齐 v1 dashboardContextResolver.fetchContexts）。
     *
     * DashboardService.getDashboardContexts 已按
     * name → slug → uuid 排序（与 v1 resolver 的排序一致），这里直接用。
     * associatedCount 恒为 number；保留 undefined 类型是为了维持
     * v1 的 fail-closed 分支（防御未来形状变化）。
     */
    async function fetchContexts(
        user: SessionUser,
        projectUuid: string,
        filters: { exploreName?: string; chartUuid?: string },
        fetchOptions?: { bypassCache?: boolean },
    ): Promise<{
        contexts: DashboardQueryContext[];
        associatedCount: number | undefined;
    }> {
        const cacheKey = [
            user.userUuid,
            projectUuid,
            filters.chartUuid ?? '',
            filters.exploreName ?? '',
        ].join('|');
        const now = Date.now();
        if (!fetchOptions?.bypassCache) {
            const cached = contextCache.get(cacheKey);
            if (cached && cached.expiresAt > now) {
                return {
                    contexts: cached.contexts,
                    associatedCount: cached.associatedCount,
                };
            }
        }
        const result = await deps.dashboardService.getDashboardContexts(
            user,
            projectUuid,
            filters,
            true,
        );
        contextCache.set(cacheKey, {
            contexts: result.contexts,
            associatedCount: result.associatedCount,
            expiresAt: now + CONTEXT_CACHE_TTL_MS,
        });
        return {
            contexts: result.contexts,
            associatedCount: result.associatedCount,
        };
    }

    /**
     * 反查关联看板（guard 语义层）。
     *
     * - 默认：命中缓存且为空时绕过缓存重查一次（阻断路径要立即生效）；
     * - `forceFresh`：直接绕过缓存查一次；
     * - `fresh` 标记返回的数据是否来自绕过缓存的请求（避免重复重查）。
     */
    async function fetchAssociated(
        user: SessionUser,
        projectUuid: string,
        filters: { exploreName?: string; chartUuid?: string },
        options?: { forceFresh?: boolean },
    ): Promise<
        | {
              ok: true;
              contexts: DashboardQueryContext[];
              associatedCount: number | undefined;
              /** 返回的数据是否来自绕过缓存的请求 */
              fresh: boolean;
          }
        | { ok: false; status: 'dashboard_context_unavailable'; detail?: string }
    > {
        const forceFresh = options?.forceFresh ?? false;
        try {
            const first = forceFresh
                ? await fetchContexts(user, projectUuid, filters, {
                      bypassCache: true,
                  })
                : await fetchContexts(user, projectUuid, filters);
            const emptyRetry =
                !forceFresh && first.contexts.length === 0
                    ? await fetchContexts(user, projectUuid, filters, {
                          bypassCache: true,
                      })
                    : undefined;
            const result = emptyRetry ?? first;
            return {
                ok: true,
                contexts: result.contexts,
                associatedCount: result.associatedCount,
                fresh: forceFresh || emptyRetry !== undefined,
            };
        } catch (error) {
            return {
                ok: false,
                status: 'dashboard_context_unavailable',
                detail: errorDetail(error),
            };
        }
    }

    /** 预检显式 dashboardUuid：返回看板摘要（不回显 tiles / filters 等看板内容） */
    async function preflightDashboard(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<
        | { ok: true; dashboard: DashboardSummary }
        | {
              ok: false;
              status:
                  | 'dashboard_permission_required'
                  | 'dashboard_not_found'
                  | 'dashboard_context_unavailable';
              detail?: string;
          }
    > {
        const cacheKey = `${user.userUuid}|${dashboardUuid}`;
        const now = Date.now();
        const cached = preflightCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return { ok: true, dashboard: cached.dashboard };
        }
        try {
            const dashboard = await deps.dashboardService.getByIdOrSlug(
                user,
                dashboardUuid,
                { projectUuid },
            );
            if (!dashboard.projectUuid) {
                // 响应形状异常（不是 404）：归 dashboard_context_unavailable
                return {
                    ok: false,
                    status: 'dashboard_context_unavailable',
                    detail: 'Dashboard project could not be verified',
                };
            }
            const summary: DashboardSummary = {
                uuid: dashboard.uuid,
                slug: dashboard.slug,
                name: dashboard.name,
                projectUuid: dashboard.projectUuid,
            };
            preflightCache.set(cacheKey, {
                dashboard: summary,
                expiresAt: now + PREFLIGHT_CACHE_TTL_MS,
            });
            return { ok: true, dashboard: summary };
        } catch (error) {
            if (error instanceof ForbiddenError) {
                return {
                    ok: false,
                    status: 'dashboard_permission_required',
                    detail: getLightdashErrorDetail(error),
                };
            }
            if (error instanceof NotFoundError) {
                return {
                    ok: false,
                    status: 'dashboard_not_found',
                    detail: getLightdashErrorDetail(error),
                };
            }
            return {
                ok: false,
                status: 'dashboard_context_unavailable',
                detail: errorDetail(error),
            };
        }
    }

    function failure(
        status: DashboardGuardStatus,
        payload: GuardPayload,
        isError = true,
    ): DashboardGuardResult {
        return {
            ok: false,
            status,
            result: toCallToolResult(payload, isError),
        };
    }

    async function ensure(
        context: McpToolContext,
        params: {
            projectUuid: string;
            dashboardUuid?: string;
            chartUuid?: string;
            exploreName?: string;
        },
    ): Promise<DashboardGuardResult> {
        const { user } = context;
        const { projectUuid, dashboardUuid, chartUuid, exploreName } = params;
        const source: 'chartUuid' | 'exploreName' = chartUuid
            ? 'chartUuid'
            : 'exploreName';

        if (dashboardUuid) {
            if (!chartUuid && !exploreName) {
                // 无法校验归属（反查至少要有一个入参）
                return failure(
                    'dashboard_context_unavailable',
                    buildContextUnavailablePayload({
                        message:
                            '需要提供 exploreName 或 chartUuid，才能确定本次查询对应的看板。',
                        hint: '请在工具参数里带上 exploreName 或 chartUuid 后重试。',
                    }),
                );
            }

            // §4.4：显式 uuid 必须属于该 explore / chart 的关联看板集合。
            // 先反查候选：命中则直接用候选的 slug / name，
            // 不调 getByIdOrSlug（该 service 会写浏览记录，见 S-9）。
            const association = await fetchAssociated(user, projectUuid, {
                chartUuid,
                exploreName,
            });
            if (!association.ok) {
                return failure(
                    'dashboard_context_unavailable',
                    buildContextUnavailablePayload({
                        detail: association.detail,
                    }),
                );
            }
            let candidates = toCandidates(association.contexts, projectUuid);
            let matched = candidates.find(
                (candidate) => candidate.dashboardUuid === dashboardUuid,
            );
            if (!matched && !association.fresh) {
                // 阻断路径：绕过缓存再查一次，避免刚挂好看板仍被判定为未关联
                const fresh = await fetchAssociated(
                    user,
                    projectUuid,
                    { chartUuid, exploreName },
                    { forceFresh: true },
                );
                if (fresh.ok) {
                    candidates = toCandidates(fresh.contexts, projectUuid);
                    matched = candidates.find(
                        (candidate) =>
                            candidate.dashboardUuid === dashboardUuid,
                    );
                    // fresh 的计数无条件覆盖旧值（看板可能刚被摘下）
                    association.associatedCount = fresh.associatedCount;
                }
            }

            if (matched) {
                // 命中关联候选：直接用候选信息，不调 getByIdOrSlug
                return {
                    ok: true,
                    context: {
                        dashboardUuid: matched.dashboardUuid,
                        dashboardSlug: matched.dashboardSlug,
                        dashboardName: matched.dashboardName,
                        dashboardUrl:
                            dashboardUrl(projectUuid, matched.dashboardUuid) ??
                            '',
                        source: 'explicitDashboardUuid',
                        candidateCount: candidates.length,
                    },
                };
            }

            const { associatedCount } = association;
            if (associatedCount === undefined) {
                // 后端未升级 → fail-closed（进程内不会发生，保留 v1 分支）
                return failure(
                    'dashboard_context_unavailable',
                    buildContextUnavailablePayload({
                        message:
                            '后端未返回关联看板数量，无法确认看板归属，已阻断本次查询。',
                        detail:
                            'associatedCount missing in /dashboards/context response',
                    }),
                );
            }
            if (associatedCount === 0) {
                // 该数据集在这个项目里没有挂任何看板 → 配置问题
                return failure(
                    'dashboard_configuration_required',
                    buildConfigurationRequiredPayload({
                        source,
                        exploreName,
                        chartUuid,
                        associatedCount,
                        contact,
                    }),
                );
            }

            // 有关联看板但当前 uuid 不在其中：调 getByIdOrSlug
            // 区分 403（无权限）/ 404（不存在或跨项目）/ 确实未关联。
            const preflight = await preflightDashboard(
                user,
                projectUuid,
                dashboardUuid,
            );
            if (!preflight.ok) {
                if (preflight.status === 'dashboard_permission_required') {
                    return failure(
                        'dashboard_permission_required',
                        buildPermissionRequiredPayload({
                            message: '您没有这张看板的访问权限。',
                            dashboardUuid,
                            dashboardUrl: dashboardUrl(
                                projectUuid,
                                dashboardUuid,
                            ),
                            contact,
                            hint: '下一步：请联系客服开通权限（可把看板链接发给客服）；开通后用同一个 dashboardUuid 重试。',
                            detail: preflight.detail,
                        }),
                    );
                }
                if (preflight.status === 'dashboard_not_found') {
                    return failure(
                        'dashboard_not_found',
                        buildNotFoundPayload({
                            dashboardUuid,
                            dashboardUrl: dashboardUrl(
                                projectUuid,
                                dashboardUuid,
                            ),
                            contact,
                            detail: preflight.detail,
                        }),
                    );
                }
                return failure(
                    'dashboard_context_unavailable',
                    buildContextUnavailablePayload({
                        detail: preflight.detail,
                    }),
                );
            }

            const { dashboard } = preflight;
            if (dashboard.projectUuid !== projectUuid) {
                // 跨项目：不得回显任何看板内容
                return failure(
                    'dashboard_not_found',
                    buildNotFoundPayload({
                        dashboardUuid,
                        dashboardUrl: dashboardUrl(projectUuid, dashboardUuid),
                        contact,
                        detail: 'Dashboard does not belong to project',
                    }),
                );
            }

            // slug 入参兼容：getByIdOrSlug 返回的 canonical uuid 再与候选比对一次
            const slugMatch = candidates.find(
                (candidate) => candidate.dashboardUuid === dashboard.uuid,
            );
            if (slugMatch) {
                return {
                    ok: true,
                    context: {
                        dashboardUuid: slugMatch.dashboardUuid,
                        dashboardSlug: slugMatch.dashboardSlug,
                        dashboardName: slugMatch.dashboardName,
                        dashboardUrl:
                            dashboardUrl(projectUuid, slugMatch.dashboardUuid) ??
                            '',
                        source: 'explicitDashboardUuid',
                        candidateCount: candidates.length,
                    },
                };
            }

            return failure(
                'dashboard_not_found',
                buildNotFoundPayload({
                    dashboardUuid,
                    dashboardUrl: dashboardUrl(projectUuid, dashboardUuid),
                    contact,
                    candidates,
                }),
            );
        }

        if (!chartUuid && !exploreName) {
            return failure(
                'dashboard_context_unavailable',
                buildContextUnavailablePayload({
                    message:
                        '需要提供 exploreName 或 chartUuid，才能确定本次查询对应的看板。',
                    hint: '请在工具参数里带上 exploreName 或 chartUuid 后重试。',
                }),
            );
        }

        const association = await fetchAssociated(user, projectUuid, {
            chartUuid,
            exploreName,
        });
        if (!association.ok) {
            return failure(
                'dashboard_context_unavailable',
                buildContextUnavailablePayload({
                    detail: association.detail,
                }),
            );
        }
        const candidates = toCandidates(association.contexts, projectUuid);
        const { associatedCount } = association;

        if (candidates.length === 1) {
            const [candidate] = candidates;
            return {
                ok: true,
                context: {
                    dashboardUuid: candidate.dashboardUuid,
                    dashboardSlug: candidate.dashboardSlug,
                    dashboardName: candidate.dashboardName,
                    dashboardUrl: candidate.dashboardUrl ?? '',
                    source: chartUuid
                        ? 'uniqueChartContext'
                        : 'uniqueExploreContext',
                    candidateCount: 1,
                },
            };
        }

        if (candidates.length > 1) {
            return failure(
                'dashboard_selection_required',
                buildSelectionRequiredPayload({
                    source,
                    exploreName,
                    chartUuid,
                    candidates,
                }),
                false,
            );
        }

        // 0 候选：按后端计数分流（§4.3）
        if (associatedCount === undefined) {
            return failure(
                'dashboard_context_unavailable',
                buildContextUnavailablePayload({
                    message:
                        '后端未返回关联看板数量，无法判断是“没配看板”还是“没有权限”，已阻断本次查询。',
                    detail:
                        'associatedCount missing in /dashboards/context response',
                }),
            );
        }
        if (associatedCount === 0) {
            return failure(
                'dashboard_configuration_required',
                buildConfigurationRequiredPayload({
                    source,
                    exploreName,
                    chartUuid,
                    associatedCount,
                    contact,
                }),
            );
        }
        return failure(
            'dashboard_permission_required',
            buildPermissionRequiredPayload({
                message: `该数据集关联了 ${associatedCount} 张看板，但你的账号看不到其中任何一张。`,
                dashboardUuid: null,
                dashboardUrl: null,
                contact,
                hint: '下一步：请联系客服开通权限；已开通仍看不到时，请管理员检查这些看板所在空间的访问权限。',
                associatedCount,
            }),
        );
    }

    return { ensure };
}

/**
 * 查询执行阶段的 403/404 防御性映射；返回 null 表示不是看板类错误。
 *
 * 调用方写法：
 * ```ts
 * const mapped = formatDashboardAccessError({ error, projectUuid, dashboardUuid });
 * if (mapped) return mapped;
 * ```
 */
export function formatDashboardAccessError(params: {
    error: unknown;
    /** 可能为空（例如看板不可访问时拿不到项目）：为空则不生成看板链接 */
    projectUuid: string | null;
    dashboardUuid: string | null;
}): CallToolResult | null {
    const kind = getDashboardErrorKind(params.error);
    if (kind === null) {
        return null;
    }
    const contact = registeredContact ?? DEFAULT_DASHBOARD_CONTACT;
    const publicBaseUrl = registeredPublicBaseUrl;
    const detail =
        params.error instanceof LightdashError
            ? getLightdashErrorDetail(params.error)
            : undefined;

    if (kind === 'dashboard_permission_required') {
        return toCallToolResult(
            buildPermissionRequiredPayload({
                message: '您没有该看板的访问权限。',
                dashboardUuid: params.dashboardUuid,
                dashboardUrl: buildDashboardUrl(
                    publicBaseUrl,
                    params.projectUuid,
                    params.dashboardUuid,
                ),
                contact,
                hint: '请将看板链接提供给客服申请开通；开通后用同一 dashboardUuid 重试。',
                detail,
            }),
            true,
        );
    }

    return toCallToolResult(
        buildNotFoundPayload({
            dashboardUuid: params.dashboardUuid,
            dashboardUrl: buildDashboardUrl(
                publicBaseUrl,
                params.projectUuid,
                params.dashboardUuid,
            ),
            contact,
            detail,
        }),
        true,
    );
}

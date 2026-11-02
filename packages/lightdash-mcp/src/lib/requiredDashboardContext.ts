/**
 * 强制看板模式（MCP_DASHBOARD_STRICT=true）的唯一入口。
 *
 * 所有会执行查询的工具在严格模式下都必须先拿到一个"已验证"的 dashboardUuid：
 *  - 显式传入的 dashboardUuid：先反查 `/dashboards/context` 确认它属于该
 *    explore / chart 的关联看板集合（文档 §4.4）；命中就直接用候选信息，
 *    不调用 `GET /api/v1/dashboards/{uuid}`（该接口会写浏览记录）；
 *    未命中才调该接口区分 403 / 404 / 未关联（文档 §4.2）；
 *  - 未显式传入：反查 `/dashboards/context`，1 个自动使用、多个要求选择、
 *    0 个按后端 `associatedCount` 分流（文档 §4.3）。
 *
 * 任何一条不满足都不执行查询，也不降级为 `NA`（fail-closed）。
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
    DEFAULT_DASHBOARD_CONTACT,
    type LightdashMcpEnvConfig,
} from '../config';
import { LightdashApiError, getDashboardErrorKind } from '../rest/requestBase';
import type { LightdashRestClient } from '../rest/lightdashRest';
import { buildDashboardWebUrl } from './contentWebUrls';
import {
    createDashboardCredentialFingerprint,
    type DashboardCandidate,
    type DashboardContextResolver,
} from './dashboardContextResolver';
import { getHttpRequestUserAttributesHeader } from './requestContext';

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

type GuardPayload = Record<string, unknown>;

type DashboardSummary = {
    uuid: string;
    slug: string;
    name: string;
    projectUuid: string;
};

type PreflightEntry = {
    expiresAt: number;
    dashboard: DashboardSummary;
};

/**
 * 预检缓存：按 (凭证指纹, dashboardUuid) 缓存 60s（文档 §4.2.1）。
 *
 * 只用于「显式 uuid 未命中关联候选」后的兜底预检
 * （`GET /dashboards/{uuid}` 会写浏览记录，命中候选的正常路径不调它）。
 */
const PREFLIGHT_CACHE_TTL_MS = 60_000;
const preflightCache = new Map<string, PreflightEntry>();

/**
 * 模块级登记的文案 / 站点根地址。
 *
 * `createRequiredDashboardGuard` 初始化时写入，供独立调用的
 * `formatDashboardAccessError` 使用（它拿不到 config）。
 */
let registeredContact: string | undefined;
let registeredPublicBaseUrl: string | undefined;

/** 仅测试用：清空预检缓存与登记的文案 */
export function resetRequiredDashboardContextForTests(): void {
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
        hint:
            params.hint ??
            '下一步：稍后重试；持续失败请联系客服。',
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

export function createRequiredDashboardGuard(
    api: LightdashRestClient,
    config: LightdashMcpEnvConfig,
    resolver: DashboardContextResolver,
) {
    registeredContact = config.dashboardContact;
    registeredPublicBaseUrl = config.publicBaseUrl;

    const { publicBaseUrl, dashboardContact: contact } = config;

    function dashboardUrl(
        projectUuid: string,
        dashboardUuid: string | null,
    ): string | null {
        return buildDashboardUrl(publicBaseUrl, projectUuid, dashboardUuid);
    }

    function toCandidates(
        candidates: DashboardCandidate[],
        projectUuid: string,
    ): DashboardCandidate[] {
        return candidates.map((candidate) => ({
            dashboardUuid: candidate.dashboardUuid,
            dashboardSlug: candidate.dashboardSlug,
            dashboardName: candidate.dashboardName,
            dashboardUrl:
                candidate.dashboardUrl ??
                dashboardUrl(projectUuid, candidate.dashboardUuid) ??
                undefined,
        }));
    }

    /** 预检显式 dashboardUuid：返回看板摘要（不回显 tiles / filters 等看板内容） */
    async function preflightDashboard(
        apiKey: string,
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
        const cacheKey = `${createDashboardCredentialFingerprint(
            apiKey,
            getHttpRequestUserAttributesHeader(),
        )}|${dashboardUuid}`;
        const now = Date.now();
        const cached = preflightCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return { ok: true, dashboard: cached.dashboard };
        }
        try {
            const raw = (await api.getDashboard(
                apiKey,
                dashboardUuid,
            )) as {
                uuid?: string;
                slug?: string;
                name?: string;
                projectUuid?: string;
            };
            const projectUuidOfDashboard =
                typeof raw.projectUuid === 'string' ? raw.projectUuid : undefined;
            if (!projectUuidOfDashboard) {
                // 响应形状异常（不是 404）：归 dashboard_context_unavailable
                return {
                    ok: false,
                    status: 'dashboard_context_unavailable',
                    detail: 'Dashboard project could not be verified',
                };
            }
            const dashboard: DashboardSummary = {
                uuid: raw.uuid ?? dashboardUuid,
                slug: raw.slug ?? dashboardUuid,
                name: raw.name ?? dashboardUuid,
                projectUuid: projectUuidOfDashboard,
            };
            preflightCache.set(cacheKey, {
                dashboard,
                expiresAt: now + PREFLIGHT_CACHE_TTL_MS,
            });
            return { ok: true, dashboard };
        } catch (error) {
            if (error instanceof LightdashApiError) {
                if (error.status === 403) {
                    return {
                        ok: false,
                        status: 'dashboard_permission_required',
                        detail: error.detail,
                    };
                }
                if (error.status === 404) {
                    return {
                        ok: false,
                        status: 'dashboard_not_found',
                        detail: error.detail,
                    };
                }
            }
            return {
                ok: false,
                status: 'dashboard_context_unavailable',
                detail: errorDetail(error),
            };
        }
    }

    /**
     * 反查关联看板。
     *
     * - 默认：命中缓存且为空时绕过缓存重查一次（阻断路径要立即生效）；
     * - `forceFresh`：直接绕过缓存查一次；
     * - `fresh` 标记返回的数据是否来自绕过缓存的请求（避免重复重查）。
     */
    async function fetchAssociated(
        apiKey: string,
        projectUuid: string,
        filters: { exploreName?: string; chartUuid?: string },
        options?: { forceFresh?: boolean },
    ): Promise<
        | {
              ok: true;
              contexts: DashboardCandidate[];
              associatedCount: number | undefined;
              /** 返回的数据是否来自绕过缓存的请求 */
              fresh: boolean;
          }
        | { ok: false; status: 'dashboard_context_unavailable'; detail?: string }
    > {
        const forceFresh = options?.forceFresh ?? false;
        try {
            const first = forceFresh
                ? await resolver.fetchContexts(
                      apiKey,
                      projectUuid,
                      filters,
                      { bypassCache: true },
                  )
                : await resolver.fetchContexts(apiKey, projectUuid, filters);
            const emptyRetry =
                !forceFresh && first.contexts.length === 0
                    ? await resolver.fetchContexts(
                          apiKey,
                          projectUuid,
                          filters,
                          { bypassCache: true },
                      )
                    : undefined;
            const result = emptyRetry ?? first;
            return {
                ok: true,
                contexts: result.contexts.map((context) => ({
                    dashboardUuid: context.dashboardUuid,
                    dashboardSlug: context.dashboardSlug,
                    dashboardName: context.dashboardName,
                })),
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

    async function ensure(params: {
        apiKey: string;
        projectUuid: string;
        dashboardUuid?: string;
        chartUuid?: string;
        exploreName?: string;
    }): Promise<DashboardGuardResult> {
        const { apiKey, projectUuid, dashboardUuid, chartUuid, exploreName } =
            params;
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
            // 不调用 GET /dashboards/{uuid}（该接口会写浏览记录，见 S-9）。
            const association = await fetchAssociated(apiKey, projectUuid, {
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
            let candidates = toCandidates(
                association.contexts,
                projectUuid,
            );
            let matched = candidates.find(
                (candidate) => candidate.dashboardUuid === dashboardUuid,
            );
            if (!matched && !association.fresh) {
                // 阻断路径：绕过缓存再查一次，避免刚挂好看板仍被判定为未关联
                const fresh = await fetchAssociated(
                    apiKey,
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
                // 命中关联候选：直接用候选信息，不发 GET /dashboards/{uuid}
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
                // 后端未升级 → fail-closed
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

            // 有关联看板但当前 uuid 不在其中：调 GET /dashboards/{uuid}
            // 区分 403（无权限）/ 404（不存在或跨项目）/ 确实未关联。
            const preflight = await preflightDashboard(apiKey, dashboardUuid);
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

            // slug 入参兼容：getDashboard 返回的 canonical uuid 再与候选比对一次
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

        const association = await fetchAssociated(apiKey, projectUuid, {
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
    /** 可选：MCP_DASHBOARD_CONTACT 文案（缺省用 guard 登记的 / 默认文案） */
    contact?: string;
    /** 可选：看板链接根地址（缺省用 guard 登记的 / 不生成链接） */
    publicBaseUrl?: string;
}): CallToolResult | null {
    const kind = getDashboardErrorKind(params.error);
    if (kind === null) {
        return null;
    }
    const contact =
        params.contact ?? registeredContact ?? DEFAULT_DASHBOARD_CONTACT;
    const publicBaseUrl = params.publicBaseUrl ?? registeredPublicBaseUrl;
    const detail =
        params.error instanceof LightdashApiError
            ? params.error.detail
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

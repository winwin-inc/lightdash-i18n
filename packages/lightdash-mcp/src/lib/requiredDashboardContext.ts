/**
 * 强制看板模式（MCP_DASHBOARD_STRICT=true）的唯一入口。
 *
 * 所有会执行查询的工具在严格模式下都必须先拿到一个"已验证"的 dashboardUuid：
 *  - 显式传入的 dashboardUuid：预检 `GET /api/v1/dashboards/{uuid}`（含项目归属），
 *    并且必须属于该 explore / chart 的关联看板集合（文档 §4.2 / §4.4）；
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

/** 预检缓存：按 (凭证指纹, dashboardUuid) 缓存 60s（文档 §4.2.1） */
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
    projectUuid: string,
    dashboardUuid: string | null,
): string | null {
    if (!publicBaseUrl || !dashboardUuid) {
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
    return {
        status: 'dashboard_configuration_required',
        action: 'configure_dashboard',
        message:
            '该数据集未配置看板，对外客户无法查询（必须配置看板后对外可用）。',
        source: params.source,
        exploreName: params.exploreName ?? null,
        chartUuid: params.chartUuid ?? null,
        associatedCount: params.associatedCount,
        contact: params.contact,
        hint: '管理员：请把该数据集挂到看板并授权后重试，或显式传入已绑定看板的 dashboardUuid。客户：请联系客服确认该数据集是否开放。',
        note: '该限制仅在 MCP_DASHBOARD_STRICT=true 时生效。',
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
            '未提供 dashboardUuid，且该数据集关联多个看板。请选择后重试。',
        source: params.source,
        exploreName: params.exploreName ?? null,
        chartUuid: params.chartUuid ?? null,
        candidateCount: params.candidates.length,
        candidates: params.candidates,
        hint: DASHBOARD_AUTO_RESOLVED_HINT,
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
        message: '未找到该看板，或它不属于当前项目。',
        dashboardUuid: params.dashboardUuid,
        dashboardUrl: params.dashboardUrl,
        contact: params.contact,
        hint: params.candidates && params.candidates.length > 0
            ? '请确认 dashboardUuid 是否正确，或从下方候选看板中选择。'
            : '请确认 dashboardUuid 是否正确（可先用 list_dashboards / find_dashboards 查找可用看板）。',
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
            '暂时无法确认看板上下文，已阻断本次查询，请稍后重试。',
        hint:
            params.hint ??
            '这是临时故障（看板上下文不可用），重试即可；若持续失败请联系客服。',
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
                // 无法确认归属 → fail-closed
                return {
                    ok: false,
                    status: 'dashboard_not_found',
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

    /** 反查关联看板；阻断路径（0 候选）会绕过缓存再查一次 */
    async function fetchAssociated(
        apiKey: string,
        projectUuid: string,
        filters: { exploreName?: string; chartUuid?: string },
        forceFresh = false,
    ): Promise<
        | {
              ok: true;
              contexts: DashboardCandidate[];
              associatedCount: number | undefined;
          }
        | { ok: false; status: 'dashboard_context_unavailable'; detail?: string }
    > {
        try {
            const first = forceFresh
                ? await resolver.fetchContexts(
                      apiKey,
                      projectUuid,
                      filters,
                      { bypassCache: true },
                  )
                : await resolver.fetchContexts(apiKey, projectUuid, filters);
            const result =
                !forceFresh && first.contexts.length === 0
                    ? await resolver.fetchContexts(
                          apiKey,
                          projectUuid,
                          filters,
                          { bypassCache: true },
                      )
                    : first;
            return {
                ok: true,
                contexts: result.contexts.map((context) => ({
                    dashboardUuid: context.dashboardUuid,
                    dashboardSlug: context.dashboardSlug,
                    dashboardName: context.dashboardName,
                })),
                associatedCount: result.associatedCount,
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
            const preflight = await preflightDashboard(apiKey, dashboardUuid);
            if (!preflight.ok) {
                if (preflight.status === 'dashboard_permission_required') {
                    return failure(
                        'dashboard_permission_required',
                        buildPermissionRequiredPayload({
                            message: '您没有该看板的访问权限。',
                            dashboardUuid,
                            dashboardUrl: dashboardUrl(
                                projectUuid,
                                dashboardUuid,
                            ),
                            contact,
                            hint: '请将看板链接提供给客服申请开通；开通后用同一 dashboardUuid 重试。',
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

            if (!chartUuid && !exploreName) {
                // 无法校验归属（反查至少要有一个入参）
                return failure(
                    'dashboard_context_unavailable',
                    buildContextUnavailablePayload({
                        message:
                            '强制看板模式需要提供 exploreName 或 chartUuid，才能校验看板归属。',
                        hint: '请在工具参数里带上 exploreName 或 chartUuid 后重试。',
                    }),
                );
            }

            // §4.4：显式 uuid 必须属于该 explore / chart 的关联看板集合
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
            let matched = candidates.some(
                (candidate) => candidate.dashboardUuid === dashboard.uuid,
            ) || candidates.some(
                (candidate) => candidate.dashboardUuid === dashboardUuid,
            );
            if (!matched) {
                // 阻断路径：绕过缓存再查一次，避免刚挂好看板仍被判定为未关联
                const fresh = await fetchAssociated(
                    apiKey,
                    projectUuid,
                    { chartUuid, exploreName },
                    true,
                );
                if (fresh.ok) {
                    candidates = toCandidates(fresh.contexts, projectUuid);
                    matched =
                        candidates.some(
                            (candidate) =>
                                candidate.dashboardUuid === dashboard.uuid,
                        ) ||
                        candidates.some(
                            (candidate) =>
                                candidate.dashboardUuid === dashboardUuid,
                        );
                    if (matched) {
                        association.associatedCount = fresh.associatedCount;
                    }
                }
            }
            if (!matched) {
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
                    'dashboard_not_found',
                    buildNotFoundPayload({
                        dashboardUuid,
                        dashboardUrl: dashboardUrl(projectUuid, dashboardUuid),
                        contact,
                        candidates,
                    }),
                );
            }

            return {
                ok: true,
                context: {
                    dashboardUuid: dashboard.uuid,
                    dashboardSlug: dashboard.slug,
                    dashboardName: dashboard.name,
                    dashboardUrl:
                        dashboardUrl(projectUuid, dashboard.uuid) ?? '',
                    source: 'explicitDashboardUuid',
                    candidateCount: Math.max(candidates.length, 1),
                },
            };
        }

        if (!chartUuid && !exploreName) {
            return failure(
                'dashboard_context_unavailable',
                buildContextUnavailablePayload({
                    message:
                        '强制看板模式需要提供 exploreName 或 chartUuid，才能解析看板上下文。',
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
                message: '该数据集关联了看板，但当前账号看不到任何一张。',
                dashboardUuid: null,
                dashboardUrl: null,
                contact,
                hint: '请联系客服检查看板授权；若客户后台白名单已开通，请让管理员确认空间权限。',
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
    projectUuid: string;
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

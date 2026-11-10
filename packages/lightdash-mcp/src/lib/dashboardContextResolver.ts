import { createHash } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LightdashRestClient } from '../rest/lightdashRest';
import { buildDashboardWebUrl } from './contentWebUrls';
import { getHttpRequestUserAttributesHeader } from './requestContext';

export type DashboardQueryContextItem = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    chartUuids: string[];
};

export type DashboardCandidate = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    /** 浏览器可打开的看板链接（MCP 侧拼接，调用方未提供站点根地址时缺省） */
    dashboardUrl?: string;
};

export type ResolvedDashboardContext = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    /** explicit：调用方传入；unique*：反查仅 1 个；first*：反查多个时取排序后第一个 */
    source:
        | 'explicitDashboardUuid'
        | 'uniqueExploreContext'
        | 'uniqueChartContext'
        | 'firstExploreContext'
        | 'firstChartContext';
    candidateCount: number;
    /** 多候选取第一个时返回完整可见列表（含当前选中项） */
    candidates?: DashboardCandidate[];
};

export type DashboardContextResolveResult =
    | {
          status: 'resolved';
          context: ResolvedDashboardContext;
      }
    | {
          status: 'needs_selection';
          source: 'chartUuid' | 'exploreName';
          candidateCount: number;
          candidates: DashboardCandidate[];
          hint: string;
      }
    | {
          status: 'none';
          hint: string;
          /**
           * 权限过滤前的关联看板数。
           * - 反查成功但后端未升级 associatedCount 时为 null（调用方需 fail-closed）
           * - 完全没有反查入参时为 null
           */
          associatedCount: number | null;
      };

/** 反查结果（缓存条目与调用方共用） */
export type DashboardContextFetchResult = {
    contexts: DashboardQueryContextItem[];
    /** 后端未升级时为 undefined */
    associatedCount: number | undefined;
};

type CacheEntry = {
    expiresAt: number;
    contexts: DashboardQueryContextItem[];
    associatedCount: number | undefined;
};

export type DashboardContextResolverOptions = {
    cacheTtlMs?: number;
    /**
     * 强制看板模式：反查到多个候选时返回 needs_selection（阻断），
     * 而不是取排序第一个。默认 false 保持旧行为。
     */
    blockOnMultiple?: boolean;
    /** 浏览器站点根地址：用于给候选生成 dashboardUrl */
    publicBaseUrl?: string;
};

const DEFAULT_CACHE_TTL_MS = 60_000;

/**
 * 凭证指纹（apiKey + 用户属性头）。
 *
 * 与 explore 缓存的 createExploreCacheKey 用同一套算法：禁止跨 token 复用缓存。
 */
export function createDashboardCredentialFingerprint(
    apiKey: string,
    userAttributesHeader: string | undefined,
): string {
    return createHash('sha256')
        .update(apiKey, 'utf8')
        .update('\0', 'utf8')
        .update(userAttributesHeader ?? '', 'utf8')
        .digest('hex');
}

function sortContexts(
    contexts: DashboardQueryContextItem[],
): DashboardQueryContextItem[] {
    return [...contexts].sort((a, b) => {
        const byName = a.dashboardName.localeCompare(b.dashboardName);
        if (byName !== 0) return byName;
        const bySlug = a.dashboardSlug.localeCompare(b.dashboardSlug);
        if (bySlug !== 0) return bySlug;
        return a.dashboardUuid.localeCompare(b.dashboardUuid);
    });
}

function toCandidates(
    contexts: DashboardQueryContextItem[],
    projectUuid: string,
    publicBaseUrl: string | undefined,
): DashboardCandidate[] {
    return contexts.map((c) => ({
        dashboardUuid: c.dashboardUuid,
        dashboardSlug: c.dashboardSlug,
        dashboardName: c.dashboardName,
        ...(publicBaseUrl
            ? {
                  dashboardUrl: buildDashboardWebUrl({
                      publicBaseUrl,
                      projectUuid,
                      dashboardUuid: c.dashboardUuid,
                  }),
              }
            : {}),
    }));
}

function cacheKey(params: {
    fingerprint: string;
    projectUuid: string;
    exploreName?: string;
    chartUuid?: string;
}): string {
    return [
        params.fingerprint,
        params.projectUuid,
        params.chartUuid ?? '',
        params.exploreName ?? '',
    ].join('|');
}

export function buildDashboardSelectionRequiredResult(params: {
    source: 'chartUuid' | 'exploreName';
    candidates: DashboardCandidate[];
    exploreName?: string;
    chartUuid?: string;
}): CallToolResult {
    const { source, candidates, exploreName, chartUuid } = params;
    const payload = {
        status: 'dashboard_selection_required',
        message:
            '未提供 dashboardUuid。请从可关联看板中选择一个，再次调用时传入 dashboardUuid。',
        source,
        exploreName: exploreName ?? null,
        chartUuid: chartUuid ?? null,
        candidateCount: candidates.length,
        candidates,
        hint: '把选中的 dashboardUuid 传给本工具后即可继续查询。',
    };
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
    };
}

function pickContext(
    contexts: DashboardQueryContextItem[],
): DashboardQueryContextItem {
    return contexts[0]!;
}

function toResolvedContext(
    picked: DashboardQueryContextItem,
    source: ResolvedDashboardContext['source'],
    contexts: DashboardQueryContextItem[],
    projectUuid: string,
    publicBaseUrl: string | undefined,
): ResolvedDashboardContext {
    const context: ResolvedDashboardContext = {
        dashboardUuid: picked.dashboardUuid,
        dashboardSlug: picked.dashboardSlug,
        dashboardName: picked.dashboardName,
        source,
        candidateCount: contexts.length,
    };
    if (contexts.length > 1) {
        context.candidates = toCandidates(contexts, projectUuid, publicBaseUrl);
    }
    return context;
}

export function createDashboardContextResolver(
    api: LightdashRestClient,
    options?: DashboardContextResolverOptions,
) {
    const cache = new Map<string, CacheEntry>();
    const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const blockOnMultiple = options?.blockOnMultiple ?? false;
    const publicBaseUrl = options?.publicBaseUrl;

    async function fetchContexts(
        apiKey: string,
        projectUuid: string,
        filters: { exploreName?: string; chartUuid?: string },
        fetchOptions?: { bypassCache?: boolean },
    ): Promise<DashboardContextFetchResult> {
        const key = cacheKey({
            fingerprint: createDashboardCredentialFingerprint(
                apiKey,
                getHttpRequestUserAttributesHeader(),
            ),
            projectUuid,
            ...filters,
        });
        const now = Date.now();
        if (!fetchOptions?.bypassCache) {
            const cached = cache.get(key);
            if (cached && cached.expiresAt > now) {
                return {
                    contexts: cached.contexts,
                    associatedCount: cached.associatedCount,
                };
            }
        }
        const result = await api.getDashboardContexts(
            apiKey,
            projectUuid,
            filters,
        );
        const contexts = sortContexts(result.contexts ?? []);
        cache.set(key, {
            contexts,
            associatedCount: result.associatedCount,
            expiresAt: now + cacheTtlMs,
        });
        return { contexts, associatedCount: result.associatedCount };
    }

    async function resolve(params: {
        apiKey: string;
        projectUuid: string;
        dashboardUuid?: string;
        chartUuid?: string;
        exploreName?: string;
    }): Promise<DashboardContextResolveResult> {
        const {
            apiKey,
            projectUuid,
            dashboardUuid,
            chartUuid,
            exploreName,
        } = params;

        if (dashboardUuid) {
            // 显式 uuid：保持旧行为——取不到看板时按 uuid 兜底（由后端做权威校验）。
            // 强制看板模式的校验走 requiredDashboardContext（不经过本分支）。
            try {
                const dashboard = (await api.getDashboard(
                    apiKey,
                    dashboardUuid,
                )) as {
                    uuid?: string;
                    slug?: string;
                    name?: string;
                };
                return {
                    status: 'resolved',
                    context: {
                        dashboardUuid: dashboard.uuid ?? dashboardUuid,
                        dashboardSlug: dashboard.slug ?? dashboardUuid,
                        dashboardName: dashboard.name ?? dashboardUuid,
                        source: 'explicitDashboardUuid',
                        candidateCount: 1,
                    },
                };
            } catch {
                return {
                    status: 'resolved',
                    context: {
                        dashboardUuid,
                        dashboardSlug: dashboardUuid,
                        dashboardName: dashboardUuid,
                        source: 'explicitDashboardUuid',
                        candidateCount: 1,
                    },
                };
            }
        }

        if (chartUuid) {
            const { contexts, associatedCount } = await fetchContexts(
                apiKey,
                projectUuid,
                { chartUuid },
            );
            if (contexts.length === 0) {
                return {
                    status: 'none',
                    hint: '未找到 chart 关联 dashboard，将按原 saved chart / 无看板上下文逻辑执行',
                    associatedCount: associatedCount ?? null,
                };
            }
            if (contexts.length > 1 && blockOnMultiple) {
                return {
                    status: 'needs_selection',
                    source: 'chartUuid',
                    candidateCount: contexts.length,
                    candidates: toCandidates(
                        contexts,
                        projectUuid,
                        publicBaseUrl,
                    ),
                    hint: '该 chart 关联多个 dashboard，请显式传入 dashboardUuid',
                };
            }
            const source =
                contexts.length === 1
                    ? 'uniqueChartContext'
                    : 'firstChartContext';
            return {
                status: 'resolved',
                context: toResolvedContext(
                    pickContext(contexts),
                    source,
                    contexts,
                    projectUuid,
                    publicBaseUrl,
                ),
            };
        }

        if (exploreName) {
            const { contexts, associatedCount } = await fetchContexts(
                apiKey,
                projectUuid,
                { exploreName },
            );
            if (contexts.length === 0) {
                return {
                    status: 'none',
                    hint: '未找到 explore 关联 dashboard，将按原语义查询逻辑执行（可能使用 dashboardSlug=NA）',
                    associatedCount: associatedCount ?? null,
                };
            }
            if (contexts.length > 1 && blockOnMultiple) {
                return {
                    status: 'needs_selection',
                    source: 'exploreName',
                    candidateCount: contexts.length,
                    candidates: toCandidates(
                        contexts,
                        projectUuid,
                        publicBaseUrl,
                    ),
                    hint: '该 explore 关联多个 dashboard，请显式传入 dashboardUuid',
                };
            }
            const source =
                contexts.length === 1
                    ? 'uniqueExploreContext'
                    : 'firstExploreContext';
            return {
                status: 'resolved',
                context: toResolvedContext(
                    pickContext(contexts),
                    source,
                    contexts,
                    projectUuid,
                    publicBaseUrl,
                ),
            };
        }

        return {
            status: 'none',
            hint: '未提供 exploreName/chartUuid/dashboardUuid，无法解析看板上下文',
            associatedCount: null,
        };
    }

    return { resolve, fetchContexts };
}

export type DashboardContextResolver = ReturnType<
    typeof createDashboardContextResolver
>;

let sharedResolver: DashboardContextResolver | undefined;

/**
 * 进程内共享的 resolver（单实例共享 60s 缓存）。
 *
 * 强制看板模式下工具侧必须共用同一份缓存，否则每次查询都会重复反查。
 */
export function getSharedDashboardContextResolver(
    api: LightdashRestClient,
    options?: DashboardContextResolverOptions,
): DashboardContextResolver {
    if (!sharedResolver) {
        sharedResolver = createDashboardContextResolver(api, options);
    }
    return sharedResolver;
}

/** 仅测试用：清空共享 resolver */
export function resetSharedDashboardContextResolverForTests(): void {
    sharedResolver = undefined;
}

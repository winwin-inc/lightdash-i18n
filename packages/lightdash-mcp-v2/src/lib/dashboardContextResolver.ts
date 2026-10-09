import type { CallToolResult } from '@modelcontextprotocol/server';
import type { LightdashRestClient } from '../rest/lightdashRest';

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
};

export type ResolvedDashboardContext = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    /** explicit：调用方传入；unique*：反查仅 1 个；random*：反查多个时随机选用 */
    source:
        | 'explicitDashboardUuid'
        | 'uniqueExploreContext'
        | 'uniqueChartContext'
        | 'randomExploreContext'
        | 'randomChartContext';
    candidateCount: number;
    /** 多候选随机选用时返回完整可见列表（含当前选中项） */
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
      };

type CacheEntry = {
    expiresAt: number;
    contexts: DashboardQueryContextItem[];
};

const DEFAULT_CACHE_TTL_MS = 60_000;

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
): DashboardCandidate[] {
    return contexts.map((c) => ({
        dashboardUuid: c.dashboardUuid,
        dashboardSlug: c.dashboardSlug,
        dashboardName: c.dashboardName,
    }));
}

function cacheKey(params: {
    projectUuid: string;
    exploreName?: string;
    chartUuid?: string;
}): string {
    return [
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
    rng: () => number,
): DashboardQueryContextItem {
    const index = Math.min(
        contexts.length - 1,
        Math.max(0, Math.floor(rng() * contexts.length)),
    );
    return contexts[index]!;
}

function toResolvedContext(
    picked: DashboardQueryContextItem,
    source: ResolvedDashboardContext['source'],
    contexts: DashboardQueryContextItem[],
): ResolvedDashboardContext {
    const context: ResolvedDashboardContext = {
        dashboardUuid: picked.dashboardUuid,
        dashboardSlug: picked.dashboardSlug,
        dashboardName: picked.dashboardName,
        source,
        candidateCount: contexts.length,
    };
    if (contexts.length > 1) {
        context.candidates = toCandidates(contexts);
    }
    return context;
}

export function createDashboardContextResolver(
    api: LightdashRestClient,
    options?: { cacheTtlMs?: number; rng?: () => number },
) {
    const cache = new Map<string, CacheEntry>();
    const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const rng = options?.rng ?? Math.random;

    async function fetchContexts(
        apiKey: string,
        projectUuid: string,
        filters: { exploreName?: string; chartUuid?: string },
    ): Promise<DashboardQueryContextItem[]> {
        const key = cacheKey({ projectUuid, ...filters });
        const cached = cache.get(key);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            return cached.contexts;
        }
        const result = await api.getDashboardContexts(
            apiKey,
            projectUuid,
            filters,
        );
        const contexts = sortContexts(result.contexts ?? []);
        cache.set(key, { contexts, expiresAt: now + cacheTtlMs });
        return contexts;
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
            const contexts = await fetchContexts(apiKey, projectUuid, {
                chartUuid,
            });
            if (contexts.length === 0) {
                return {
                    status: 'none',
                    hint: '未找到 chart 关联 dashboard，将按原 saved chart / 无看板上下文逻辑执行',
                };
            }
            const source =
                contexts.length === 1
                    ? 'uniqueChartContext'
                    : 'randomChartContext';
            return {
                status: 'resolved',
                context: toResolvedContext(
                    pickContext(contexts, rng),
                    source,
                    contexts,
                ),
            };
        }

        if (exploreName) {
            const contexts = await fetchContexts(apiKey, projectUuid, {
                exploreName,
            });
            if (contexts.length === 0) {
                return {
                    status: 'none',
                    hint: '未找到 explore 关联 dashboard，将按原语义查询逻辑执行（可能使用 dashboardSlug=NA）',
                };
            }
            const source =
                contexts.length === 1
                    ? 'uniqueExploreContext'
                    : 'randomExploreContext';
            return {
                status: 'resolved',
                context: toResolvedContext(
                    pickContext(contexts, rng),
                    source,
                    contexts,
                ),
            };
        }

        return {
            status: 'none',
            hint: '未提供 exploreName/chartUuid/dashboardUuid，无法解析看板上下文',
        };
    }

    return { resolve, fetchContexts };
}

export type DashboardContextResolver = ReturnType<
    typeof createDashboardContextResolver
>;

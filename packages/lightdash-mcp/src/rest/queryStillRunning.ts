/**
 * Error raised when the MCP poll budget runs out before the query reaches READY.
 *
 * This is deliberately *not* a plain "timed out" error. The query is very likely still
 * running on the warehouse: Lightdash submits it and the results are written asynchronously,
 * so giving up on polling says nothing about whether the query finished.
 *
 * The default reaction to a timeout ("send the same request again") is actively harmful
 * here — every resubmission starts another warehouse query, and on a busy Hologres instance
 * the abandoned originals keep holding connections and query memory until the warehouse
 * decides to give up on them. The message therefore states that the query is still alive
 * and tells the caller not to resubmit it unchanged.
 */

export type QueryStillRunningParams = {
    queryUuid: string;
    /** How long the call waited before giving up, in milliseconds. */
    waitedMs: number;
    /** Human readable label for the query kind, e.g. `metric query`. */
    label: string;
};

export function formatWaited(waitedMs: number): string {
    const seconds = Math.max(1, Math.round(waitedMs / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} 分钟`;
}

export function buildQueryStillRunningMessage({
    queryUuid,
    waitedMs,
    label,
}: QueryStillRunningParams): string {
    return [
        `查询仍在运行，不是失败（${label}，queryUuid=${queryUuid}，已等待约 ${formatWaited(
            waitedMs,
        )}）。`,
        'Lightdash 已经把查询提交到数仓，只是还没出结果；MCP 这边的等待预算用完了。',
        '请**不要**用相同参数重复提交：每提交一次都会在数仓上再起一条同样的查询，',
        '叠加起来会把数仓实例拖慢，让所有人和你一起变慢。',
        '接下来可以：',
        '1. 缩小范围后重试：减少 dimensions/metrics、收窄时间筛选、降低 limit；',
        '2. 需要完整结果时稍后再查一次（数仓侧有硬超时，超时会自动取消，不会一直占着）。',
        `3. 结果已经算完但你没拿到时，用相同的 queryUuid 读取更容易命中缓存：${queryUuid}`,
    ].join('\n');
}

export class QueryStillRunningError extends Error {
    readonly queryUuid: string;

    constructor(params: QueryStillRunningParams) {
        super(buildQueryStillRunningMessage(params));
        this.name = 'QueryStillRunningError';
        this.queryUuid = params.queryUuid;
    }
}

export function isQueryStillRunningError(
    error: unknown,
): error is QueryStillRunningError {
    return error instanceof QueryStillRunningError;
}

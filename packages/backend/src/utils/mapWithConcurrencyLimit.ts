export type MapWithConcurrencyLimitResult<T, R> =
    | { status: 'fulfilled'; item: T; value: R }
    | { status: 'rejected'; item: T; reason: unknown };

/**
 * 以固定并发上限处理列表，单个任务失败不影响其他任务，返回结果按输入顺序排列。
 * 用于看板导出：一次要跑几十个 tile 查询，不能同时打满数仓。
 */
export const mapWithConcurrencyLimit = async <T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
    onSettled?: (
        result: MapWithConcurrencyLimitResult<T, R>,
        doneCount: number,
        total: number,
    ) => void,
): Promise<Array<MapWithConcurrencyLimitResult<T, R>>> => {
    const total = items.length;
    if (total === 0) {
        return [];
    }

    // limit 非法（< 1 或 NaN）时按 1 处理；Infinity 表示不限流，等价于全部并发
    const normalizedLimit = Number.isNaN(limit) ? 1 : Math.floor(limit);
    const effectiveLimit = Math.max(1, Math.min(normalizedLimit, total));

    const results: Array<MapWithConcurrencyLimitResult<T, R>> = new Array(
        total,
    );
    let nextIndex = 0;
    let doneCount = 0;

    // worker 池：固定 effectiveLimit 个 worker 抢同一个游标，
    // 保证同时在跑的任务数不超过上限，且慢任务不会阻塞其他任务取新任务
    const worker = async (): Promise<void> => {
        for (;;) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= total) {
                return;
            }

            const item = items[index];
            let result: MapWithConcurrencyLimitResult<T, R>;
            try {
                // eslint-disable-next-line no-await-in-loop
                const value = await mapper(item, index);
                result = { status: 'fulfilled', item, value };
            } catch (reason) {
                // 单个任务失败不影响其他任务，也不中断整批
                result = { status: 'rejected', item, reason };
            }

            results[index] = result;
            doneCount += 1;

            if (onSettled) {
                try {
                    onSettled(result, doneCount, total);
                } catch (error) {
                    // onSettled 只用于上报进度，抛错不应影响整体结果，这里静默吞掉
                }
            }
        }
    };

    await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));

    return results;
};

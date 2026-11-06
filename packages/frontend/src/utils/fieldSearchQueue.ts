/**
 * field/search 请求队列（全局并发 1）。
 *
 * 仓库引擎的内存限额是**所有 query 合计**的全局限额：
 * `POST /projects/:projectId/field/:fieldId/search` 是重查询
 * （带 dbt sql_filter + GROUP BY），并发跑容易把引擎内存打满
 * （HGERR_code 53200），连带把看板自己的查询和类目联动一起拒绝。
 *
 * 因此把所有走同一个接口的请求串行化：
 * - 类目解析 / 级联（`utils/categoryFilters.ts`）
 * - 筛选器自动补全（`hooks/useFieldValues.ts`）
 *
 * 队列空闲时立即启动（不推迟到下一个 microtask），避免无谓地拖慢第一个请求。
 */

/**
 * 排队中的任务被同 key 的新任务取代时抛出。
 * 调用方应把它当作「请求已作废」而不是真正的错误。
 */
export class SupersededFieldSearchError extends Error {
    constructor() {
        super('Field search request superseded by a newer request');
        this.name = 'SupersededFieldSearchError';
    }
}

export const isSupersededFieldSearchError = (
    error: unknown,
): error is SupersededFieldSearchError =>
    error instanceof SupersededFieldSearchError;

type QueueEntry = {
    /** 同一个 key 的排队任务会被新任务取代（用户已经换了搜索词） */
    key?: string;
    /** 同一个请求的标识：相同则视为重复请求，不互相取代 */
    dedupeKey?: string;
    start: () => void;
    reject: (error: unknown) => void;
};

let fieldSearchInFlight = false;
const fieldSearchWaiters: QueueEntry[] = [];

const runFieldSearchTask = async <T>(task: () => Promise<T>): Promise<T> => {
    try {
        return await task();
    } finally {
        const next = fieldSearchWaiters.shift();
        if (next) {
            next.start();
        } else {
            fieldSearchInFlight = false;
        }
    }
};

/**
 * 把一个 field/search 请求放进串行队列。
 *
 * @param task 真正发请求的函数
 * @param options.key 可选：同一个 key 的**排队中**任务会被新任务直接作废，
 *                    避免用户连续输入时排一堆用不上的重查询。
 * @param options.dedupeKey 可选：标识「同一个请求」。
 *                    新任务与排队中的任务 dedupeKey 相同时不互相取代（只是重试同一个请求）。
 */
export const enqueueFieldSearch = <T>(
    task: () => Promise<T>,
    options?: { key?: string; dedupeKey?: string },
): Promise<T> => {
    const key = options?.key;
    const dedupeKey = options?.dedupeKey;

    if (key) {
        // 作废同 key 的排队任务（还没发到仓库）
        for (let i = fieldSearchWaiters.length - 1; i >= 0; i -= 1) {
            const waiter = fieldSearchWaiters[i];
            if (waiter.key === key && waiter.dedupeKey !== dedupeKey) {
                fieldSearchWaiters.splice(i, 1);
                waiter.reject(new SupersededFieldSearchError());
            }
        }
    }

    if (!fieldSearchInFlight) {
        fieldSearchInFlight = true;
        return runFieldSearchTask(task);
    }

    return new Promise<T>((resolve, reject) => {
        fieldSearchWaiters.push({
            key,
            dedupeKey,
            start: () => {
                runFieldSearchTask(task).then(resolve, reject);
            },
            reject,
        });
    });
};

/** 仅测试使用：清空队列状态 */
export const resetFieldSearchQueueForTests = (): void => {
    fieldSearchInFlight = false;
    fieldSearchWaiters.splice(0, fieldSearchWaiters.length);
};

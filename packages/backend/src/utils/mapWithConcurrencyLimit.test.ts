import {
    mapWithConcurrencyLimit,
    type MapWithConcurrencyLimitResult,
} from './mapWithConcurrencyLimit';

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const valuesOf = <T, R>(
    results: Array<MapWithConcurrencyLimitResult<T, R>>,
): Array<R | null> =>
    results.map((result) =>
        result.status === 'fulfilled' ? result.value : null,
    );

describe('mapWithConcurrencyLimit', () => {
    it('returns results aligned with the input order even when tasks finish out of order', async () => {
        const items = ['a', 'b', 'c', 'd', 'e'];
        // 故意让完成顺序与输入顺序不一致
        const delays = [40, 5, 25, 1, 15];

        const results = await mapWithConcurrencyLimit(
            items,
            5,
            async (item, index) => {
                await sleep(delays[index]);
                return `${item}-${index}`;
            },
        );

        expect(results).toHaveLength(items.length);
        expect(results.map((result) => result.item)).toEqual(items);
        results.forEach((result, index) => {
            expect(result.status).toBe('fulfilled');
            if (result.status === 'fulfilled') {
                expect(result.value).toBe(`${items[index]}-${index}`);
            }
        });
    });

    it('never runs more than `limit` tasks at once, and does run them concurrently', async () => {
        let running = 0;
        let peak = 0;

        await mapWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 3, async () => {
            running += 1;
            peak = Math.max(peak, running);
            await sleep(10);
            running -= 1;
        });

        expect(peak).toBeLessThanOrEqual(3);
        // > 1 证明确实是并发执行，而不是串行
        expect(peak).toBeGreaterThan(1);
        expect(peak).toBe(3);
    });

    it('runs tasks one by one when limit is 1', async () => {
        let running = 0;
        let peak = 0;

        await mapWithConcurrencyLimit([1, 2, 3, 4], 1, async () => {
            running += 1;
            peak = Math.max(peak, running);
            await sleep(5);
            running -= 1;
        });

        expect(peak).toBe(1);
    });

    it('passes the item and its index to the mapper', async () => {
        const seen: Array<[string, number]> = [];

        await mapWithConcurrencyLimit(
            ['a', 'b', 'c'],
            1,
            async (item, index) => {
                seen.push([item, index]);
                return index;
            },
        );

        expect(seen).toEqual([
            ['a', 0],
            ['b', 1],
            ['c', 2],
        ]);
    });

    it('reports a rejected result for a failing task and still runs the others', async () => {
        const mapper = jest.fn(async (item: number) => {
            if (item === 3) {
                throw new Error(`boom ${item}`);
            }
            return item * 2;
        });

        const results = await mapWithConcurrencyLimit([1, 2, 3, 4], 2, mapper);

        expect(mapper).toHaveBeenCalledTimes(4);
        expect(results).toHaveLength(4);

        expect(results[0]).toEqual({ status: 'fulfilled', item: 1, value: 2 });
        expect(results[1]).toEqual({ status: 'fulfilled', item: 2, value: 4 });

        const failed = results[2];
        expect(failed.status).toBe('rejected');
        expect(failed.item).toBe(3);
        if (failed.status === 'rejected') {
            expect(failed.reason).toBeInstanceOf(Error);
            expect((failed.reason as Error).message).toBe('boom 3');
        }

        expect(results[3]).toEqual({ status: 'fulfilled', item: 4, value: 8 });
    });

    it('returns an empty array and never calls the mapper for an empty input', async () => {
        const mapper = jest.fn(async (item: number) => item * 2);

        const results = await mapWithConcurrencyLimit([], 5, mapper);

        expect(results).toEqual([]);
        expect(mapper).not.toHaveBeenCalled();
    });

    it('treats limit = 0 as 1', async () => {
        let running = 0;
        let peak = 0;

        const results = await mapWithConcurrencyLimit(
            [1, 2, 3],
            0,
            async (item) => {
                running += 1;
                peak = Math.max(peak, running);
                await sleep(5);
                running -= 1;
                return item * 10;
            },
        );

        expect(peak).toBe(1);
        expect(valuesOf(results)).toEqual([10, 20, 30]);
    });

    it('treats a negative limit as 1', async () => {
        let running = 0;
        let peak = 0;

        const results = await mapWithConcurrencyLimit(
            [1, 2, 3],
            -5,
            async (item) => {
                running += 1;
                peak = Math.max(peak, running);
                await sleep(5);
                running -= 1;
                return item * 10;
            },
        );

        expect(peak).toBe(1);
        expect(valuesOf(results)).toEqual([10, 20, 30]);
    });

    it('calls onSettled once per item with an incrementing doneCount', async () => {
        const items = [1, 2, 3, 4, 5];
        const settled: Array<{
            result: MapWithConcurrencyLimitResult<number, number>;
            doneCount: number;
            total: number;
        }> = [];

        const results = await mapWithConcurrencyLimit(
            items,
            2,
            async (item) => item * 2,
            (result, doneCount, total) => {
                settled.push({ result, doneCount, total });
            },
        );

        expect(settled).toHaveLength(items.length);
        // doneCount 从 1 递增到 total（并发下调用顺序不固定，按值排序后比较）
        expect(
            settled.map((entry) => entry.doneCount).sort((a, b) => a - b),
        ).toEqual([1, 2, 3, 4, 5]);
        settled.forEach((entry) => {
            expect(entry.total).toBe(items.length);
        });

        // onSettled 收到的 result 与最终结果一一对应
        expect(
            settled.map((entry) =>
                entry.result.status === 'fulfilled' ? entry.result.value : null,
            ),
        ).toEqual(valuesOf(results).map((value) => value));
    });

    it('keeps the results intact when the onSettled callback throws', async () => {
        const onSettled = jest.fn(() => {
            throw new Error('callback boom');
        });

        const results = await mapWithConcurrencyLimit(
            [1, 2, 3],
            2,
            async (item) => item * 10,
            onSettled,
        );

        expect(onSettled).toHaveBeenCalledTimes(3);
        expect(valuesOf(results)).toEqual([10, 20, 30]);
    });
});

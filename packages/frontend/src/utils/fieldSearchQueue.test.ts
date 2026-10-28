import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    enqueueFieldSearch,
    isSupersededFieldSearchError,
    resetFieldSearchQueueForTests,
    SupersededFieldSearchError,
} from './fieldSearchQueue';

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('fieldSearchQueue', () => {
    afterEach(() => {
        resetFieldSearchQueueForTests();
    });

    it('runs field search requests one at a time', async () => {
        const order: string[] = [];
        const first = deferred<string>();
        const second = deferred<string>();

        const firstPromise = enqueueFieldSearch(async () => {
            order.push('first:start');
            const value = await first.promise;
            order.push('first:end');
            return value;
        });
        const secondPromise = enqueueFieldSearch(async () => {
            order.push('second:start');
            return second.promise;
        });

        expect(order).toEqual(['first:start']);

        first.resolve('a');
        await expect(firstPromise).resolves.toBe('a');
        await Promise.resolve();
        await Promise.resolve();

        expect(order).toEqual(['first:start', 'first:end', 'second:start']);

        second.resolve('b');
        await expect(secondPromise).resolves.toBe('b');
    });

    it('starts the first request immediately', async () => {
        const task = vi.fn().mockResolvedValue('ok');
        await expect(enqueueFieldSearch(task)).resolves.toBe('ok');
        expect(task).toHaveBeenCalledTimes(1);
    });

    it('continues the queue after a task fails', async () => {
        const failing = enqueueFieldSearch(async () => {
            throw new Error('boom');
        });
        const following = enqueueFieldSearch(async () => 'ok');

        await expect(failing).rejects.toThrow('boom');
        await expect(following).resolves.toBe('ok');
    });

    it('supersedes a queued task with the same key', async () => {
        // 先占住队列，让后面的任务处于排队状态
        const blocker = deferred<string>();
        const blockerPromise = enqueueFieldSearch(() => blocker.promise);

        const first = deferred<string>();
        const firstPromise = enqueueFieldSearch(() => first.promise, {
            key: 'autocomplete:field-1',
            dedupeKey: 'autocomplete:field-1:a',
        });

        const secondPromise = enqueueFieldSearch(async () => 'second', {
            key: 'autocomplete:field-1',
            dedupeKey: 'autocomplete:field-1:b',
        });

        await expect(firstPromise).rejects.toBeInstanceOf(
            SupersededFieldSearchError,
        );

        blocker.resolve('go');
        await blockerPromise;
        await expect(secondPromise).resolves.toBe('second');
    });

    it('keeps queued tasks with the same dedupe key', async () => {
        const blocker = deferred<string>();
        const blockerPromise = enqueueFieldSearch(() => blocker.promise);

        const first = deferred<string>();
        const firstPromise = enqueueFieldSearch(() => first.promise, {
            key: 'autocomplete:field-1',
            dedupeKey: 'autocomplete:field-1:a',
        });
        const secondPromise = enqueueFieldSearch(async () => 'second', {
            key: 'autocomplete:field-1',
            dedupeKey: 'autocomplete:field-1:a',
        });

        blocker.resolve('go');
        await blockerPromise;
        first.resolve('first');
        await expect(firstPromise).resolves.toBe('first');
        await expect(secondPromise).resolves.toBe('second');
    });

    it('identifies superseded errors', () => {
        expect(
            isSupersededFieldSearchError(new SupersededFieldSearchError()),
        ).toBe(true);
        expect(isSupersededFieldSearchError(new Error('other'))).toBe(false);
    });
});

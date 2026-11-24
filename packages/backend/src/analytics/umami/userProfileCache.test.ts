import { UmamiUserProfile, UserProfileCache } from './userProfileCache';

const profile = (name: string): UmamiUserProfile => ({
    email: `${name}@example.com`,
    name,
    orgId: 'org-1',
    orgName: '品牌组织',
});

describe('UserProfileCache', () => {
    it('returns null on miss and populates asynchronously for the next get', async () => {
        const cache = new UserProfileCache();
        const resolver = jest.fn(async (uuid: string) => profile(uuid));
        cache.setUserResolver(resolver);

        expect(cache.get('u1')).toBeNull(); // miss：不阻塞
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(resolver).toHaveBeenCalledWith('u1');
        expect(cache.get('u1')).toEqual(profile('u1')); // 命中
        expect(resolver).toHaveBeenCalledTimes(1); // 第二次不再查
    });

    it('returns null and stays silent when resolver fails', async () => {
        const cache = new UserProfileCache();
        cache.setUserResolver(async () => {
            throw new Error('user not found');
        });
        expect(cache.get('bad')).toBeNull();
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(cache.get('bad')).toBeNull(); // 仍降级为无画像
    });

    it('dedupes concurrent misses for the same uuid', async () => {
        const cache = new UserProfileCache();
        const resolver = jest.fn(async (uuid: string) => profile(uuid));
        cache.setUserResolver(resolver);
        cache.get('u1');
        cache.get('u1');
        cache.get('u1');
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('evicts least-recently-used entries beyond 1000', async () => {
        const cache = new UserProfileCache();
        const resolver = jest.fn(async (uuid: string) => profile(uuid));
        cache.setUserResolver(resolver);

        cache.get('first');
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        // 灌满 1000 条（first 被挤到最旧）
        for (let i = 0; i < 1000; i += 1) {
            cache.get(`bulk-${i}`);
        }
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        // 访问最新 999 条，保证 bulk-0..998 是最近使用
        for (let i = 1; i < 1000; i += 1) {
            cache.get(`bulk-${i}`);
        }
        cache.get('new-one');
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        // first（最旧）与 bulk-0（次旧）被逐出
        expect(cache.get('first')).toBeNull();
        expect(cache.get('bulk-0')).toBeNull();
        expect(cache.get('bulk-999')).toEqual(profile('bulk-999'));
    });

    it('expires entries after TTL', async () => {
        jest.useFakeTimers();
        try {
            const cache = new UserProfileCache();
            const resolver = jest.fn(async (uuid: string) => profile(uuid));
            cache.setUserResolver(resolver);
            cache.get('u1');
            await jest.runAllTimersAsync(); // 触发后台 load
            expect(cache.get('u1')).toEqual(profile('u1'));
            // 10 分钟后过期
            jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
            expect(cache.get('u1')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });
});

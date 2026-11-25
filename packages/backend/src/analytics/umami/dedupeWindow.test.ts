import { DedupeWindow } from './dedupeWindow';

describe('DedupeWindow', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns false (allow) when ttlSeconds <= 0', () => {
        const window = new DedupeWindow();
        expect(window.shouldSkip('k', 0)).toBe(false);
        expect(window.shouldSkip('k', 0)).toBe(false);
        expect(window.shouldSkip('k', -1)).toBe(false);
        expect(window.size()).toBe(0); // 关闭态不占内存
    });

    it('skips the second call with the same key within the window', () => {
        const window = new DedupeWindow();
        expect(window.shouldSkip('a', 300)).toBe(false);
        expect(window.shouldSkip('a', 300)).toBe(true);
        expect(window.shouldSkip('b', 300)).toBe(false); // 不同 key 不影响
        expect(window.size()).toBe(2);
    });

    it('allows the key again after the window expires', () => {
        const base = 1_700_000_000_000;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(base);
        const window = new DedupeWindow();
        expect(window.shouldSkip('a', 60)).toBe(false);
        expect(window.shouldSkip('a', 60)).toBe(true);
        nowSpy.mockReturnValue(base + 60_001); // 过期（60s 窗口）
        expect(window.shouldSkip('a', 60)).toBe(false);
        expect(window.shouldSkip('a', 60)).toBe(true); // 重新计时后再命中
    });

    it('sweeps expired entries lazily so size does not grow unbounded', () => {
        const base = 1_700_000_000_000;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(base);
        const window = new DedupeWindow();
        window.shouldSkip('a', 1);
        nowSpy.mockReturnValue(base + 61_001); // 触发周期性清扫
        window.shouldSkip('b', 300);
        expect(window.size()).toBe(1); // 只剩未过期的 b
    });

    it('evicts the oldest entry beyond the 5000 capacity', () => {
        const window = new DedupeWindow();
        for (let i = 0; i < 5000; i += 1) {
            window.shouldSkip(`k${i}`, 300);
        }
        expect(window.size()).toBe(5000);
        expect(window.shouldSkip('k1', 300)).toBe(true); // 命中不插入，不触发淘汰
        window.shouldSkip('k5000', 300); // 超限 → 丢最旧的 k0
        expect(window.size()).toBe(5000);
        expect(window.shouldSkip('k0', 300)).toBe(false); // k0 已被淘汰 → 放行
    });
});

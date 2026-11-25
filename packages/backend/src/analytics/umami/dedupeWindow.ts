/**
 * 定长去重窗口：同一 key 在 ttl 秒内只放行一次（首个事件放行，后续命中即丢弃）。
 * 固定窗口（命中不续期）。内存上限 5000，超限按 Map 插入序丢最旧；
 * 过期项惰性清理（每 60s 一次全量清扫，单次调用 O(1)）。
 */
export class DedupeWindow {
    private static readonly CAPACITY = 5000;

    private static readonly SWEEP_INTERVAL_MS = 60_000;

    private readonly expiresAt = new Map<string, number>();

    private lastSweepAt = 0;

    /**
     * ttl 内已见过该 key 返回 true（应丢弃）。
     * ttlSeconds <= 0 视为关闭，恒放行且不占内存。
     */
    shouldSkip(key: string, ttlSeconds: number): boolean {
        if (ttlSeconds <= 0) {
            return false;
        }
        const now = Date.now();
        this.sweepExpiredIfNeeded(now);
        const existing = this.expiresAt.get(key);
        if (existing !== undefined && existing > now) {
            return true;
        }
        if (existing !== undefined) {
            // 删掉再写入，保持“插入序 = 最近写入序”，超限淘汰才是真正最旧的
            this.expiresAt.delete(key);
        }
        this.expiresAt.set(key, now + ttlSeconds * 1000);
        while (this.expiresAt.size > DedupeWindow.CAPACITY) {
            this.evictOldest();
        }
        return false;
    }

    /** 当前窗口内缓存的 key 数（测试/诊断用） */
    size(): number {
        return this.expiresAt.size;
    }

    /** 每 SWEEP_INTERVAL_MS 最多一次全量清扫过期项（Map 迭代中删除安全） */
    private sweepExpiredIfNeeded(now: number): void {
        if (now - this.lastSweepAt < DedupeWindow.SWEEP_INTERVAL_MS) {
            return;
        }
        this.lastSweepAt = now;
        for (const [key, expiresAt] of this.expiresAt) {
            if (expiresAt <= now) {
                this.expiresAt.delete(key);
            }
        }
    }

    /** 超限丢最旧（Map 保持插入序） */
    private evictOldest(): void {
        const oldest = this.expiresAt.keys().next();
        if (oldest.done !== true) {
            this.expiresAt.delete(oldest.value);
        }
    }
}

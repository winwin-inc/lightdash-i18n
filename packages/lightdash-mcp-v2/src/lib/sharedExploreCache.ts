export type ExploreCacheEntry = {
    expiresAtMs: number;
    explore: unknown;
    resolve: (field: string) => string;
    requiresDashboardContext: boolean;
};

export type SharedExploreCache = {
    get(key: string): ExploreCacheEntry | undefined;
    set(key: string, entry: ExploreCacheEntry): void;
    pruneExpired(): number;
    size(): number;
};

export function createSharedExploreCache(): SharedExploreCache {
    const map = new Map<string, ExploreCacheEntry>();
    return {
        get(key: string): ExploreCacheEntry | undefined {
            return map.get(key);
        },
        set(key: string, entry: ExploreCacheEntry): void {
            map.set(key, entry);
        },
        pruneExpired(): number {
            const now = Date.now();
            let pruned = 0;
            for (const [key, entry] of map) {
                if (entry.expiresAtMs <= now) {
                    map.delete(key);
                    pruned += 1;
                }
            }
            return pruned;
        },
        size(): number {
            return map.size;
        },
    };
}

let processSingleton: SharedExploreCache | null = null;

/** 进程级 explore 元数据缓存，多 MCP session 共享同一份 Map。 */
export function getSharedExploreCache(): SharedExploreCache {
    if (!processSingleton) {
        processSingleton = createSharedExploreCache();
    }
    return processSingleton;
}

/** 测试用：重置单例 */
export function resetSharedExploreCacheForTests(): void {
    processSingleton = null;
}

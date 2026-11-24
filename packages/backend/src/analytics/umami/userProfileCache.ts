import Logger from '../../logging/logger';

/** 通过 setUserResolver 注入的用户画像（拿不到的字段为 null，不发对应属性） */
export type UmamiUserProfile = {
    email: string | null;
    name: string | null;
    orgId: string | null;
    orgName: string | null;
};

/** 异步解析用户画像（一般指向 UserModel.getUserDetailsByUuid） */
export type UmamiUserResolver = (
    userUuid: string,
) => Promise<UmamiUserProfile | null>;

type CacheEntry = {
    profile: UmamiUserProfile;
    expiresAt: number;
};

const MAX_SIZE = 1000;
const TTL_MS = 10 * 60 * 1000; // 10min

/**
 * 用户画像 LRU 缓存。
 * get() 永远同步返回：命中返回画像；miss 返回 null 并在后台触发 resolver（失败静默），
 * 绝不阻塞事件发送——本次事件拿不到就不写 user_email 等属性。
 */
export class UserProfileCache {
    private readonly cache: Map<string, CacheEntry> = new Map();

    private readonly inFlight: Set<string> = new Set();

    private resolver: UmamiUserResolver | null = null;

    setUserResolver(resolver: UmamiUserResolver): void {
        this.resolver = resolver;
    }

    /** 同步取画像；miss 时后台异步加载（fire-and-forget），本次返回 null */
    get(userUuid: string): UmamiUserProfile | null {
        const entry = this.cache.get(userUuid);
        if (entry !== undefined) {
            if (entry.expiresAt > Date.now()) {
                // LRU：重插到 Map 尾部
                this.cache.delete(userUuid);
                this.cache.set(userUuid, entry);
                return entry.profile;
            }
            this.cache.delete(userUuid);
        }
        void this.load(userUuid);
        return null;
    }

    clear(): void {
        this.cache.clear();
    }

    private async load(userUuid: string): Promise<void> {
        if (this.resolver === null || this.inFlight.has(userUuid)) {
            return;
        }
        this.inFlight.add(userUuid);
        try {
            const profile = await this.resolver(userUuid);
            if (profile !== null) {
                this.cache.delete(userUuid);
                this.cache.set(userUuid, {
                    profile,
                    expiresAt: Date.now() + TTL_MS,
                });
                // LRU 上限：逐出最旧（Map 头部）
                while (this.cache.size > MAX_SIZE) {
                    const oldest = this.cache.keys().next();
                    if (oldest.done) break;
                    this.cache.delete(oldest.value);
                }
            }
        } catch (e) {
            // 解析失败不缓存、不抛错（下次仍 miss，事件降级为无画像属性）
            Logger.debug(
                `Umami user profile resolve failed for ${userUuid}: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            );
        } finally {
            this.inFlight.delete(userUuid);
        }
    }
}

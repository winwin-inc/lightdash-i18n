import fetch from 'node-fetch';
import Logger from '../../logging/logger';
import { buildPayload } from './payload';
import { UmamiConfig, UmamiEvent, UmamiPropertyValue } from './types';
import { UmamiUserResolver, UserProfileCache } from './userProfileCache';

const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_SIZE = 20;
const MAX_QUEUE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 3000;
const USER_AGENT = 'LightdashTelemetry/1.0 (+server)';

/** 服务端响应 body 只有 success|ok|空 视为成功，其余（如 project_token_error）只 debug */
const isSuccessResponseBody = (body: string): boolean => {
    const normalized = body.trim().toLowerCase();
    return normalized === '' || normalized === 'success' || normalized === 'ok';
};

/** 只有长得像 uuid 的 distinct_id 才查用户画像，避免对 'server' / 'anon:...' 空打 DB */
const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
    );

/**
 * 自建 Umami 上报客户端：内存队列，每 2s 或攒满 20 条批量 flush（data_list）。
 * 永不抛错、永不阻塞调用方；disabled 时 track/flush 直接早退、零外发。
 */
export class UmamiAnalytics {
    private readonly config: UmamiConfig;

    private readonly userProfileCache: UserProfileCache =
        new UserProfileCache();

    private queue: UmamiEvent[] = [];

    private flushTimer: NodeJS.Timeout | undefined;

    private isFlushing = false;

    constructor(config: UmamiConfig) {
        this.config = config;
        if (this.config.enabled) {
            this.flushTimer = setInterval(() => {
                void this.flush();
            }, FLUSH_INTERVAL_MS);
            // 不阻塞进程退出
            this.flushTimer.unref();
        }
    }

    /** 注入用户画像解析器（App/SchedulerApp 在 models 就绪后调用） */
    setUserResolver(resolver: UmamiUserResolver): void {
        this.userProfileCache.setUserResolver(resolver);
    }

    /** 入队一条事件；同步、永不抛错。命中画像时补充 user_email 等属性 */
    track(event: UmamiEvent): void {
        if (!this.config.enabled) {
            return;
        }
        try {
            const enriched = this.withUserProfile(event);
            this.queue.push(enriched);
            // 队列上限：超限丢最旧
            while (this.queue.length > MAX_QUEUE_SIZE) {
                this.queue.shift();
            }
            if (this.queue.length >= FLUSH_BATCH_SIZE) {
                void this.flush();
            }
        } catch (e) {
            Logger.debug(
                `Umami track failed: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            );
        }
    }

    /** 立即清空队列并上报；失败只 debug，不抛错，整批放回队首重试 */
    async flush(): Promise<void> {
        if (!this.config.enabled || this.isFlushing) {
            return;
        }
        const batch = this.queue;
        this.queue = [];
        if (batch.length === 0) {
            return;
        }
        this.isFlushing = true;
        try {
            const body = buildPayload(batch);
            const separator = this.config.endpoint?.includes('?') ? '&' : '?';
            const url = `${
                this.config.endpoint
            }${separator}project=${encodeURIComponent(
                this.config.project ?? '',
            )}&token=${encodeURIComponent(this.config.token ?? '')}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body,
                timeout: REQUEST_TIMEOUT_MS,
            });
            const responseBody = await response.text();
            if (response.ok && isSuccessResponseBody(responseBody)) {
                Logger.debug(`Umami flushed ${batch.length} events`);
            } else {
                Logger.debug(
                    `Umami flush rejected (status=${response.status}): ${responseBody}`,
                );
                // 配置类错误（project/token）重试无意义；网络/5xx 放回队首
                if (response.ok || response.status >= 500) {
                    this.requeue(batch);
                }
            }
        } catch (e) {
            Logger.debug(
                `Umami flush failed: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            );
            this.requeue(batch);
        } finally {
            this.isFlushing = false;
        }
    }

    /** 失败批次放回队首，受队列上限约束（没有任何冲销） */
    private requeue(batch: UmamiEvent[]): void {
        this.queue = [...batch, ...this.queue];
        while (this.queue.length > MAX_QUEUE_SIZE) {
            this.queue.shift();
        }
    }

    /** 停止定时器并清空余量（优雅关停用） */
    async close(): Promise<void> {
        if (this.flushTimer !== undefined) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        // 等正在飞的 flush 结束，否则这次 flush 会直接早退，把残余队列留在内存里
        while (this.isFlushing) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 10);
            });
        }
        await this.flush();
    }

    /** 画像命中则补属性；miss 不补（不阻塞） */
    private withUserProfile(event: UmamiEvent): UmamiEvent {
        if (!isUuid(event.distinctId)) {
            return event;
        }
        // user_uuid 与 distinct_id 同值，但落成属性才能在 umamiq 里按人聚合
        // （实体维度缺失时只能回落 distinct_id，避免两者混用造成重复计数）
        const properties: Record<string, UmamiPropertyValue> = {
            ...event.properties,
            user_uuid: event.distinctId,
        };
        const profile = this.userProfileCache.get(event.distinctId);
        if (profile === null) {
            return { ...event, properties };
        }
        if (profile.email !== null && profile.email !== '') {
            properties.user_email = profile.email;
        }
        if (profile.name !== null && profile.name !== '') {
            properties.user_name = profile.name;
        }
        if (profile.orgId !== null && profile.orgId !== '') {
            properties.org_id = profile.orgId;
        }
        if (profile.orgName !== null && profile.orgName !== '') {
            properties.org_name = profile.orgName;
        }
        return { ...event, properties };
    }
}

import fetch from 'node-fetch';
import Logger from '../../logging/logger';
import { DedupeWindow } from './dedupeWindow';
import { HIGH_FREQUENCY_EVENTS } from './mapping';
import { buildPayload } from './payload';
import { UmamiConfig, UmamiEvent, UmamiPropertyValue } from './types';
import { UmamiUserResolver, UserProfileCache } from './userProfileCache';

// 只减少 HTTP 请求数，不减少行数；代价是进程被 kill 时最多丢 5s 的事件
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BATCH_SIZE = 50;
const MAX_QUEUE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 3000;
// 实测（2026-11-24，dev 适配层）：UA 必须像浏览器。
// 含 "server" 的 UA（如 `... (+server)`、`LightdashServer/1.0`）会被 Umami/isbot
// 当机器人直接丢弃——适配层仍回 success，但库里没有数据，极难排查。
const USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'LightdashTelemetry/1.0';

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
 * 后端 profile_set 去重键：同一（`distinct_id` × UTC 月份）只发一次。
 *
 * 为什么按月：Umami 的 session key = uuid(站点, 客户端 IP, UA, salt, distinct_id)，
 * 而 salt 缺省按月轮换 → 跨月就是一个新会话，必须重新写一次 session_data。
 * 为什么按进程：后端 IP 随 pod 迁移变化 → 新会话，同理需要重发；
 * 进程重启后 Map 自然清空，正好覆盖这个场景（且内存上限 = 用户数）。
 */
export const profileDedupeKey = (distinctId: string, now: Date): string =>
    `${distinctId}|${now.toISOString().slice(0, 7)}`;

/**
 * 自建 Umami 上报客户端：内存队列，每 5s 或攒满 50 条批量 flush（data_list）。
 * 永不抛错、永不阻塞调用方；disabled 时 track/flush 直接早退、零外发。
 * query_executed 专属降量：先采样（sampleRate）再去重（dedupeSeconds），均在入队前。
 * 首个命中白名单的事件会顺带发一条 profile_set（写会话属性，每个用户每月一次）。
 */
export class UmamiAnalytics {
    private readonly config: UmamiConfig;

    private readonly userProfileCache: UserProfileCache =
        new UserProfileCache();

    private readonly dedupeWindow = new DedupeWindow();

    /** distinctId → 已发过 profile 的去重键（见 profileDedupeKey） */
    private readonly profileSent = new Map<string, string>();

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
            // 降量顺序：采样 → 去重 → 画像补充 → 入队；任一步骤异常都不会入队也不抛错
            if (this.isSampledOut(event) || this.isDuplicate(event)) {
                return;
            }
            const enriched = this.withUserProfile(event);
            this.queue.push(enriched);
            // 队列上限：超限丢最旧
            while (this.queue.length > MAX_QUEUE_SIZE) {
                this.queue.shift();
            }
            // 后端会话也要能读出「这人是谁」：每个用户每月补一条 profile_set
            this.maybePushProfile(enriched);
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

    /**
     * 后端 profile_set：给服务端会话写一份「这人是谁」的画像。
     *
     * - 只对真 uuid（真实用户）发，`server` / `anon:*` 跳过；
     * - 画像**直接读 UserProfileCache**，不看事件自身属性：高频事件会被
     *   withUserProfile 裁掉 user_name/org_name，照抄事件属性会导致会话属性缺名字；
     * - 缓存未就绪（冷启动第一条）不发，否则一条只有 uuid 的画像会占掉整月去重键；
     * - 每用户每月一次（见 profileDedupeKey），成本约 1 条报文 + ~7 行 session_data；
     * - 写的是**服务端会话**（session key 含 IP/UA），不会覆盖浏览器会话的属性。
     */
    private maybePushProfile(event: UmamiEvent): void {
        if (!isUuid(event.distinctId)) {
            return;
        }
        const profile = this.userProfileCache.get(event.distinctId);
        if (profile === null) {
            return;
        }
        const now = new Date(event.time ?? Date.now());
        const key = profileDedupeKey(event.distinctId, now);
        if (this.profileSent.get(event.distinctId) === key) {
            return;
        }
        const properties: Record<string, UmamiPropertyValue> = {
            user_uuid: event.distinctId,
        };
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
        // 谁触发了这条画像：取当前事件的 client（web / lightdash-cli / mcp / scheduler …）
        const { client } = event.properties;
        if (typeof client === 'string' && client !== '') {
            properties.client = client;
        }
        properties.env = this.config.environment;
        // 会话来源：后端进程写的会话恒为 server（前端那条是 web），见 docs §4.4
        properties.source = 'server';
        this.profileSent.set(event.distinctId, key);
        this.queue.push({
            kind: 'profile',
            event: 'profile_set',
            distinctId: event.distinctId,
            ...(event.anonymousId !== undefined
                ? { anonymousId: event.anonymousId }
                : {}),
            time: event.time,
            properties,
        });
    }

    /** query_executed 专属采样：rate=1 恒不丢（Math.random() 恒 < 1）；rate=0 恒丢 */
    private isSampledOut(event: UmamiEvent): boolean {
        if (event.event !== 'query_executed') {
            return false;
        }
        return Math.random() >= this.config.sampleRate;
    }

    /** query_executed 专属去重：窗口内同 distinctId+事件+图表/项目 只放行首条 */
    private isDuplicate(event: UmamiEvent): boolean {
        if (
            event.event !== 'query_executed' ||
            this.config.dedupeSeconds <= 0
        ) {
            return false;
        }
        const key = `${event.distinctId}|${event.event}|${
            event.properties.chart_id ?? event.properties.project_id ?? ''
        }`;
        return this.dedupeWindow.shouldSkip(key, this.config.dedupeSeconds);
    }

    /**
     * 画像命中则补属性；miss 不补（不阻塞）。
     * 高频事件只补 user_uuid/user_email/org_id（user_name/org_name 行数大、价值低，不补）。
     */
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
        const isHighFrequency = HIGH_FREQUENCY_EVENTS.has(event.event);
        if (profile.email !== null && profile.email !== '') {
            properties.user_email = profile.email;
        }
        if (!isHighFrequency && profile.name !== null && profile.name !== '') {
            properties.user_name = profile.name;
        }
        if (profile.orgId !== null && profile.orgId !== '') {
            properties.org_id = profile.orgId;
        }
        if (
            !isHighFrequency &&
            profile.orgName !== null &&
            profile.orgName !== ''
        ) {
            properties.org_name = profile.orgName;
        }
        return { ...event, properties };
    }
}

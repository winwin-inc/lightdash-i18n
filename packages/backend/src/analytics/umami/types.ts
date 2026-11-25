/** 属性值：Umami 事件属性只接受这三种标量（布尔需转成 'true'/'false' 的请在调用侧处理） */
export type UmamiPropertyValue = string | number | boolean;

/**
 * 单条埋点事件（内存表示，camelCase）。
 * 发送时由 payload.ts 转成 sensors 兼容的 snake_case 报文。
 */
export type UmamiEvent = {
    /**
     * 报文类型（sensors 语义）：
     * - `track`（缺省）→ `type:'track'` + `event`，落成命名事件；
     * - `profile` → `type:'profile_set'`、**不带 `event`**，适配层翻成 Umami identify
     *   写 `session_data`（会话属性），不产生事件行。
     */
    kind?: 'track' | 'profile';
    /** 事件名，如 dashboard_view（kind='profile' 时无意义，仅作占位） */
    event: string;
    /** 去重实体 id（一般是 userUuid；回落 'server'） */
    distinctId: string;
    /** 可选匿名 id */
    anonymousId?: string;
    /** 毫秒时间戳；缺省由发送侧取当前时间 */
    time?: number;
    /** 事件属性（已裁剪：无空串/undefined/null 值） */
    properties: Record<string, UmamiPropertyValue>;
};

/**
 * Umami 上报配置（来自 parseConfig 的 umami 段）。
 * enabled=false 时任何 track/flush 都不产生网络请求。
 */
export type UmamiConfig = {
    enabled: boolean;
    endpoint: string | null;
    project: string | null;
    token: string | null;
    /** 缺省取 lightdashConfig.mode */
    environment: string;
    /** query_executed 去重窗口秒数；0 = 关闭去重。缺省/非法值 300 */
    dedupeSeconds: number;
    /** query_executed 采样率（0–1）；1 = 不采样。缺省/非法值 1，越界 clamp */
    sampleRate: number;
};

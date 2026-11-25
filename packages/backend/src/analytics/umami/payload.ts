import { VERSION } from '../../version';
import { UmamiEvent, UmamiPropertyValue } from './types';

/** 字符串属性按 Unicode 码点截断（中文安全），上限 100 */
export const truncateValue = (value: string, max = 100): string =>
    Array.from(value).slice(0, max).join('');

/**
 * 清洗并裁剪属性：空串 / undefined / null 的属性直接丢弃；
 * 布尔统一转 'true'/'false'（Umami 的 event_data 只列 string/number，
 * 直接发 boolean 会让该键筛不出来）；字符串按码点截断 100。
 */
export const pickProperties = (
    properties: Record<string, UmamiPropertyValue | null | undefined>,
): Record<string, UmamiPropertyValue> =>
    Object.entries(properties).reduce<Record<string, UmamiPropertyValue>>(
        (result, [key, value]) => {
            if (value === undefined || value === null || value === '') {
                return result;
            }
            let normalized: UmamiPropertyValue = value;
            if (typeof value === 'boolean') {
                normalized = value ? 'true' : 'false';
            } else if (typeof value === 'string') {
                normalized = truncateValue(value);
            }
            return { ...result, [key]: normalized };
        },
        {},
    );

/** UTF-8 安全 base64 + urlencode（中文不会触发 InvalidCharacterError / 拆坏 body） */
export const toUtf8Base64UrlEncoded = (value: unknown): string =>
    encodeURIComponent(
        Buffer.from(JSON.stringify(value), 'utf8').toString('base64'),
    );

/**
 * 内存事件 → sensors 兼容报文（snake_case 字段名）。
 * 时间缺省取当前毫秒时间戳。
 *
 * - `track`：`type:'track'` + `event`，落命名事件；
 * - `profile`：`type:'profile_set'`、**不带 `event`**——适配层靠 `type` 判定是否
 *   翻成 Umami identify（写 `session_data`）。写成 track + event:'profile_set'
 *   只会落一条事件行，会话属性全丢（2026-11-25 实测）。
 */
export const toWireEvent = (event: UmamiEvent): Record<string, unknown> => {
    const base: Record<string, unknown> = {
        distinct_id: event.distinctId,
        ...(event.anonymousId !== undefined
            ? { anonymous_id: event.anonymousId }
            : {}),
        time: event.time ?? Date.now(),
        // VERSION 来自 require('../package.json')，是 any → 显式转 string
        lib: { $lib: 'LightdashServer', $lib_version: String(VERSION) },
    };
    if (event.kind === 'profile') {
        return {
            ...base,
            type: 'profile_set',
            properties: pickProperties(event.properties),
        };
    }
    return {
        ...base,
        type: 'track',
        event: event.event,
        properties: pickProperties(event.properties),
    };
};

/**
 * 纯函数：把一批事件组装成 urlencoded body。
 * 单条 → `data=<base64(json)>`；多条 → `data_list=<base64(array)>&gzip=0`。
 */
export const buildPayload = (events: UmamiEvent[]): string => {
    if (events.length === 0) {
        return '';
    }
    if (events.length === 1) {
        return `data=${toUtf8Base64UrlEncoded(toWireEvent(events[0]))}`;
    }
    return `data_list=${toUtf8Base64UrlEncoded(
        events.map(toWireEvent),
    )}&gzip=0`;
};

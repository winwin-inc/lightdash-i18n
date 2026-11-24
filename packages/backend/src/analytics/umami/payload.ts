import { VERSION } from '../../version';
import { UmamiEvent, UmamiPropertyValue } from './types';

/** 字符串属性按 Unicode 码点截断（中文安全），上限 100 */
export const truncateValue = (value: string, max = 100): string =>
    Array.from(value).slice(0, max).join('');

/**
 * 清洗并裁剪属性：空串 / undefined / null 的属性直接丢弃；
 * 字符串属性按码点截断 100。返回值可直接进 JSON。
 */
export const pickProperties = (
    properties: Record<string, UmamiPropertyValue | null | undefined>,
): Record<string, UmamiPropertyValue> =>
    Object.entries(properties).reduce<Record<string, UmamiPropertyValue>>(
        (result, [key, value]) => {
            if (value === undefined || value === null || value === '') {
                return result;
            }
            return {
                ...result,
                [key]: typeof value === 'string' ? truncateValue(value) : value,
            };
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
 */
export const toWireEvent = (event: UmamiEvent): Record<string, unknown> => ({
    distinct_id: event.distinctId,
    ...(event.anonymousId !== undefined
        ? { anonymous_id: event.anonymousId }
        : {}),
    time: event.time ?? Date.now(),
    type: 'track',
    event: event.event,
    lib: { $lib: 'LightdashServer', $lib_version: VERSION },
    properties: pickProperties(event.properties),
});

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

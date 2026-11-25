import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildCollectUrl,
    encodeBatchBody,
    encodeBody,
    encodeUtf8Base64,
    send,
    truncateByCodePoints,
    type UmamiSendConfig,
} from './transport';

const config: UmamiSendConfig = {
    endpoint: 'https://collect.banmahui.cn/api/gp',
    project: 'lightdash-internal',
    token: 'tok=en&x',
};

const decodeBase64Utf8 = (base64: string): string => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
};

describe('encodeUtf8Base64', () => {
    it('中文名不抛错（btoa 直编中文会抛 InvalidCharacterError）', () => {
        expect(() => encodeUtf8Base64('中文组织名&客户')).not.toThrow();
        // 中 (U+4E2D) 文 (U+6587) 的 UTF-8 字节 → 5Lit5paH
        expect(encodeUtf8Base64('中文')).toBe('5Lit5paH');
    });

    it('ascii 兼容 btoa', () => {
        expect(encodeUtf8Base64('plain')).toBe(btoa('plain'));
    });
});

describe('truncateByCodePoints', () => {
    it('中文名按码点截断', () => {
        const long = '一'.repeat(120);
        const truncated = truncateByCodePoints(long, 100);
        expect(Array.from(truncated).length).toBe(100);
    });

    it('短字符串原样返回', () => {
        expect(truncateByCodePoints('短名', 100)).toBe('短名');
    });

    it('代理对（emoji）不被拦腰截断', () => {
        const emoji = '👍'.repeat(5); // 每个占 2 个 UTF-16 unit
        const truncated = truncateByCodePoints(emoji, 2);
        expect(Array.from(truncated)).toEqual(['👍', '👍']);
    });
});

describe('encodeBody / encodeBatchBody', () => {
    it('urlencode 正确：base64 的 +/= 全部转义，可无损还原中文', () => {
        const payload = { org_name: '中文&组织=x+y', page: 'dashboard' };
        const body = encodeBody(payload);
        expect(body).toMatch(/^data=[A-Za-z0-9%]+$/);
        const json = decodeBase64Utf8(decodeURIComponent(body.slice('data='.length)));
        expect(JSON.parse(json)).toEqual(payload);
    });

    it('DataList 2 条一包：data_list=<base64(array)>&gzip=0', () => {
        const events = [
            { event: 'page_view', properties: { org_name: '中文组织' } },
            { event: '$AppViewScreen', properties: { $title: '看板详情' } },
        ];
        const body = encodeBatchBody(events);
        expect(body).toMatch(/^data_list=[A-Za-z0-9%]+&gzip=0$/);
        const json = decodeBase64Utf8(
            decodeURIComponent(body.slice('data_list='.length, -'&gzip=0'.length)),
        );
        const decoded: unknown[] = JSON.parse(json);
        expect(decoded).toHaveLength(2);
        expect(decoded[0]).toEqual(events[0]);
        expect(decoded[1]).toEqual(events[1]);
    });
});

describe('buildCollectUrl', () => {
    it('endpoint?project&token，值经 encodeURIComponent', () => {
        expect(buildCollectUrl(config)).toBe(
            'https://collect.banmahui.cn/api/gp?project=lightdash-internal&token=tok%3Den%26x',
        );
    });
});

describe('send', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('POST x-www-form-urlencoded + keepalive + credentials omit，永不抛错', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
        vi.stubGlobal('fetch', fetchMock);

        expect(() => send(config, 'data=abc')).not.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [
            string,
            RequestInit,
        ];
        expect(url).toBe(buildCollectUrl(config));
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({
            'Content-Type': 'application/x-www-form-urlencoded',
        });
        expect(init.keepalive).toBe(true);
        expect(init.credentials).toBe('omit');
        expect(init.mode).toBe('cors');
        expect(init.body).toBe('data=abc');
    });

    it('fetch reject / throw 都静默', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);
        expect(() => send(config, 'data=abc')).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const throwing = vi.fn(() => {
            throw new Error('boom');
        });
        vi.stubGlobal('fetch', throwing);
        expect(() => send(config, 'data=abc')).not.toThrow();
    });

    it('页面隐藏时改用 sendBeacon(Blob)', () => {
        const beacon = vi.fn(() => true);
        vi.stubGlobal('fetch', vi.fn());
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });
        vi.stubGlobal('navigator', { ...window.navigator, sendBeacon: beacon });

        send(config, 'data=abc');
        expect(beacon).toHaveBeenCalledTimes(1);
        const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
        expect(url).toBe(buildCollectUrl(config));
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/x-www-form-urlencoded');

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
        });
    });
});

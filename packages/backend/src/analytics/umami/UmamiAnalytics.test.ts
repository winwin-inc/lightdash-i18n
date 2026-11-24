import fetch from 'node-fetch';
import { UmamiAnalytics } from './UmamiAnalytics';
import { UmamiConfig } from './types';

jest.mock('node-fetch', () => jest.fn());

const fetchMock = fetch as unknown as jest.Mock;

const enabledConfig = (): UmamiConfig => ({
    enabled: true,
    endpoint: 'https://collect.example.com/api/gp',
    project: 'lightdash-internal',
    token: 'tok',
    environment: 'production',
});

const makeEvent = (i: number) => ({
    event: 'query_executed',
    distinctId: `user-${i}`,
    properties: { project_id: 'p' },
});

describe('UmamiAnalytics', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => 'success',
        });
    });

    it('does nothing (no fetch, no timer) when disabled', () => {
        const umami = new UmamiAnalytics({
            ...enabledConfig(),
            enabled: false,
        });
        umami.track(makeEvent(1));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('tracks never throw even if fetch rejects', async () => {
        fetchMock.mockRejectedValue(new Error('network down'));
        const umami = new UmamiAnalytics(enabledConfig());
        expect(() => umami.track(makeEvent(1))).not.toThrow();
        await expect(umami.flush()).resolves.toBeUndefined();
    });

    it('sends data_list batch with project/token query params and UA header', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        for (let i = 0; i < 20; i += 1) {
            umami.track(makeEvent(i));
        }
        await umami.flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(
            'https://collect.example.com/api/gp?project=lightdash-internal&token=tok',
        );
        expect(options.method).toBe('POST');
        expect(options.timeout).toBe(3000);
        // 必须是浏览器形态：含 "server" 的 UA 会被 Umami/isbot 丢弃
        expect(options.headers['User-Agent']).toContain('Mozilla/5.0');
        expect(options.headers['User-Agent']).not.toMatch(/server/i);
        expect(options.headers['Content-Type']).toBe(
            'application/x-www-form-urlencoded',
        );
        expect(options.body).toMatch(/^data_list=.+&gzip=0$/);
    });

    it('auto-flushes at 20 queued events without manual flush', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        for (let i = 0; i < 20; i += 1) {
            umami.track(makeEvent(i));
        }
        // flush 是异步触发的，让微任务跑完
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('drops oldest events beyond the 200 cap while a flush is in flight', async () => {
        let resolveFetch: (value: {
            ok: boolean;
            status: number;
            text: () => Promise<string>;
        }) => void = () => undefined;
        fetchMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        const umami = new UmamiAnalytics(enabledConfig());
        for (let i = 0; i < 250; i += 1) {
            umami.track(makeEvent(i));
        }
        // 前 20 条已进 pending 的 flush；此后队列涨到 230 → 裁剪到 200
        resolveFetch({ ok: true, status: 200, text: async () => 'success' });
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        await umami.flush();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [, options] = fetchMock.mock.calls[1];
        const wire = JSON.parse(
            Buffer.from(
                decodeURIComponent(
                    options.body
                        .slice('data_list='.length)
                        .replace(/&gzip=0$/, ''),
                ),
                'base64',
            ).toString('utf8'),
        );
        expect(wire).toHaveLength(200);
        expect(wire[0].distinct_id).toBe('user-50'); // 最旧的 user-20..49 被丢
        expect(wire[199].distinct_id).toBe('user-249');
    });

    it('treats success/ok/empty bodies as success and other bodies as debug-only failure', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => 'ok',
        });
        umami.track(makeEvent(1));
        await expect(umami.flush()).resolves.toBeUndefined();

        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: async () => 'project_token_error',
        });
        umami.track(makeEvent(2));
        await expect(umami.flush()).resolves.toBeUndefined(); // 不抛错
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('enriches events with cached user profile', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.setUserResolver(async () => ({
            email: 'a@b.com',
            name: '张三',
            orgId: 'org-1',
            orgName: '品牌组织',
        }));
        umami.track({
            event: 'query_executed',
            distinctId: '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1',
            properties: { project_id: 'p' },
        });
        // 首次 miss（异步 resolver）不阻塞；等画像就绪后下一条事件才带画像属性
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        umami.track({
            event: 'query_executed',
            distinctId: '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1',
            properties: { project_id: 'p' },
        });
        await umami.flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, options] = fetchMock.mock.calls[0];
        expect(options.body).toMatch(/^data_list=/);
        const wire = JSON.parse(
            Buffer.from(
                decodeURIComponent(
                    options.body
                        .slice('data_list='.length)
                        .replace(/&gzip=0$/, ''),
                ),
                'base64',
            ).toString('utf8'),
        );
        // 第一条在 miss 时不带画像；第二条（缓存就绪后）带
        expect(wire[0].properties).not.toHaveProperty('user_email');
        expect(wire[1].properties).toMatchObject({
            user_email: 'a@b.com',
            user_name: '张三',
            org_id: 'org-1',
            org_name: '品牌组织',
        });
    });

    it('skips profile lookup for non-uuid distinct ids (server fallback)', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        const resolver = jest.fn(async () => null);
        umami.setUserResolver(resolver);
        umami.track({
            event: 'query_error',
            distinctId: 'server',
            properties: {},
        });
        umami.track({
            event: 'query_error',
            distinctId: 'anon:install-1',
            properties: {},
        });
        await umami.flush();
        expect(resolver).not.toHaveBeenCalled();
    });

    it('flush remaining events on close and stops the timer', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.track(makeEvent(1));
        await umami.close();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // close 后再 track/flush 不再发请求（timer 清理且 flush 幂等）
        fetchMock.mockClear();
        await umami.close();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

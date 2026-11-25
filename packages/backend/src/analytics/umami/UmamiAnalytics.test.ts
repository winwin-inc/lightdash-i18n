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
    dedupeSeconds: 300,
    sampleRate: 1,
});

const makeEvent = (i: number) => ({
    event: 'query_executed',
    distinctId: `user-${i}`,
    properties: { project_id: 'p' },
});

/** 解码 data_list body 成 wire 事件数组 */
const parseWire = (body: string): Array<Record<string, unknown>> =>
    JSON.parse(
        Buffer.from(
            decodeURIComponent(
                body.slice('data_list='.length).replace(/&gzip=0$/, ''),
            ),
            'base64',
        ).toString('utf8'),
    );

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

    it('auto-flushes at 50 queued events without manual flush', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        for (let i = 0; i < 50; i += 1) {
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
        // 前 50 条已进 pending 的 flush；此后队列涨到 200（250-50），不再裁剪
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

    it('enriches low-frequency events with the full cached user profile', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.setUserResolver(async () => ({
            email: 'a@b.com',
            name: '张三',
            orgId: 'org-1',
            orgName: '品牌组织',
        }));
        umami.track({
            event: 'dashboard_view',
            distinctId: '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1',
            properties: { project_id: 'p' },
        });
        // 首次 miss（异步 resolver）不阻塞；等画像就绪后下一条事件才带画像属性
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        umami.track({
            event: 'dashboard_view',
            distinctId: '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1',
            properties: { project_id: 'p' },
        });
        await umami.flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, options] = fetchMock.mock.calls[0];
        expect(options.body).toMatch(/^data_list=/);
        const wire = parseWire(options.body);
        // 第一条在 miss 时不带画像；第二条（缓存就绪后）带全量画像（低频事件）
        expect(wire[0].properties).not.toHaveProperty('user_email');
        expect(wire[1].properties).toMatchObject({
            user_email: 'a@b.com',
            user_name: '张三',
            org_id: 'org-1',
            org_name: '品牌组织',
        });
    });

    it('high-frequency events get user_uuid/user_email/org_id but NOT user_name/org_name', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.setUserResolver(async () => ({
            email: 'a@b.com',
            name: '张三',
            orgId: 'org-1',
            orgName: '品牌组织',
        }));
        const uuid = '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1';
        umami.track({
            event: 'query_executed',
            distinctId: uuid,
            properties: { project_id: 'p1' },
        });
        // 等画像缓存就绪；换 project_id 避免触发 query_executed 去重
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        umami.track({
            event: 'query_executed',
            distinctId: uuid,
            properties: { project_id: 'p2' },
        });
        await umami.flush();
        const wire = parseWire(fetchMock.mock.calls[0][1].body);
        expect(wire).toHaveLength(2);
        expect(wire[1].properties).toMatchObject({
            user_uuid: uuid,
            user_email: 'a@b.com',
            org_id: 'org-1',
        });
        expect(wire[1].properties).not.toHaveProperty('user_name');
        expect(wire[1].properties).not.toHaveProperty('org_name');
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

    describe('query_executed dedupe', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('drops a repeated query_executed within the window', async () => {
            const umami = new UmamiAnalytics(enabledConfig());
            umami.track(makeEvent(1));
            umami.track(makeEvent(1)); // 同 distinctId+event+project_id → 去重命中
            umami.track(makeEvent(2)); // 不同 distinctId → 放行
            await umami.flush();
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(2);
            expect(wire.map((e) => e.distinct_id)).toEqual([
                'user-1',
                'user-2',
            ]);
        });

        it('allows query_executed again after the window expires', async () => {
            const base = 1_700_000_000_000;
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(base);
            const umami = new UmamiAnalytics(enabledConfig());
            umami.track(makeEvent(1));
            nowSpy.mockReturnValue(base + 301_000); // 越过 300s 窗口
            umami.track(makeEvent(1));
            await umami.flush();
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(2);
        });

        it('keeps query_executed with different chart_id/project_id keys', async () => {
            const umami = new UmamiAnalytics(enabledConfig());
            umami.track({
                event: 'query_executed',
                distinctId: 'u',
                properties: { chart_id: 'c1' },
            });
            umami.track({
                event: 'query_executed',
                distinctId: 'u',
                properties: { chart_id: 'c2' },
            });
            // 无 chart_id 时回落 project_id 作为 key
            umami.track({
                event: 'query_executed',
                distinctId: 'u',
                properties: { project_id: 'p1' },
            });
            umami.track({
                event: 'query_executed',
                distinctId: 'u',
                properties: {},
            });
            await umami.flush();
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(4);
        });

        it('keeps duplicates when dedupeSeconds=0 (disabled)', async () => {
            const umami = new UmamiAnalytics({
                ...enabledConfig(),
                dedupeSeconds: 0,
            });
            umami.track(makeEvent(1));
            umami.track(makeEvent(1));
            umami.track(makeEvent(1));
            await umami.flush();
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(3);
        });

        it('does not dedupe non-query_executed events', async () => {
            const umami = new UmamiAnalytics(enabledConfig());
            umami.track({
                event: 'dashboard_view',
                distinctId: 'u',
                properties: {},
            });
            umami.track({
                event: 'dashboard_view',
                distinctId: 'u',
                properties: {},
            });
            await umami.flush();
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(2);
        });
    });

    describe('query_executed sampling', () => {
        it('drops all query_executed when sampleRate=0', async () => {
            const umami = new UmamiAnalytics({
                ...enabledConfig(),
                sampleRate: 0,
            });
            for (let i = 0; i < 5; i += 1) {
                umami.track(makeEvent(i));
            }
            await umami.flush();
            // 全部被采样丢弃 → 队列空 → flush 早退，不发请求
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('keeps all query_executed when sampleRate=1 (default)', async () => {
            const umami = new UmamiAnalytics({
                ...enabledConfig(),
                sampleRate: 1,
            });
            for (let i = 0; i < 5; i += 1) {
                umami.track(makeEvent(i));
            }
            await umami.flush();
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(5);
        });

        it('does not sample non-query_executed events even at sampleRate=0', async () => {
            const umami = new UmamiAnalytics({
                ...enabledConfig(),
                sampleRate: 0,
            });
            umami.track({
                event: 'dashboard_view',
                distinctId: 'u',
                properties: {},
            });
            umami.track({
                event: 'dashboard_view',
                distinctId: 'u',
                properties: {},
            });
            await umami.flush();
            const wire = parseWire(fetchMock.mock.calls[0][1].body);
            expect(wire).toHaveLength(2);
        });
    });
});

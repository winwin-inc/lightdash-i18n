import fetch from 'node-fetch';
import { profileDedupeKey, UmamiAnalytics } from './UmamiAnalytics';
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

/** 解码 body（单条 data= / 批量 data_list=）成 wire 事件数组 */
const parseWire = (body: string): Array<Record<string, unknown>> => {
    const single = body.startsWith('data=');
    const raw = single
        ? body.slice('data='.length)
        : body.slice('data_list='.length).replace(/&gzip=0$/, '');
    const parsed = JSON.parse(
        Buffer.from(decodeURIComponent(raw), 'base64').toString('utf8'),
    ) as unknown;
    return (Array.isArray(parsed) ? parsed : [parsed]) as Array<
        Record<string, unknown>
    >;
};

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

    it('emits one backend profile_set per user per month (sensors profile semantics)', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.setUserResolver(async () => ({
            email: 'a@b.com',
            name: '张三',
            orgId: 'org-1',
            orgName: '品牌组织',
        }));
        const uuid = '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1';
        // 首条事件画像缓存还是空的 → 不发空 profile（否则会占掉本月去重键）
        umami.track({
            event: 'dashboard_view',
            distinctId: uuid,
            properties: {},
        });
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        umami.track({
            event: 'dashboard_view',
            distinctId: uuid,
            properties: {},
        });
        umami.track({ event: 'chart_view', distinctId: uuid, properties: {} });
        await umami.flush();

        const wire = parseWire(fetchMock.mock.calls[0][1].body);
        const profiles = wire.filter((e) => e.type === 'profile_set');
        expect(profiles).toHaveLength(1);
        expect(profiles[0]).not.toHaveProperty('event'); // 有 event 就变成普通事件
        expect(profiles[0].distinct_id).toBe(uuid);
        expect(profiles[0].properties).toMatchObject({
            user_uuid: uuid,
            user_email: 'a@b.com',
            user_name: '张三',
            org_id: 'org-1',
            org_name: '品牌组织',
            env: 'production',
            source: 'server',
        });
    });

    it('backend profile keeps user_name/org_name even when the first event is high-frequency', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.setUserResolver(async () => ({
            email: 'a@b.com',
            name: '张三',
            orgId: 'org-1',
            orgName: '品牌组织',
        }));
        const uuid = '9a1c2d3e-4f50-4a6b-8c7d-1e2f3a4b5c6d';
        // 首条事件命中高频（query_executed）：事件属性会被裁掉 name/org_name，
        // 但 profile 直接读画像缓存，必须仍是完整的
        umami.track({
            event: 'query_executed',
            distinctId: uuid,
            properties: { client: 'web', project_id: 'p1' },
        });
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        umami.track({
            event: 'query_executed',
            distinctId: uuid,
            properties: { client: 'web', project_id: 'p2' },
        });
        await umami.flush();
        const wire = parseWire(fetchMock.mock.calls[0][1].body);
        const profile = wire.find((e) => e.type === 'profile_set');
        expect(profile).toBeDefined();
        expect(profile?.properties).toMatchObject({
            user_uuid: uuid,
            user_email: 'a@b.com',
            user_name: '张三',
            org_id: 'org-1',
            org_name: '品牌组织',
            client: 'web',
            env: 'production',
            source: 'server',
        });
    });

    it('skips profile_set for non-user distinct ids (server / anon)', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.track({
            event: 'download_completed',
            distinctId: 'server',
            properties: { user_email: 'a@b.com' },
        });
        umami.track({
            event: 'download_completed',
            distinctId: 'anon:install-1',
            properties: { user_email: 'a@b.com' },
        });
        await umami.flush();
        const wire = parseWire(fetchMock.mock.calls[0][1].body);
        expect(wire.every((e) => e.type === 'track')).toBe(true);
    });

    it('profile() 直接补一条服务端会话画像（登录 identify 路径）', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        const uuid = '5b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
        umami.profile(uuid, {
            user_email: 'user@brandct.cn',
            user_name: '张帅波',
            client: 'web',
        });
        await umami.flush();
        const wire = parseWire(fetchMock.mock.calls[0][1].body);
        expect(wire).toHaveLength(1);
        expect(wire[0].type).toBe('profile_set');
        expect(wire[0].properties).toMatchObject({
            user_uuid: uuid,
            user_email: 'user@brandct.cn',
            user_name: '张帅波',
            client: 'web',
            env: 'production',
            source: 'server',
        });
    });

    it('profile() 与事件路径共用去重键：同月只发一次', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        const uuid = '5b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
        umami.profile(uuid, { user_email: 'a@b.com' });
        umami.profile(uuid, { user_email: 'a@b.com' });
        await umami.flush();
        const wire = parseWire(fetchMock.mock.calls[0][1].body);
        expect(wire.filter((e) => e.type === 'profile_set')).toHaveLength(1);
    });

    it('profile() 跳过非 uuid 与没有邮箱/组织的空画像', async () => {
        const umami = new UmamiAnalytics(enabledConfig());
        umami.profile('server', { user_email: 'a@b.com' });
        umami.profile('5b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', {});
        // 队列为空 → flush 不发请求
        await umami.flush();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('profileDedupeKey rolls over by UTC month', () => {
        const id = '0f47e88c-6e59-4f2f-a1e2-381bfa2d34b1';
        expect(profileDedupeKey(id, new Date('2026-11-25T10:00:00Z'))).toBe(
            profileDedupeKey(id, new Date('2026-11-01T00:00:00Z')),
        );
        expect(profileDedupeKey(id, new Date('2026-11-30T23:59:59Z'))).not.toBe(
            profileDedupeKey(id, new Date('2026-12-01T00:00:00Z')),
        );
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
        // 第三条是后端 profile_set（画像就绪后补发一次，写会话属性）
        expect(wire).toHaveLength(3);
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

import { buildPayload, pickProperties, truncateValue } from './payload';
import { UmamiEvent } from './types';

const baseEvent = (overrides: Partial<UmamiEvent> = {}): UmamiEvent => ({
    event: 'dashboard_view',
    distinctId: 'user-uuid',
    time: 1700000000000,
    properties: { org_id: 'org-1' },
    ...overrides,
});

describe('truncateValue', () => {
    it('truncates by unicode code points, not utf16 units', () => {
        // 50 个 emoji（每个占 2 个 utf16 单元）+ 60 个汉字 = 110 码点
        const emojis = '👍'.repeat(50);
        const han = '测'.repeat(60);
        const truncated = truncateValue(emojis + han);
        expect(Array.from(truncated)).toHaveLength(100);
        expect(truncated).not.toContain('\uDE4D'); // 没有拆坏代理对
    });

    it('keeps short strings intact', () => {
        expect(truncateValue('看板名')).toBe('看板名');
    });
});

describe('pickProperties', () => {
    it('drops empty string / undefined / null properties', () => {
        expect(
            pickProperties({
                a: 'value',
                b: '',
                c: undefined,
                d: 'ok',
            }),
        ).toEqual({ a: 'value', d: 'ok' });
    });

    it('truncates strings, keeps numbers, and stringifies booleans', () => {
        // Umami 的 event_data 只列 string/number；boolean 直接发会筛不出来
        expect(
            pickProperties({
                num_rows: 120,
                success: false,
                ok: true,
                long: 'x'.repeat(150),
            }),
        ).toEqual({
            num_rows: 120,
            success: 'false',
            ok: 'true',
            long: 'x'.repeat(100),
        });
    });
});

describe('buildPayload', () => {
    it('encodes a single event as data=<utf8 base64>', () => {
        const body = buildPayload([
            baseEvent({ properties: { org_name: '中文组织' } }),
        ]);
        expect(body).toMatch(/^data=/);
        const encoded = body.slice('data='.length);
        const json = Buffer.from(
            decodeURIComponent(encoded),
            'base64',
        ).toString('utf8');
        const wire = JSON.parse(json);
        expect(wire).toEqual({
            distinct_id: 'user-uuid',
            time: 1700000000000,
            type: 'track',
            event: 'dashboard_view',
            lib: expect.any(Object),
            properties: { org_name: '中文组织' },
        });
    });

    it('encodes multiple events as data_list=<utf8 base64>&gzip=0', () => {
        const body = buildPayload([baseEvent(), baseEvent()]);
        expect(body).toMatch(/^data_list=.+&gzip=0$/);
        const encoded = body.slice(
            'data_list='.length,
            body.length - '&gzip=0'.length,
        );
        const wire = JSON.parse(
            Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf8'),
        );
        expect(wire).toHaveLength(2);
    });

    it('survives unicode (中文/emoji) round trip', () => {
        const body = buildPayload([
            baseEvent({
                properties: { user_name: '张三👍', org_name: '品牌公司' },
            }),
        ]);
        const json = Buffer.from(
            decodeURIComponent(body.slice('data='.length)),
            'base64',
        ).toString('utf8');
        expect(JSON.parse(json).properties).toEqual({
            user_name: '张三👍',
            org_name: '品牌公司',
        });
    });

    it('returns empty body for empty queue', () => {
        expect(buildPayload([])).toBe('');
    });

    // 回归：写成 type:'track' + event:'profile_set' 会落成普通事件，
    // 适配层不写 session_data，Sessions 面板的属性为空（2026-11-25 dev 实测）
    it('encodes profile events as type=profile_set without an event name', () => {
        const body = buildPayload([
            baseEvent({
                kind: 'profile',
                event: 'profile_set',
                properties: { user_email: 'a@b.com', env: 'pre' },
            }),
        ]);
        // 单条就是 data=，不套 data_list
        expect(body).toMatch(/^data=/);
        const wire = JSON.parse(
            Buffer.from(
                decodeURIComponent(body.slice('data='.length)),
                'base64',
            ).toString('utf8'),
        );
        expect(wire.type).toBe('profile_set');
        expect(wire).not.toHaveProperty('event');
        expect(wire.properties).toEqual({ user_email: 'a@b.com', env: 'pre' });
    });

    it('keeps track events unchanged when kind is absent', () => {
        const body = buildPayload([baseEvent()]);
        const wire = JSON.parse(
            Buffer.from(
                decodeURIComponent(body.slice('data='.length)),
                'base64',
            ).toString('utf8'),
        );
        expect(wire.type).toBe('track');
        expect(wire.event).toBe('dashboard_view');
    });
});

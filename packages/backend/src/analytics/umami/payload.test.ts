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

    it('truncates string values and keeps numbers/booleans', () => {
        expect(
            pickProperties({
                num_rows: 120,
                success: false,
                long: 'x'.repeat(150),
            }),
        ).toEqual({ num_rows: 120, success: false, long: 'x'.repeat(100) });
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
});

import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LightdashAnalytics } from '../LightdashAnalytics';
import { UmamiAnalytics } from './UmamiAnalytics';
import { UmamiEvent } from './types';

jest.mock('node-fetch', () => jest.fn());

describe('LightdashAnalytics → Umami wiring', () => {
    const makeAnalytics = (umami: UmamiAnalytics) =>
        new LightdashAnalytics({
            lightdashConfig: lightdashConfigMock, // rudder.writeKey='' → rudder 早退
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
            umami,
        });

    const makeUmami = () => {
        const umami = new UmamiAnalytics({
            enabled: true,
            endpoint: 'https://collect.example.com/api/gp',
            project: 'p',
            token: 't',
            environment: 'production',
            dedupeSeconds: 0, // 不去重，wiring 测试只验证映射
            sampleRate: 1,
        });
        return umami;
    };

    it('forwards whitelisted events to umami BEFORE the rudder writeKey early-return', async () => {
        const umami = makeUmami();
        const spy = jest.spyOn(umami, 'track');
        const analytics = makeAnalytics(umami);

        analytics.track({
            event: 'dashboard.view',
            userId: 'u1',
            properties: {
                dashboardId: 'd1',
                projectId: 'p1',
                organizationId: 'o1',
                parametersCount: 0,
            },
        });

        expect(spy).toHaveBeenCalledTimes(1);
        const forwarded = spy.mock.calls[0][0] as UmamiEvent;
        expect(forwarded.event).toBe('dashboard_view');
        expect(forwarded.distinctId).toBe('u1');
        expect(forwarded.properties).toMatchObject({
            dashboard_id: 'd1',
            project_id: 'p1',
            org_id: 'o1',
            client: 'unknown', // 无 ALS 上下文
            app_version: expect.any(String),
        });
        // 属性瘦身：track 事件不再写 env（profile_set 预留）
        expect(forwarded.properties).not.toHaveProperty('env');

        await umami.close();
    });

    it('does not forward non-whitelisted events', async () => {
        const umami = makeUmami();
        const spy = jest.spyOn(umami, 'track');
        const analytics = makeAnalytics(umami);

        analytics.track({
            event: 'space.created',
            properties: {
                name: 'S',
                spaceId: 's1',
                projectId: 'p1',
                isPrivate: false,
                userAccessCount: 0,
                isNested: false,
            },
        });

        expect(spy).not.toHaveBeenCalled();
        await umami.close();
    });

    it('forwards mcp_tool_call with mcpClient passthrough', async () => {
        const umami = makeUmami();
        const spy = jest.spyOn(umami, 'track');
        const analytics = makeAnalytics(umami);

        analytics.track({
            event: 'mcp_tool_call',
            userId: 'u2',
            properties: {
                organizationId: 'o1',
                toolName: 'get_dashboard',
                authType: 'oauth',
                durationMs: 42,
                success: true,
                mcpClient: 'msy-x-cli',
            },
        });

        const forwarded = spy.mock.calls[0][0] as UmamiEvent;
        expect(forwarded.event).toBe('mcp_tool_call');
        expect(forwarded.properties).toMatchObject({
            tool_name: 'get_dashboard',
            mcp_client: 'msy-x-cli',
            auth_type: 'oauth',
            duration_ms: 42,
            success: true,
        });
        await umami.close();
    });

    it('mirrors identify() as a backend profile_set (login-only users get session props)', () => {
        const umami = makeUmami();
        const spy = jest.spyOn(umami, 'profile');
        const analytics = makeAnalytics(umami);

        analytics.identify({
            userId: '7a27052e-8f55-4758-bc88-7824c3834811',
            traits: {
                email: 'user@brandct.cn',
                first_name: '帅波',
                last_name: '张',
                is_tracking_anonymized: false,
            },
        });

        // 只登录、不产生后端事件的用户，靠这条补上服务端会话画像
        expect(spy).toHaveBeenCalledWith(
            '7a27052e-8f55-4758-bc88-7824c3834811',
            {
                user_email: 'user@brandct.cn',
                user_name: '帅波 张',
                client: 'unknown', // 无 ALS 上下文
            },
        );
    });

    it('identify() without umami injected does not throw', () => {
        const analytics = new LightdashAnalytics({
            lightdashConfig: lightdashConfigMock,
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
        });
        expect(() =>
            analytics.identify({
                userId: 'u1',
                traits: { email: 'a@b.com', is_tracking_anonymized: false },
            }),
        ).not.toThrow();
    });

    it('works without umami injected (no crash)', () => {
        const analytics = new LightdashAnalytics({
            lightdashConfig: lightdashConfigMock,
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
        });
        expect(() =>
            analytics.track({
                event: 'dashboard.view',
                userId: 'u',
                properties: {
                    dashboardId: 'd1',
                    projectId: 'p1',
                    organizationId: 'o1',
                    parametersCount: 0,
                },
            }),
        ).not.toThrow();
    });
});

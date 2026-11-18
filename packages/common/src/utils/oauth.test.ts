import {
    DEFAULT_DEVICE_LOGIN_HINT_DOMAINS,
    resolveDeviceLoginHint,
} from './oauth';

describe('resolveDeviceLoginHint', () => {
    it('OIDC 端点域名含微信关键词时提示微信扫码登录', () => {
        expect(
            resolveDeviceLoginHint(
                'https://login.work.weixin.qq.com/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用微信扫码登录。');
    });

    it('OIDC 端点域名含钉钉关键词时提示钉钉扫码登录', () => {
        expect(
            resolveDeviceLoginHint(
                'https://login.dingtalk.com/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用钉钉扫码登录。');
    });

    it('命中默认自建 SSO 映射：brand.* → 微信', () => {
        expect(
            resolveDeviceLoginHint(
                'https://brand.pre.banmahui.cn/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用微信扫码登录。');
    });

    it('命中默认自建 SSO 映射：线上品牌 brandct.com → 微信', () => {
        expect(
            resolveDeviceLoginHint(
                'https://brandct.com/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用微信扫码登录。');
    });

    it('命中默认自建 SSO 映射：admin.* → 钉钉', () => {
        expect(
            resolveDeviceLoginHint(
                'https://admin.banmahui.cn/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用钉钉扫码登录。');
    });

    it('自定义域名清单可覆盖默认映射', () => {
        expect(
            resolveDeviceLoginHint(
                'https://sso.custom.cn/.well-known/openid-configuration',
                { wechat: ['sso.custom.cn'], dingtalk: [] },
            ),
        ).toBe('本平台使用微信扫码登录。');
    });

    it('未命中任何映射时退到通用扫码提示', () => {
        expect(
            resolveDeviceLoginHint(
                'https://sso.unknown.example.com/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用扫码方式登录。');
    });

    it('未配置 OIDC 端点时退到通用扫码提示', () => {
        expect(resolveDeviceLoginHint(undefined)).toBe(
            '本平台使用扫码方式登录。',
        );
    });

    it('URL 非法时退到通用扫码提示', () => {
        expect(resolveDeviceLoginHint('not-a-url')).toBe(
            '本平台使用扫码方式登录。',
        );
    });

    it('默认映射表覆盖品牌预发/生产与内部 SSO 域名', () => {
        expect(DEFAULT_DEVICE_LOGIN_HINT_DOMAINS.wechat).toEqual([
            'brandct.com',
            'brand.pre.banmahui.cn',
            'brand.banmahui.cn',
        ]);
        expect(DEFAULT_DEVICE_LOGIN_HINT_DOMAINS.dingtalk).toEqual([
            'admin.banmahui.cn',
        ]);
    });
});

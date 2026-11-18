import { resolveDeviceLoginHint } from './oauth';

describe('resolveDeviceLoginHint', () => {
    it('OIDC 端点是微信域名时提示微信扫码登录', () => {
        expect(
            resolveDeviceLoginHint(
                'https://login.work.weixin.qq.com/wwopen/sso/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用微信扫码登录。');
    });

    it('OIDC 端点是钉钉域名时提示钉钉扫码登录', () => {
        expect(
            resolveDeviceLoginHint(
                'https://login.dingtalk.com/.well-known/openid-configuration',
            ),
        ).toBe('本平台使用钉钉扫码登录。');
    });

    it('其它 IdP 时退到通用扫码提示', () => {
        expect(
            resolveDeviceLoginHint(
                'https://sso.example.com/.well-known/openid-configuration',
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
});

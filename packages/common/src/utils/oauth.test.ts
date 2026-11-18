import { resolveDeviceLoginHint } from './oauth';

describe('resolveDeviceLoginHint', () => {
    const domains = {
        wechat: ['x.brandct.com'],
        dingtalk: ['lightdash.internal.example.com'],
    };

    it('匹配微信域名（精确）', () => {
        expect(
            resolveDeviceLoginHint('https://x.brandct.com', domains),
        ).toContain('微信扫码登录');
    });

    it('匹配微信域名（子域后缀）', () => {
        expect(
            resolveDeviceLoginHint('https://x.pre.banmahui.cn', {
                ...domains,
                wechat: ['x.brandct.com', 'x.pre.banmahui.cn'],
            }),
        ).toContain('微信扫码登录');
    });

    it('匹配钉钉域名（子域后缀）', () => {
        expect(
            resolveDeviceLoginHint(
                'https://lightdash.internal.example.com',
                domains,
            ),
        ).toContain('钉钉扫码登录');
    });

    it('未命中任何域名时退到通用扫码提示', () => {
        expect(
            resolveDeviceLoginHint('https://unknown.example.com', domains),
        ).toBe('本平台使用扫码方式登录。');
    });

    it('siteUrl 非法时退到通用扫码提示', () => {
        expect(resolveDeviceLoginHint('not-a-url', domains)).toBe(
            '本平台使用扫码方式登录。',
        );
    });
});

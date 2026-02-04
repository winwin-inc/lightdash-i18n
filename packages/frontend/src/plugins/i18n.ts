import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

i18n
    // learn more: https://github.com/i18next/i18next-http-backend
    .use(Backend)
    // learn more: https://github.com/i18next/i18next-browser-languageDetector
    .use(LanguageDetector)
    // pass the i18n instance to react-i18next.
    .use(initReactI18next)
    // init i18next
    // for all options read: https://www.i18next.com/overview/configuration-options
    .init({
        backend: {
            // 有 CDN 时从 CDN 加载（后端在 HTML <head> 注入 window.__CDN_BASE_URL__）；否则用相对路径从当前页 origin 加载（由后端 express.static 提供）。
            // 语言码：zh-CN、zh-Hans 等统一映射到目录 zh（与 public/locales 结构一致）；lng 可能为数组时取第一项。
            loadPath: (lng: string | string[], ns: string) => {
                const code = typeof lng === 'string' ? lng : Array.isArray(lng) ? lng[0] : 'en';
                const dir = typeof code === 'string' && code.startsWith('zh') ? 'zh' : (code || 'en');
                const path = `locales/${dir}/${ns}.json`;
                if (typeof window !== 'undefined') {
                    const base = (window as Window & { __CDN_BASE_URL__?: string }).__CDN_BASE_URL__;
                    if (base) {
                        const baseNorm = base.endsWith('/') ? base : `${base}/`;
                        return baseNorm + path;
                    }
                    // 无 CDN 时必须用根路径，否则会相对当前页路径解析（如 .../view/tabs/locales/zh/...）
                    return `/${path}`;
                }
                return `/${path}`;
            },
        },
        fallbackLng: 'en',
        debug: true,
        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },
    })
    .then(() => {})
    .catch(() => {});

export default i18n;

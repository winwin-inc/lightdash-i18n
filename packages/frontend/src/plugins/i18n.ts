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
            // 使用相对路径，以便在存在 <base href="CDN"> 时从 CDN 加载翻译文件；
            // 绝对路径 /locales/... 会解析到当前 origin，不会走 CDN
            loadPath: 'locales/{{lng}}/{{ns}}.json',
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

import '@testing-library/jest-dom/vitest';
import i18n from 'i18next';
import nock from 'nock';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import translationEn from '../../public/locales/en/translation.json';
import mockMatchMedia from './__mocks__/implementations/matchMedia.mock';
import mockResizeObserver from './__mocks__/implementations/resizeObserver.mock';
import ReactMarkdownPreview from './__mocks__/modules/ReactMarkdwnPreview.mock';

beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mock('@uiw/react-markdown-preview', () => ({
        default: ReactMarkdownPreview,
    }));

    mockMatchMedia();
    mockResizeObserver();

    // 测试环境初始化 i18n：
    // 没有实例时 useTranslation() 的 t() 会直接返回 key，
    // 用例里按英文文案断言（例如 "App actions"）就找不到元素。
    if (!i18n.isInitialized) {
        void i18n.use(initReactI18next).init({
            lng: 'en',
            fallbackLng: 'en',
            resources: {
                en: { translation: translationEn },
            },
            interpolation: { escapeValue: false },
        });
    }
});

// Disable all network requests by default
nock.disableNetConnect();

beforeEach(() => {
    if (!nock.isActive()) {
        nock.activate();
    }
});

const nockCleanup = () => {
    nock.cleanAll();
    nock.restore();
};

afterEach(() => {
    // Check if all nock interceptors were used
    if (!nock.isDone()) {
        console.table(
            nock.pendingMocks().map((mock) => ({ 'Pending Mocks': mock })),
            ['Pending Mocks'],
        );
        nockCleanup();
        throw new Error('Not all nock interceptors were used!');
    }
    nockCleanup();
});

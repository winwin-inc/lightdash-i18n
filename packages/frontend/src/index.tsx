import '@mantine-8/core/styles.css';

// eslint-disable-next-line import/order
import { scan } from 'react-scan'; // react-scan has to be imported before react

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

/**
 * 当存在 <base href="CDN"> 时，相对路径会按 base 解析，导致 replaceState/pushState
 * 得到跨源 URL 并抛出 SecurityError。在应用入口统一把传给 history 的 URL 改为
 * 使用当前页 origin，保证与 document 同源。
 * @see https://github.com/remix-run/history/issues/648
 */
function patchHistoryForBaseTag() {
    const origin = window.location.origin;
    const rewrite = (url: string | URL | null | undefined): string | URL | null | undefined => {
        if (url == null) return url;
        if (typeof url === 'string') {
            if (url === '' || url.startsWith('/'))
                return origin + (url || window.location.pathname + window.location.search + window.location.hash);
            try {
                const u = new URL(url, origin);
                if (u.origin !== origin) return origin + u.pathname + u.search + u.hash;
            } catch {
                return url;
            }
            return url;
        }
        const u = url as URL;
        if (u.origin !== origin) return origin + u.pathname + u.search + u.hash;
        return url;
    };
    const origReplace = history.replaceState.bind(history);
    const origPush = history.pushState.bind(history);
    history.replaceState = function (state, unused, url) {
        return origReplace(state, unused, rewrite(url) ?? url);
    };
    history.pushState = function (state, unused, url) {
        return origPush(state, unused, rewrite(url) ?? url);
    };
}
patchHistoryForBaseTag();

// Trigger FE tests
scan({
    enabled: import.meta.env.DEV && REACT_SCAN_ENABLED,
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found!');

const root = createRoot(container);

root.render(
    <StrictMode>
        <App />
    </StrictMode>,
);

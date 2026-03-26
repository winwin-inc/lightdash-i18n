import '@mantine-8/core/styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

// 读取 URL 参数 ?jaeger_debug_id=xxx 并存入 sessionStorage，供 API 请求注入 header 触发 Jaeger 追踪
const params = new URLSearchParams(window.location.search);
const jaegerDebugId = params.get('jaeger_debug_id');
if (jaegerDebugId) {
    sessionStorage.setItem('jaeger_debug_id', jaegerDebugId);
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found!');

const root = createRoot(container);

root.render(
    <StrictMode>
        <App />
    </StrictMode>,
);

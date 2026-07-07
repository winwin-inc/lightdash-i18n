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

// React StrictMode 在 dev 下会双重 mount/unmount，与 echarts-for-react 不兼容，
// 会导致图表渲染失败（线上 prod 无此问题）。见 packages/e2e/cypress/e2e/app/dashboard.cy.ts
const app = import.meta.env.DEV ? (
    <App />
) : (
    <StrictMode>
        <App />
    </StrictMode>
);

root.render(app);

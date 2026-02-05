import { sentryVitePlugin } from '@sentry/vite-plugin';
import reactPlugin from '@vitejs/plugin-react';
import * as path from 'path';
import { compression } from 'vite-plugin-compression2';
// @ts-expect-error: types for @vitejs/plugin-legacy are not resolved under our TS moduleResolution, but runtime usage is valid
import legacy from '@vitejs/plugin-legacy';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

const FE_PORT = process.env.FE_PORT ? parseInt(process.env.FE_PORT) : 3000;
const BE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

// Proxy target for API requests
// If VITE_PROXY_TARGET is set, proxy API requests to that target
// Otherwise, use local backend (default behavior)
const PROXY_TARGET =
    process.env.VITE_PROXY_TARGET || `http://localhost:${BE_PORT}`;

// Log proxy configuration in development
if (process.env.NODE_ENV === 'development') {
    console.log(
        `[Vite Proxy] API requests will be proxied to: ${PROXY_TARGET}`,
    );
    if (process.env.VITE_PROXY_TARGET) {
        console.log(`[Vite Proxy] Using remote backend: ${PROXY_TARGET}`);
        console.log(
            `[Vite Proxy] Make sure you have logged in to ${PROXY_TARGET} in your browser`,
        );
    } else {
        console.log(`[Vite Proxy] Using local backend: ${PROXY_TARGET}`);
    }
}

// 始终使用 base: '/'，避免把 CDN 前缀打进 JS bundle。
// 否则 dashboards/embed 等运行时用 import.meta.env.BASE_URL 请求资源时会带上 /msy-x/static/version/，
// 对当前 origin 发请求，出现「有问题的前缀」。CDN 路径由后端在返回 HTML 时重写 + 上传脚本在 OSS 上的目录保证即可。
export default defineConfig({
    base: '/',
    publicDir: 'public',
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        REACT_SCAN_ENABLED: process.env.REACT_SCAN_ENABLED ?? true,
        REACT_QUERY_DEVTOOLS_ENABLED:
            process.env.REACT_QUERY_DEVTOOLS_ENABLED ?? true,
    },
    plugins: [
        svgrPlugin(),
        reactPlugin(),
        legacy({
            targets: ['defaults', 'not IE 11'],
            modernPolyfills: true,
        }),
        compression({
            include: [/\.(js)$/, /\.(css)$/],
            filename: '[path][base].gzip',
        }),
        monacoEditorPlugin({
            forceBuildCDN: true,
            languageWorkers: ['json'],
        }),
        sentryVitePlugin({
            org: 'lightdash',
            project: 'lightdash-frontend',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: {
                name: process.env.SENTRY_RELEASE_VERSION,
                inject: true,
            },
            // Sourcemaps are already uploaded by the Sentry CLI
            sourcemaps: {
                disable: true,
            },
        }),
    ],
    css: {
        transformer: 'lightningcss',
    },
    optimizeDeps: {
        exclude: ['@lightdash/common'],
        esbuildOptions: {
            // 降低到 ES2017 以避免命名捕获组等 ES2018 特性在旧浏览器中报错
            target: 'es2017',
        },
    },
    esbuild: {
        // 降低到 ES2017 以避免正则表达式命名捕获组等 ES2018 特性在旧浏览器中报错
        target: 'es2017',
    },
    resolve: {
        alias:
            process.env.NODE_ENV === 'development'
                ? {
                      '@lightdash/common/src': path.resolve(
                          __dirname,
                          '../common/src',
                      ),
                      '@lightdash/common': path.resolve(
                          __dirname,
                          '../common/src/index.ts',
                      ),
                  }
                : undefined,
    },
    build: {
        outDir: 'build',
        emptyOutDir: true,
        // 降低到 ES2017 以避免正则表达式命名捕获组等 ES2018 特性在旧浏览器中报错
        // legacy 插件继续为更老的环境注入 polyfill
        target: 'es2017',
        minify: true,
        sourcemap: true,

        rollupOptions: {
            output: {
                manualChunks: {
                    react: [
                        'react',
                        'react-dom',
                        'react-router',
                        'react-hook-form',
                        'react-use',
                        // TODO: removed because of PNPM
                        // 'react-draggable',
                        '@hello-pangea/dnd',
                        '@tanstack/react-query',
                        '@tanstack/react-table',
                        '@tanstack/react-virtual',
                    ],
                    echarts: ['echarts'],
                    ace: ['ace-builds', 'react-ace/lib'],
                    modules: [
                        // TODO: removed because of PNPM
                        // 'ajv',
                        // 'ajv-formats',
                        // 'liquidjs',
                        // 'pegjs',
                        'jspdf',
                        'lodash',
                        'colorjs.io',
                        'zod',
                    ],
                    thirdparty: [
                        '@sentry/react',
                        'rudder-sdk-js',
                        'posthog-js',
                    ],
                    uiw: [
                        '@uiw/react-markdown-preview',
                        '@uiw/react-md-editor',
                    ],
                    mantine: [
                        '@mantine/core',
                        '@mantine/dates',
                        '@mantine/form',
                        '@mantine/hooks',
                        '@mantine/notifications',
                        '@mantine/prism',
                    ],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/testing/vitest.setup.ts',
    },
    server: {
        port: FE_PORT,
        host: true,
        hmr: {
            overlay: true,
        },
        allowedHosts: [
            'lightdash-dev', // for local development with docker
            '.lightdash.dev', // for cloudflared tunnels
        ],
        watch: {
            ignored: [
                // 忽略所有 node_modules，但保留 @lightdash/common 的监听
                '**/node_modules/**',
                '!**/node_modules/@lightdash/common/**',
                // 忽略构建输出目录
                '**/build/**',
                '**/sdk/dist/**',
                // 忽略 TypeScript 构建信息文件
                '**/*.tsbuildinfo',
                // 忽略测试文件（开发时不需要监听）
                '**/*.test.ts',
                '**/*.test.tsx',
                '**/*.spec.ts',
                '**/*.spec.tsx',
                // 忽略 Mock 文件
                '**/__mocks__/**',
                // 忽略 Storybook stories（根据 package.json 配置）
                '**/src/stories/**',
                // 忽略测试覆盖率报告
                '**/coverage/**',
                // 忽略 Storybook 构建输出
                '**/.storybook-static/**',
            ],
            // windows 下使用 polling 解决 HMR 热更新失败问题
            usePolling: true, // fix HMR hot update failure
            interval: 1000, // polling interval (优化为 1s，平衡性能和响应速度)
        },
        proxy: {
            '/api': {
                target: PROXY_TARGET,
                changeOrigin: true,
                // Rewrite cookie domain to localhost so cookies work correctly when proxying to remote server
                cookieDomainRewrite: PROXY_TARGET.includes('localhost')
                    ? undefined
                    : 'localhost',
                // Allow insecure certificates when proxying to HTTPS in development
                secure: process.env.NODE_ENV === 'production',
            },
            '/.well-known': {
                // MCP inspector requires .well-known to be on the root, but according to RFC 9728 (OAuth 2.0 Protected Resource Metadata) the .well-known endpoint is not required to be at the root level.
                target: `${PROXY_TARGET}/api/v1/oauth`,
                changeOrigin: true,
                cookieDomainRewrite: PROXY_TARGET.includes('localhost')
                    ? undefined
                    : 'localhost',
                secure: process.env.NODE_ENV === 'production',
            },
            '/slack/events': {
                target: PROXY_TARGET,
                changeOrigin: true,
                cookieDomainRewrite: PROXY_TARGET.includes('localhost')
                    ? undefined
                    : 'localhost',
                secure: process.env.NODE_ENV === 'production',
            },
        },
    },
    clearScreen: false,
});

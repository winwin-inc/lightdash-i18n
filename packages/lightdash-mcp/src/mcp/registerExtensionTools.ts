import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, type ZodRawShape } from 'zod';
import type { LightdashMcpEnvConfig } from '../config';
import {
    DEFAULT_WEB_PATH_TEMPLATES,
    enrichSavedChartResult,
} from '../lib/contentWebUrls';
import { getHttpRequestApiKey } from '../lib/requestContext';
import type { LightdashRestClient } from '../rest/lightdashRest';
import { resolveCoreToolsProjectUuid } from './coreToolsContext';
import { registerToolTyped } from './registerToolTyped';

const runSavedChartParams = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
    chartUuid: z.string(),
    versionUuid: z.string().optional(),
    parameters: z.any().optional(),
    limit: z.number().optional(),
    pageSize: z.number().optional(),
    maxPollAttempts: z.number().optional(),
    pollIntervalMs: z.number().optional(),
} satisfies ZodRawShape;

const getSiteInfoParams = {
    apiKey: z.string().optional(),
} satisfies ZodRawShape;

const listSpacesParams = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
} satisfies ZodRawShape;

const getSavedChartParams = {
    apiKey: z.string().optional(),
    chartUuid: z.string(),
} satisfies ZodRawShape;

function resolveExtensionApiKey(
    config: LightdashMcpEnvConfig,
    fromArgs: string | undefined,
): string {
    const key = fromArgs ?? getHttpRequestApiKey() ?? config.apiKey;
    if (!key) {
        throw new Error(
            'apiKey is required (x-api-key header, tool argument, or LIGHTDASH_API_KEY)',
        );
    }
    return key;
}

export function registerExtensionTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'tool-call',
        'get_site_info',
        '返回当前 MCP 所连 Lightdash 的站点根地址 siteBaseUrl（与 LIGHTDASH_SITE_URL 一致）；不含密钥。可与各工具返回的 webUrl 对照使用。',
        getSiteInfoParams,
        async () => {
            const payload = {
                siteBaseUrl: config.baseUrl,
                note: '图表/看板打开链接见 find_charts / find_dashboards / find_content、get_saved_chart 等工具返回的 webUrl。',
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(payload, null, 2),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'tool-call',
        'list_spaces',
        '列出当前项目下的空间（内容文件夹）。可选 projectUuid；省略时与核心工具一致：本次参数 > set_project 会话 > 环境 LIGHTDASH_PROJECT_UUID。',
        listSpacesParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const data = await api.listSpaces(apiKey, projectUuid);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(data, null, 2),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'tool-call',
        'get_saved_chart',
        '查看某张已保存图表的名称、可用参数、依赖的数据主题；跑数前先确认参数怎么填。返回含 siteBaseUrl 与 webUrl（浏览器打开该图表）。',
        getSavedChartParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const data = await api.getSavedChart(
                apiKey,
                args.chartUuid as string,
            );
            const enriched = enrichSavedChartResult(
                config.baseUrl,
                DEFAULT_WEB_PATH_TEMPLATES.chart,
                data,
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(enriched, null, 2),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'tool-call',
        'run_saved_chart',
        '按已保存图表跑数；可用 parameters 传筛选（如年份、区域）。limit 会按环境上限自动封顶。可选 projectUuid；省略时与核心工具一致：本次参数 > set_project 会话 > 环境 LIGHTDASH_PROJECT_UUID。',
        runSavedChartParams,
        async (args) => {
            const apiKey = resolveExtensionApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const pageSize = (args.pageSize as number | undefined) ?? 500;
            const maxPollAttempts =
                (args.maxPollAttempts as number | undefined) ?? 120;
            const pollIntervalMs =
                (args.pollIntervalMs as number | undefined) ?? 500;
            const limit = (args.limit as number | undefined) ?? 500;

            const result = await api.runSavedChart(
                apiKey,
                projectUuid,
                {
                    chartUuid: args.chartUuid as string,
                    versionUuid: args.versionUuid as string | undefined,
                    parameters: args.parameters as
                        | Record<string, unknown>
                        | undefined,
                    limit,
                },
                { pageSize, maxPollAttempts, pollIntervalMs },
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    );
}

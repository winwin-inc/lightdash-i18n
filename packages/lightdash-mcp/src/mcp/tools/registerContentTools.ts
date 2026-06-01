import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import {
    DEFAULT_WEB_PATH_TEMPLATES,
    enrichContentSearchResults,
} from '../../lib/contentWebUrls';
import {
    extractLightdashVersion,
    isVersionAtLeast,
} from '../../lib/lightdashVersion';
import {
    maybeSlimList,
    slimChartSearchItem,
    slimContentItem,
    slimDashboardSearchItem,
} from '../../lib/toolOutput';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';

const searchQueriesSchema = {
    projectUuid: z.string().optional(),
    searchQueries: z.array(z.object({ label: z.string() })),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    full: z.boolean().optional(),
};

export function getContentSlimMapper(
    contentTypes: string[] | undefined,
): (item: unknown) => Record<string, unknown> {
    if (!contentTypes || contentTypes.length !== 1) return slimContentItem;
    if (contentTypes[0] === 'chart') return slimChartSearchItem;
    if (contentTypes[0] === 'dashboard') return slimDashboardSearchItem;
    return slimContentItem;
}

async function runLabelWiseContentSearch(
    args: Record<string, unknown>,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
    contentTypes: string[] | undefined,
    slimItem: (item: unknown) => Record<string, unknown>,
): Promise<CallToolResult> {
    const apiKey = resolveCoreToolsApiKey(config);
    const projectUuid = resolveCoreToolsProjectUuid(
        config,
        apiKey,
        args.projectUuid as string | undefined,
    );
    const labels = (args.searchQueries as { label: string }[]).map(
        (x) => x.label,
    );
    const full = (args.full as boolean | undefined) ?? false;
    const merged: unknown[] = [];
    for (const label of labels) {
        const data = await api.searchContent(apiKey, projectUuid, {
            search: label,
            contentTypes,
            page: args.page as number | undefined,
            pageSize: args.pageSize as number | undefined,
        });
        const enriched = enrichContentSearchResults(
            config.baseUrl,
            DEFAULT_WEB_PATH_TEMPLATES,
            data,
        );
        merged.push({
            label,
            results: maybeSlimList(enriched, full, slimItem),
        });
    }
    return {
        content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }],
    };
}

export function registerContentTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'find_content',
        '混合关键词搜索图表、看板、空间（v2 content API，不传 contentTypes 过滤）；返回含 webUrl。示例：find_content(searchQueries:[{label:"品牌"}])。若已知类型优先用 find_charts / find_dashboards / find_spaces。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                undefined,
                getContentSlimMapper(undefined),
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_charts',
        '按关键词搜索已保存图表（v2 content API，`contentTypes` 固定为 chart）；返回含 webUrl。示例：find_charts(searchQueries:[{label:"销量"}])。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                ['chart'],
                getContentSlimMapper(['chart']),
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_dashboards',
        '按关键词搜索看板（v2 content API，`contentTypes` 固定为 dashboard）；返回含 webUrl。示例：find_dashboards(searchQueries:[{label:"经营分析"}])。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                ['dashboard'],
                getContentSlimMapper(['dashboard']),
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'find_spaces',
        '按关键词搜索空间（v2 content API，`contentTypes` 固定为 space）；返回含 webUrl。',
        searchQueriesSchema,
        async (args) =>
            runLabelWiseContentSearch(
                args as Record<string, unknown>,
                config,
                api,
                ['space'],
                getContentSlimMapper(['space']),
            ),
    );

    registerToolTyped(
        server,
        'core-tool',
        'list_dashboards',
        '按 spaceUuid 列出空间下的看板（v2 content API 层级浏览，非关键词搜索）。有 spaceUuid 时用此工具；按名称搜索用 find_dashboards。可选 projectUuid；省略时与 list_spaces 一致：本次参数 > set_project > LIGHTDASH_PROJECT_UUID。',
        {
            spaceUuid: z.string(),
            projectUuid: z.string().optional(),
            page: z.number().optional(),
            pageSize: z.number().optional(),
            full: z.boolean().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const full = (args.full as boolean | undefined) ?? false;
            const data = await api.searchContent(apiKey, projectUuid, {
                spaceUuids: [args.spaceUuid as string],
                contentTypes: ['dashboard'],
                page: args.page as number | undefined,
                pageSize: (args.pageSize as number | undefined) ?? 50,
            });
            const enriched = enrichContentSearchResults(
                config.baseUrl,
                DEFAULT_WEB_PATH_TEMPLATES,
                data,
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            maybeSlimList(
                                enriched,
                                full,
                                slimDashboardSearchItem,
                            ),
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'list_verified_content',
        '列出项目已验证图表/看板（GET …/content-verification）。⚠️ 依赖站点版本支持。',
        { projectUuid: z.string().optional() },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const health = await api.getHealth(apiKey);
            const version = extractLightdashVersion(health);
            if (!version || !isVersionAtLeast(version, '0.2100.0')) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    error: '当前 Lightdash 版本可能不支持 content-verification 接口',
                                    currentVersion: version ?? 'unknown',
                                    minVersion: '0.2100.0',
                                    hint: '请升级 Lightdash，或跳过 list_verified_content 工具',
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            }
            let data: unknown;
            try {
                data = await api.listVerifiedContent(apiKey, projectUuid);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                if (/^Lightdash API 404:/i.test(message)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        error: '当前站点未部署 content-verification 接口',
                                        currentVersion: version,
                                        hint: '请确认后端已启用该路由，或暂时跳过 list_verified_content 工具',
                                        raw: message,
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    };
                }
                if (/^Lightdash API 403:/i.test(message)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        error: '当前凭据无权限访问 content-verification',
                                        hint: '请使用具备项目访问权限的 PAT，或联系管理员开通权限',
                                        raw: message,
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    };
                }
                throw error;
            }
            return {
                content: [
                    { type: 'text', text: JSON.stringify(data, null, 2) },
                ],
            };
        },
    );
}

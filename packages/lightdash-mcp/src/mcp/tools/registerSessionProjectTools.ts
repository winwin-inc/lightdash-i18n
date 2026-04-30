import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { getMcpSession, patchMcpSession } from '../../lib/mcpSessionStore';
import { registerToolTyped } from '../registerToolTyped';
import { resolveCoreToolsApiKey } from '../coreToolsContext';

export function registerSessionProjectTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'set_project',
        '设置后续工具使用的默认 projectUuid（内存会话，按 PAT 隔离）。可选 tags 用于目录搜索过滤。未 set_project 时，可选环境变量 LIGHTDASH_PROJECT_UUID 提供默认项目。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string(),
            tags: z.array(z.string()).optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = args.projectUuid as string;
            let projectName: string | null = null;
            try {
                const p = (await api.getProject(apiKey, projectUuid)) as {
                    name?: string;
                };
                projectName = typeof p?.name === 'string' ? p.name : null;
            } catch {
                projectName = null;
            }
            const tags =
                args.tags !== undefined
                    ? ((args.tags as string[]).length > 0
                          ? (args.tags as string[])
                          : null)
                    : null;
            patchMcpSession(apiKey, {
                projectUuid,
                projectName,
                tags,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                projectUuid,
                                projectName,
                                selectedTags: tags,
                                note: '上下文存于本服务内存。',
                            },
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
        'get_current_project',
        '读取 set_project 设置的当前项目（内存会话）。',
        { apiKey: z.string().optional() },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const s = getMcpSession(apiKey);
            if (!s.projectUuid) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    error: '当前会话（set_project）未设置 projectUuid。',
                                    sessionProjectUuid: null,
                                    envDefaultProjectUuid: config.defaultProjectUuid,
                                    hint: config.defaultProjectUuid
                                        ? '已配置 LIGHTDASH_PROJECT_UUID；多数工具在未传 projectUuid 时会使用该默认，亦可先 set_project 固定本会话。'
                                        : '未配置 LIGHTDASH_PROJECT_UUID；调用需要项目的工具前请先 set_project，或在工具参数中传 projectUuid。',
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                projectUuid: s.projectUuid,
                                projectName: s.projectName,
                                selectedTags: s.tags,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );
}

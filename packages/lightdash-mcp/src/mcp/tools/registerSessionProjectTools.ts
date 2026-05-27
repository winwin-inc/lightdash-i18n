import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import type { McpSessionState } from '../../lib/mcpSessionStore';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { getMcpSession, patchMcpSession } from '../../lib/mcpSessionStore';
import { registerToolTyped } from '../registerToolTyped';
import { resolveCoreToolsApiKey } from '../coreToolsContext';

export function getCurrentProjectContext(
    session: McpSessionState,
    defaultProjectUuid: string | null,
): {
    sessionProjectUuid: string | null;
    envDefaultProjectUuid: string | null;
    effectiveProjectUuid: string | null;
    source: 'session' | 'env' | 'none';
} {
    const sessionProjectUuid =
        typeof session.projectUuid === 'string' ? session.projectUuid : null;
    const envProjectUuid = defaultProjectUuid ?? null;
    const effectiveProjectUuid = sessionProjectUuid ?? envProjectUuid;
    const source = sessionProjectUuid
        ? 'session'
        : envProjectUuid
          ? 'env'
          : 'none';
    return {
        sessionProjectUuid,
        envDefaultProjectUuid: envProjectUuid,
        effectiveProjectUuid,
        source,
    };
}

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
            projectUuid: z.string(),
            tags: z.array(z.string()).optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
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
        '读取当前项目上下文（优先 set_project 会话，其次环境 LIGHTDASH_PROJECT_UUID）。会话为内存态并按 PAT 隔离。',
        {},
        async () => {
            const apiKey = resolveCoreToolsApiKey(config);
            const s = getMcpSession(apiKey);
            const {
                sessionProjectUuid,
                envDefaultProjectUuid,
                effectiveProjectUuid,
                source,
            } = getCurrentProjectContext(s, config.defaultProjectUuid);
            if (!effectiveProjectUuid) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    error: '当前无可用 projectUuid（session 与 env 都为空）。',
                                    sessionProjectUuid: null,
                                    envDefaultProjectUuid,
                                    effectiveProjectUuid: null,
                                    source,
                                    hint: '请先调用 set_project，或在环境中配置 LIGHTDASH_PROJECT_UUID，或在每次工具参数中传 projectUuid。',
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
                                projectUuid: effectiveProjectUuid,
                                projectName: s.projectName,
                                selectedTags: s.tags,
                                sessionProjectUuid,
                                envDefaultProjectUuid,
                                effectiveProjectUuid,
                                source,
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

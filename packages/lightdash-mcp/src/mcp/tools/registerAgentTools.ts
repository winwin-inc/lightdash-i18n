import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { getMcpSession, patchMcpSession } from '../../lib/mcpSessionStore';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
    resolveCoreToolsProjectUuid,
} from '../coreToolsContext';

export function registerAgentTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'list_agents',
        '列出项目下 AI Agent（REST: GET …/aiAgents）。若实例未部署或未暴露该 API，可能返回 404。',
        {
            apiKey: z.string().optional(),
            projectUuid: z.string().optional(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                args.projectUuid as string | undefined,
            );
            const data = await api.listAiAgents(apiKey, projectUuid);
            return {
                content: [
                    { type: 'text', text: JSON.stringify(data, null, 2) },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'set_agent',
        '设置当前 Agent；拉取详情缓存于会话（REST: GET …/aiAgents/{uuid}）。',
        {
            apiKey: z.string().optional(),
            agentUuid: z.string(),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveCoreToolsProjectUuid(
                config,
                apiKey,
                undefined,
            );
            const agentUuid = args.agentUuid as string;
            const agent = await api.getAiAgent(apiKey, projectUuid, agentUuid);
            const name =
                agent &&
                typeof agent === 'object' &&
                'name' in agent &&
                typeof (agent as { name: unknown }).name === 'string'
                    ? (agent as { name: string }).name
                    : null;
            patchMcpSession(apiKey, {
                agentUuid,
                agentName: name,
                agentSnapshot: agent,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(agent, null, 2),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'clear_agent',
        '清除当前 Agent 会话状态。',
        { apiKey: z.string().optional() },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            patchMcpSession(apiKey, {
                agentUuid: null,
                agentName: null,
                agentSnapshot: null,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            { message: 'Agent context cleared successfully.' },
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
        'get_current_agent',
        '返回 set_agent 缓存的 Agent JSON；若未设置则报错。',
        { apiKey: z.string().optional() },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const s = getMcpSession(apiKey);
            if (!s.agentUuid || !s.agentSnapshot) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    error: 'No active agent set. Use set_agent to set one.',
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
                        text: JSON.stringify(s.agentSnapshot, null, 2),
                    },
                ],
            };
        },
    );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import { maybeSlimList, slimProject } from '../../lib/toolOutput';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { registerToolTyped } from '../registerToolTyped';
import {
    resolveCoreToolsApiKey,
} from '../coreToolsContext';

export function registerOrgAndHealthTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'get_lightdash_version',
        '返回 Lightdash 实例健康信息（含 version 等，来自 GET /api/v1/health）。',
        {},
        async () => {
            const apiKey = resolveCoreToolsApiKey(config);
            const health = await api.getHealth(apiKey);
            const obj =
                health &&
                typeof health === 'object' &&
                !Array.isArray(health)
                    ? (health as Record<string, unknown>)
                    : {};
            const v = obj.version;
            const shortVersion =
                typeof v === 'string' && v.trim().length > 0
                    ? v.trim()
                    : 'unknown';
            return {
                content: [
                    { type: 'text', text: shortVersion },
                    {
                        type: 'text',
                        text: JSON.stringify(health, null, 2),
                    },
                ],
            };
        },
    );

    registerToolTyped(
        server,
        'core-tool',
        'list_projects',
        '列出当前 PAT 可访问的项目（REST: GET /api/v1/org/projects）。',
        { full: z.boolean().optional() },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const data = await api.listProjects(apiKey);
            const full = (args.full as boolean | undefined) ?? false;
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            maybeSlimList(data, full, slimProject),
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );
}

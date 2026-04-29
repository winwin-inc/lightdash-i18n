import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LightdashMcpEnvConfig } from '../config';
import { createFieldIdResolverFromExplore } from './fieldIdResolver';
import { createLightdashRestClient } from '../rest/lightdashRest';
import { registerAnalystPrompt } from './registerAnalystPrompt';
import { registerCoreMcpTools } from './registerCoreMcpTools';
import { registerExtensionTools } from './registerExtensionTools';

export function createLightdashMcpServer(
    config: LightdashMcpEnvConfig,
): McpServer {
    const api = createLightdashRestClient(config);
    const resolverCache = new Map<
        string,
        { expiresAtMs: number; resolve: (field: string) => string }
    >();
    const server = new McpServer({
        name: 'lightdash-local-mcp',
        version: '0.1.0',
    });

    const getFieldResolver = async (
        apiKey: string,
        projectUuid: string,
        exploreName: string,
    ): Promise<((field: string) => string)> => {
        const cacheKey = `${projectUuid}:${exploreName}`;
        const now = Date.now();
        const cached = resolverCache.get(cacheKey);
        if (cached && cached.expiresAtMs > now) {
            return cached.resolve;
        }
        const explore = await api.getExplore(apiKey, projectUuid, exploreName);
        const resolve = createFieldIdResolverFromExplore(explore, exploreName);
        resolverCache.set(cacheKey, {
            resolve,
            expiresAtMs: now + 5 * 60 * 1000,
        });
        return resolve;
    };

    registerExtensionTools(server, config, api);

    const defaultPoll = {
        pageSize: 500,
        maxPollAttempts: 120,
        pollIntervalMs: 500,
    };

    registerCoreMcpTools(server, config, api, {
        getFieldResolver,
        defaultPoll,
    });

    registerAnalystPrompt(server, config);

    return server;
}

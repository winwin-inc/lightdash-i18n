import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LightdashMcpEnvConfig } from '../config';
import { getMcpPackageVersion } from '../lib/mcpPackageVersion';
import {
    createFieldIdResolverFromExplore,
    exploreRequiresDashboardContext,
} from './fieldIdResolver';
import {
    createSharedExploreCache,
    type SharedExploreCache,
} from '../lib/sharedExploreCache';
import { getHttpRequestUserAttributesHeader } from '../lib/requestContext';
import { createLightdashRestClient } from '../rest/lightdashRest';
import { registerAnalystPrompt } from './registerAnalystPrompt';
import { registerCoreMcpTools } from './registerCoreMcpTools';
import { registerExtensionTools } from './registerExtensionTools';

const EXPLORE_CACHE_TTL_MS = 5 * 60 * 1000;

export function createExploreCacheKey(
    apiKey: string,
    projectUuid: string,
    exploreName: string,
    userAttributesHeader: string | undefined,
): string {
    const authorizationHash = createHash('sha256')
        .update(apiKey, 'utf8')
        .update('\0', 'utf8')
        .update(userAttributesHeader ?? '', 'utf8')
        .digest('hex');
    return `${authorizationHash}:${projectUuid}:${exploreName}`;
}

export type CreateLightdashMcpServerDeps = {
    exploreCache?: SharedExploreCache;
};

export function createLightdashMcpServer(
    config: LightdashMcpEnvConfig,
    deps?: CreateLightdashMcpServerDeps,
): McpServer {
    const api = createLightdashRestClient(config);
    const exploreCache = deps?.exploreCache ?? createSharedExploreCache();
    const server = new McpServer({
        name: 'lightdash-local-mcp',
        version: getMcpPackageVersion(),
    });

    const getExploreMetadata = async (
        apiKey: string,
        projectUuid: string,
        exploreName: string,
    ): Promise<{
        explore: unknown;
        resolve: (field: string) => string;
        requiresDashboardContext: boolean;
    }> => {
        const cacheKey = createExploreCacheKey(
            apiKey,
            projectUuid,
            exploreName,
            getHttpRequestUserAttributesHeader(),
        );
        const now = Date.now();
        const cached = exploreCache.get(cacheKey);
        if (cached && cached.expiresAtMs > now) {
            return {
                explore: cached.explore,
                resolve: cached.resolve,
                requiresDashboardContext: cached.requiresDashboardContext,
            };
        }
        const explore = await api.getExplore(apiKey, projectUuid, exploreName);
        const resolve = createFieldIdResolverFromExplore(explore, exploreName);
        const requiresDashboardContext =
            exploreRequiresDashboardContext(explore);
        exploreCache.set(cacheKey, {
            explore,
            resolve,
            requiresDashboardContext,
            expiresAtMs: now + EXPLORE_CACHE_TTL_MS,
        });
        return { explore, resolve, requiresDashboardContext };
    };

    const getFieldResolver = async (
        apiKey: string,
        projectUuid: string,
        exploreName: string,
    ): Promise<((field: string) => string)> => {
        const metadata = await getExploreMetadata(
            apiKey,
            projectUuid,
            exploreName,
        );
        return metadata.resolve;
    };

    registerExtensionTools(server, config, api, {
        getExploreMetadata,
    });

    const defaultPoll = {
        pageSize: 500,
        maxPollAttempts: 120,
        pollIntervalMs: 500,
    };

    registerCoreMcpTools(server, config, api, {
        getFieldResolver,
        getExploreMetadata,
        defaultPoll,
    });

    registerAnalystPrompt(server);

    return server;
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import type { LightdashMcpEnvConfig } from './config';
import { createLightdashRestClient } from './lightdashRest';
import { getHttpRequestApiKey } from './requestContext';

/**
 * MCP SDK 的 `server.tool` 会对 `z.objectOutputType<Args>` 做深层推导，易触发 TS2589。
 * 这里用窄化后的 handler 类型注册，运行时仍由 SDK 用 Zod 校验入参。
 */
function registerToolTyped(
    server: McpServer,
    name: string,
    description: string,
    params: ZodRawShape,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
): void {
    const register = server.tool as (
        n: string,
        desc: string,
        schema: ZodRawShape,
        annotations: Record<string, unknown>,
        cb: (args: Record<string, unknown>) => Promise<CallToolResult>,
    ) => void;
    register(name, description, params, {}, handler);
}

// `z.record(z.unknown())` 会在 MCP SDK 的 `z.objectOutputType<Args, …>` 推导中触发递归过深；
// 对 JSON 负载使用 `z.any()`，运行时再校验/归一化（见 normalizeMetricQuery）。
const listExploresParams = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
    filtered: z.boolean().optional(),
} satisfies ZodRawShape;

const getExploreParams = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
    exploreId: z.string(),
} satisfies ZodRawShape;

const runMetricQueryParams = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
    query: z.any(),
    context: z.string().optional(),
    invalidateCache: z.boolean().optional(),
    parameters: z.any().optional(),
    dateZoom: z.any().optional(),
    pivotConfiguration: z.any().optional(),
    dashboardUuid: z.string().optional(),
    pageSize: z.number().optional(),
    maxPollAttempts: z.number().optional(),
    pollIntervalMs: z.number().optional(),
} satisfies ZodRawShape;

function resolveProjectUuid(
    config: LightdashMcpEnvConfig,
    fromArgs: string | undefined,
): string {
    const u = fromArgs ?? config.defaultProjectUuid;
    if (!u) {
        throw new Error(
            'projectUuid is required (tool argument or LIGHTDASH_DEFAULT_PROJECT_UUID)',
        );
    }
    return u;
}

function resolveApiKey(
    config: LightdashMcpEnvConfig,
    fromArgs: string | undefined,
): string {
    const key = fromArgs ?? getHttpRequestApiKey() ?? config.apiKey;
    if (!key) {
        throw new Error(
            'apiKey is required (Authorization: ApiKey … header, tool argument, or LIGHTDASH_API_KEY)',
        );
    }
    return key;
}

export function createLightdashMcpServer(
    config: LightdashMcpEnvConfig,
): McpServer {
    const api = createLightdashRestClient(config);
    const server = new McpServer({
        name: 'lightdash-local-mcp',
        version: '0.2098.2',
    });

    registerToolTyped(
        server,
        'lightdash_list_explores',
        '列出项目 explores（GET /api/v1/projects/{projectUuid}/explores）',
        listExploresParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveProjectUuid(
                config,
                args.projectUuid as string | undefined,
            );
            const filtered = (args.filtered as boolean | undefined) ?? true;
            const data = await api.listExplores(apiKey, projectUuid, filtered);
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
        'lightdash_get_explore',
        '获取 explore 与字段元数据（GET .../explores/{exploreId}）',
        getExploreParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveProjectUuid(
                config,
                args.projectUuid as string | undefined,
            );
            const data = await api.getExplore(
                apiKey,
                projectUuid,
                args.exploreId as string,
            );
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
        'lightdash_run_metric_query',
        'POST metric-query 后轮询 GET query 直至 ready，返回 rows/columns',
        runMetricQueryParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveProjectUuid(
                config,
                args.projectUuid as string | undefined,
            );
            const pageSize = (args.pageSize as number | undefined) ?? 500;
            const maxPollAttempts =
                (args.maxPollAttempts as number | undefined) ?? 120;
            const pollIntervalMs =
                (args.pollIntervalMs as number | undefined) ?? 500;
            const result = await api.runMetricQueryUntilReady(
                apiKey,
                projectUuid,
                {
                    context: args.context as never,
                    invalidateCache: args.invalidateCache as
                        | boolean
                        | undefined,
                    parameters: args.parameters as never,
                    dateZoom: args.dateZoom as never,
                    pivotConfiguration: args.pivotConfiguration as never,
                    dashboardUuid: args.dashboardUuid as string | undefined,
                    query: args.query as Record<string, unknown>,
                },
                { pageSize, maxPollAttempts, pollIntervalMs },
            );
            const payload = {
                queryUuid: result.queryUuid,
                rows: result.rows,
                columns: result.columns,
                fields: result.executeResult.fields,
                warnings: result.executeResult.warnings,
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

    return server;
}

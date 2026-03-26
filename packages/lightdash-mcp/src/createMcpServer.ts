import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from './config';
import { createLightdashRestClient } from './lightdashRest';

const listExploresParams = {
    projectUuid: z.string().optional(),
    filtered: z.boolean().optional(),
};

const getExploreParams = {
    projectUuid: z.string().optional(),
    exploreId: z.string(),
};

const runMetricQueryParams = {
    projectUuid: z.string().optional(),
    query: z.record(z.unknown()),
    context: z.string().optional(),
    invalidateCache: z.boolean().optional(),
    parameters: z.record(z.unknown()).optional(),
    dateZoom: z.record(z.unknown()).optional(),
    pivotConfiguration: z.record(z.unknown()).optional(),
    dashboardUuid: z.string().optional(),
    pageSize: z.number().optional(),
    maxPollAttempts: z.number().optional(),
    pollIntervalMs: z.number().optional(),
};

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

export function createLightdashMcpServer(config: LightdashMcpEnvConfig): McpServer {
    const api = createLightdashRestClient(config);
    const server = new McpServer({
        name: 'lightdash-local-mcp',
        version: '0.2098.2',
    });

    server.tool(
        'lightdash_list_explores',
        '列出项目 explores（GET /api/v1/projects/{projectUuid}/explores）',
        listExploresParams,
        async (args) => {
            const projectUuid = resolveProjectUuid(config, args.projectUuid);
            const filtered = args.filtered ?? true;
            const data = await api.listExplores(projectUuid, filtered);
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

    server.tool(
        'lightdash_get_explore',
        '获取 explore 与字段元数据（GET .../explores/{exploreId}）',
        getExploreParams,
        async (args) => {
            const projectUuid = resolveProjectUuid(config, args.projectUuid);
            const data = await api.getExplore(projectUuid, args.exploreId);
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

    server.tool(
        'lightdash_run_metric_query',
        'POST metric-query 后轮询 GET query 直至 ready，返回 rows/columns',
        runMetricQueryParams,
        async (args) => {
            const projectUuid = resolveProjectUuid(config, args.projectUuid);
            const pageSize = args.pageSize ?? 500;
            const maxPollAttempts = args.maxPollAttempts ?? 120;
            const pollIntervalMs = args.pollIntervalMs ?? 500;
            const result = await api.runMetricQueryUntilReady(
                projectUuid,
                {
                    context: args.context as never,
                    invalidateCache: args.invalidateCache,
                    parameters: args.parameters as never,
                    dateZoom: args.dateZoom as never,
                    pivotConfiguration: args.pivotConfiguration as never,
                    dashboardUuid: args.dashboardUuid,
                    query: args.query,
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

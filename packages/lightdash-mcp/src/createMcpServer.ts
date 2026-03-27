import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import type { LightdashMcpEnvConfig } from './config';
import { createLightdashRestClient } from './lightdashRest';
import {
    getHttpRequestApiKey,
    getHttpRequestMaskedKey,
    getHttpRequestUserEmail,
} from './requestContext';

/**
 * MCP SDK 的 `server.tool` 会对 `z.objectOutputType<Args>` 做深层推导，易触发 TS2589。
 * 这里用窄化后的 handler 类型注册，运行时仍由 SDK 用 Zod 校验入参。
 * 须使用四参数 tool(name, desc, params, cb)：勿传第五参 `{}` 作 annotations——SDK 将空对象判为 ZodRawShape，会把回调错位成非函数（cb is not a function）。
 */
function registerToolTyped(
    server: McpServer,
    name: string,
    description: string,
    params: ZodRawShape,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
): void {
    // 必须 bind(server)：裸引用 server.tool 再调用会丢失 this，导致 _registeredTools 为 undefined
    const register = server.tool.bind(server) as (
        n: string,
        desc: string,
        schema: ZodRawShape,
        cb: (args: Record<string, unknown>) => Promise<CallToolResult>,
    ) => void;
    const wrapped = async (
        args: Record<string, unknown>,
    ): Promise<CallToolResult> => {
        const userEmail = getHttpRequestUserEmail() ?? 'unknown';
        const maskedKey = getHttpRequestMaskedKey() ?? '***';
        process.stderr.write(
            `[ToolCall] ${name} | key: ${maskedKey} | ${userEmail}\n`,
        );
        return handler(args);
    };
    register(name, description, params, wrapped);
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
    exploreName: z.string().min(1),
    dimensions: z.array(z.string()).optional(),
    metrics: z.array(z.string()).optional(),
    filters: z.any().optional(),
    sorts: z.any().optional(),
    limit: z.number().optional(),
    tableCalculations: z.any().optional(),
    additionalMetrics: z.any().optional(),
    customDimensions: z.any().optional(),
    timezone: z.string().optional(),
    metricOverrides: z.any().optional(),
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

// ----- 新增：语义化工具参数 -----

const contentTypeEnum = z.enum(['chart', 'dashboard', 'space']);

const searchContentParams = {
    apiKey: z.string().optional(),
    projectUuid: z.string().optional(),
    search: z.string().optional(),
    contentTypes: z.array(contentTypeEnum).optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
} satisfies ZodRawShape;

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

const listProjectsParams = {
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
            'apiKey is required (x-api-key header, tool argument, or LIGHTDASH_API_KEY)',
        );
    }
    return key;
}

function parseJsonString(value: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
}

function toStringArray(value: unknown): string[] {
    const raw =
        typeof value === 'string' ? parseJsonString(value) : value;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is string => typeof item === 'string');
}

function toObject(value: unknown): Record<string, unknown> {
    const raw =
        typeof value === 'string' ? parseJsonString(value) : value;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

function toArray(value: unknown): unknown[] {
    const raw =
        typeof value === 'string' ? parseJsonString(value) : value;
    return Array.isArray(raw) ? raw : [];
}

function toSorts(value: unknown): unknown[] {
    const raw = toArray(value);
    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const obj = item as {
                fieldId?: unknown;
                columnId?: unknown;
                descending?: unknown;
                order?: unknown;
                orientation?: unknown;
            };
            const fieldId =
                typeof obj.fieldId === 'string'
                    ? obj.fieldId
                    : typeof obj.columnId === 'string'
                      ? obj.columnId
                      : undefined;
            if (!fieldId) return null;

            const descending =
                typeof obj.descending === 'boolean'
                    ? obj.descending
                    : typeof obj.order === 'string'
                      ? obj.order.toLowerCase() === 'desc'
                      : typeof obj.orientation === 'string'
                        ? obj.orientation.toLowerCase() === 'desc'
                        : false;

            return { fieldId, descending };
        })
        .filter((x): x is { fieldId: string; descending: boolean } => x !== null);
}

function normalizeFilterRule(
    candidate: unknown,
    fallbackFieldId?: string,
): Record<string, unknown> | null {
    if (!candidate || typeof candidate !== 'object') return null;
    const src = candidate as {
        id?: unknown;
        target?: unknown;
        operator?: unknown;
        values?: unknown;
        fieldId?: unknown;
    };
    const target =
        src.target && typeof src.target === 'object'
            ? (src.target as Record<string, unknown>)
            : undefined;
    const targetFieldId =
        target && typeof target.fieldId === 'string'
            ? target.fieldId
            : typeof src.fieldId === 'string'
              ? src.fieldId
              : fallbackFieldId;
    if (!targetFieldId) return null;

    const operator =
        typeof src.operator === 'string' && src.operator.length > 0
            ? src.operator
            : 'equals';
    const values = Array.isArray(src.values) ? src.values : [];

    return {
        id:
            typeof src.id === 'string' && src.id.length > 0
                ? src.id
                : `${targetFieldId}-${operator}`,
        target: { fieldId: targetFieldId },
        operator,
        values,
    };
}

function toFilters(value: unknown): Record<string, unknown> {
    const raw =
        typeof value === 'string' ? parseJsonString(value) : value;
    if (!raw) return {};

    // Already in expected grouped shape
    if (
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        raw !== null &&
        ('dimensions' in raw || 'metrics' in raw || 'tableCalculations' in raw)
    ) {
        return raw as Record<string, unknown>;
    }

    // Array form -> treat as dimensions filter list
    if (Array.isArray(raw)) {
        const rules = raw
            .map((rule) => normalizeFilterRule(rule))
            .filter((r): r is Record<string, unknown> => r !== null);
        return rules.length > 0 ? { dimensions: rules } : {};
    }

    // Map form: { fieldId: {...rule} }
    if (typeof raw === 'object' && raw !== null) {
        const rules = Object.entries(raw as Record<string, unknown>)
            .map(([fieldId, rule]) => normalizeFilterRule(rule, fieldId))
            .filter((r): r is Record<string, unknown> => r !== null);
        return rules.length > 0 ? { dimensions: rules } : {};
    }

    return {};
}

export function createLightdashMcpServer(
    config: LightdashMcpEnvConfig,
): McpServer {
    const api = createLightdashRestClient(config);
    const server = new McpServer({
        name: 'lightdash-local-mcp',
        version: '0.2098.2',
    });

    // --- 分析师优先：项目 / 空间 / 看板与图表 ---

    registerToolTyped(
        server,
        'lightdash_list_projects',
        '列出你有权限访问的项目；不知道选哪个项目时先用它。',
        listProjectsParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const data = await api.listProjects(apiKey);
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
        'lightdash_search_content',
        '按关键词查找看板、已保存的图表、空间（文件夹）；可分页。contentTypes 可选：chart、dashboard、space。',
        searchContentParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveProjectUuid(
                config,
                args.projectUuid as string | undefined,
            );
            const data = await api.searchContent(apiKey, projectUuid, {
                search: args.search as string | undefined,
                contentTypes: args.contentTypes as
                    | ('chart' | 'dashboard' | 'space')[]
                    | undefined,
                page: args.page as number | undefined,
                pageSize: args.pageSize as number | undefined,
            });
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
        'lightdash_list_spaces',
        '列出当前项目下的空间（内容文件夹）。',
        listSpacesParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const projectUuid = resolveProjectUuid(
                config,
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
        'lightdash_get_saved_chart',
        '查看某张已保存图表的名称、可用参数、依赖的数据主题；跑数前先确认参数怎么填。',
        getSavedChartParams,
        async (args) => {
            const apiKey = resolveApiKey(
                config,
                args.apiKey as string | undefined,
            );
            const data = await api.getSavedChart(
                apiKey,
                args.chartUuid as string,
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
        'lightdash_run_saved_chart',
        '按已保存图表跑数；可用 parameters 传筛选（如年份、区域）。limit 会按环境上限自动封顶。',
        runSavedChartParams,
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

    // --- 即席探索（需字段 ID，适合自定义分析）---

    registerToolTyped(
        server,
        'lightdash_list_explores',
        '列出可自助分析的数据主题（来自数据模型），不是「已保存图表」列表。',
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
        '查看某数据主题下有哪些维度和指标（字段 ID），用于临时分析前选字段。',
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
        '高级：自选维度、指标、筛选做即席查询；需先 get_explore 拿到正确字段 ID。注意：参数为扁平字段，不使用 query 嵌套对象。',
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
                    query: {
                        exploreName: args.exploreName as string,
                        dimensions: toStringArray(args.dimensions),
                        metrics: toStringArray(args.metrics),
                        filters: toFilters(args.filters),
                        sorts: toSorts(args.sorts),
                        limit: args.limit as number | undefined,
                        tableCalculations: toArray(args.tableCalculations),
                        additionalMetrics: args.additionalMetrics as unknown,
                        customDimensions: args.customDimensions as unknown,
                        timezone: args.timezone as string | undefined,
                        metricOverrides: args.metricOverrides as unknown,
                    },
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

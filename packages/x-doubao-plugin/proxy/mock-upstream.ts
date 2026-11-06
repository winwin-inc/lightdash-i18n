/**
 * 假上游：模拟马上赢 X 平台 MCP（仅供本地联调，不连生产）
 *
 *   node proxy/mock-upstream.ts
 *
 * 暴露与真实平台同名同参的工具：get_my_access / list_explores /
 * find_fields / run_metric_query，并注入真实量级的延迟与行数。
 */
import http from 'node:http';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const PORT = Number(process.env.MOCK_PORT ?? 8790);
const DEMO_KEY = process.env.MOCK_KEY ?? 'ldpat_demo';

const TOOLS = [
    {
        name: 'get_my_access',
        description: '返回当前令牌可见的组织、项目、权限',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_explores',
        description: '列出项目 explores',
        inputSchema: {
            type: 'object',
            properties: {
                projectUuid: { type: 'string' },
                search: { type: 'string' },
            },
        },
    },
    {
        name: 'find_fields',
        description: '在指定 explore 内查找字段',
        inputSchema: {
            type: 'object',
            properties: {
                exploreName: { type: 'string' },
                projectUuid: { type: 'string' },
            },
            required: ['exploreName'],
        },
    },
    {
        name: 'run_metric_query',
        description: '执行指标查询',
        inputSchema: {
            type: 'object',
            properties: {
                exploreName: { type: 'string' },
                dimensions: { type: 'array', items: { type: 'string' } },
                metrics: { type: 'array', items: { type: 'string' } },
                filters: { type: 'object' },
                sorts: { type: 'array' },
                limit: { type: 'number' },
            },
            required: ['exploreName'],
        },
    },
] as const;

const EXPLORES = [
    { name: 'category_trend', label: '品类趋势' },
    { name: 'brand_share', label: '品牌份额' },
    { name: 'group_share', label: '集团市占率' },
    { name: 'sku_rank', label: 'SKU 排名' },
    { name: 'channel_mix', label: '渠道结构' },
    { name: 'price_band', label: '价格带分布' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function prng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1_664_525 + 1_013_904_223) >>> 0;
        return s / 0x1_0000_0000;
    };
}

function seedOf(text: string): number {
    let h = 2_166_136_261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16_777_619);
    }
    return h >>> 0;
}

type Args = Record<string, unknown>;

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

async function runMetricQuery(args: Args) {
    const exploreName = typeof args.exploreName === 'string' ? args.exploreName : '';
    const dimensions = asStringArray(args.dimensions);
    const metrics = asStringArray(args.metrics);
    const limit = typeof args.limit === 'number' ? args.limit : 400;

    // 模拟真实查询耗时
    await sleep(250 + Math.round(Math.abs(seedOf(exploreName) % 150)));

    const rand = prng(seedOf(exploreName + dimensions.join(',') + metrics.join(',')));
    const rowCount = Math.min(limit, 400);
    const rows = Array.from({ length: rowCount }, (_, i) => {
        const row: Record<string, unknown> = {
            [`${exploreName}_period`]: `2026-10-0${(i % 7) + 1}`,
        };
        for (const dim of dimensions) {
            row[dim] = `${dim.replace(/^.*_/, '')}-${(i % 5) + 1}`;
        }
        for (const metric of metrics.length > 0 ? metrics : [`${exploreName}_gmv`]) {
            row[metric] = Math.round(rand() * 1_000_000) / 100;
        }
        row[`${exploreName}_note`] =
            '这一段是刻意做长的明细描述字段，用来模拟真实返回体，确保落盘与截断逻辑被验证到。';
        return row;
    });

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify({
                    queryUuid: `q-${Math.abs(seedOf(exploreName)) % 100_000}`,
                    rows: rows.length,
                    note: '明细见 structuredContent',
                }),
            },
        ],
        structuredContent: {
            queryUuid: `q-${Math.abs(seedOf(exploreName)) % 100_000}`,
            valueFormat: 'raw',
            rows,
        },
    };
}

function createMockServer(apiKey: string | null): Server {
    const server = new Server(
        { name: 'mock-x-platform', version: '0.1.0' },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        if (apiKey !== DEMO_KEY) {
            throw new Error('401 invalid token');
        }
        return { tools: TOOLS };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (apiKey !== DEMO_KEY) {
            return {
                content: [
                    { type: 'text' as const, text: '401 令牌无效（mock）' },
                ],
                isError: true,
            };
        }

        switch (request.params.name) {
            case 'get_my_access':
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({
                                organization: '品牌CT（mock）',
                                projects: [{ projectUuid: 'proj-demo', name: 'MAT2609' }],
                                scopes: ['read'],
                            }),
                        },
                    ],
                };
            case 'list_explores':
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({ explores: EXPLORES }),
                        },
                    ],
                };
            case 'find_fields': {
                const exploreName =
                    typeof request.params.arguments?.exploreName === 'string'
                        ? request.params.arguments.exploreName
                        : 'category_trend';
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({
                                exploreName,
                                fields: [
                                    { fieldId: `${exploreName}_period`, type: 'dimension' },
                                    { fieldId: `${exploreName}_category`, type: 'dimension' },
                                    { fieldId: `${exploreName}_gmv`, type: 'metric' },
                                    { fieldId: `${exploreName}_share`, type: 'metric' },
                                ],
                            }),
                        },
                    ],
                };
            }
            case 'run_metric_query':
                return runMetricQuery(request.params.arguments ?? {});
            default:
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `未知工具：${request.params.name}`,
                        },
                    ],
                    isError: true,
                };
        }
    });

    return server;
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/mcp' || req.method !== 'POST') {
        res.writeHead(404).end('not found');
        return;
    }

    const raw = req.headers['x-api-key'];
    const apiKey = Array.isArray(raw) ? raw[0] : raw;

    const server = createMockServer(apiKey ?? null);
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });
    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    try {
        const body = await readBody(req);
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
    } catch (err) {
        process.stderr.write(`[mock error] ${String(err)}\n`);
        if (!res.headersSent) res.writeHead(500).end('error');
    }
}).listen(PORT, () => {
    process.stderr.write(`mock x-platform listening on http://127.0.0.1:${PORT}/mcp\n`);
    process.stderr.write(`demo key: ${DEMO_KEY}\n`);
});

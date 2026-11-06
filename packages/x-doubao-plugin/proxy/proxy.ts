/**
 * 批量代理 MCP Server（最小实现）
 *
 * 作用：在「马上赢 X 平台 MCP」前面加一层，解决两个问题
 *   1. 上游是单表/单 explore 查询 → 模型只能一张张查，N 次往返
 *   2. 明细行 MB 级回灌上下文 → 又慢又贵
 *
 * 做法：
 *   - 工具名全部透传（get_my_access / list_explores / find_fields / run_metric_query …）
 *     → 已有的 skill 不用改
 *   - 额外提供一个 x_batch_query，一次并发执行 N 个查询
 *     → 模型只能批量调，无单表入口
 *   - 明细落盘，只回摘要 + handle
 *     → 上下文只进 KB 级
 *
 * 运行：node proxy/proxy.ts
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
    extractErrorText,
    extractRows,
    summarizeOutcome,
    toNdjson,
    type RowRecord,
} from './aggregate.ts';
import { API_KEY_HEADER, connectUpstream, type Upstream } from './upstream.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(HERE, '..', '.data');
const PORT = Number(process.env.PORT ?? 8788);
const MCP_PATH = '/mcp';
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS ?? 90_000);
const MAX_QUERIES = Number(process.env.MAX_QUERIES ?? 10);

const BATCH_TOOL = {
    name: 'x_batch_query',
    description:
        '一次并发执行多个 run_metric_query 查询，返回聚合摘要。' +
        '需要多个 explore 或多个口径时，必须合并到这一次调用里，不要串行调用 run_metric_query。' +
        '默认只返回每个查询的行数、列名、数值合计与首行样例；需要明细时传 detail=true，' +
        '明细不会进入上下文，只返回 detailHandle。',
    inputSchema: {
        type: 'object',
        properties: {
            queries: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_QUERIES,
                description: '要执行的查询，一次传全部',
                items: {
                    type: 'object',
                    properties: {
                        label: {
                            type: 'string',
                            description: '该查询的短标签，用于在结果里区分',
                        },
                        exploreName: { type: 'string' },
                        dimensions: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                        metrics: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                        filters: { type: 'object' },
                        sorts: { type: 'array' },
                        limit: { type: 'number' },
                    },
                    required: ['label', 'exploreName'],
                },
            },
            projectUuid: {
                type: 'string',
                description: '缺省时使用令牌默认项目',
            },
            detail: {
                type: 'boolean',
                description: '是否落盘明细，默认 false',
            },
        },
        required: ['queries'],
    },
} as const;

type BatchQuery = {
    label: string;
    exploreName: string;
    dimensions?: string[];
    metrics?: string[];
    filters?: Record<string, unknown>;
    sorts?: unknown[];
    limit?: number;
};

const AUTH_HINT =
    '马上赢 X 平台令牌缺失或无效。请到 插件·技能·伙伴 → 我安装的 → 卸载并重新安装插件，' +
    '重新填写 PAT（在 https://x.brandct.com/generalSettings/personalAccessTokens 创建）。';

function authError(message: string) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify({ error: 'auth_failed', message }),
            },
        ],
        isError: true,
    };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`${label} 超时（${ms}ms）`)),
            ms,
        );
        timer.unref?.();
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err: unknown) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

async function runBatch(
    upstream: Upstream,
    queries: BatchQuery[],
    projectUuid: string | undefined,
    detail: boolean,
) {
    const started = Date.now();

    const outcomes = await Promise.all(
        queries.map(async (query) => {
            const queryStart = Date.now();
            const args: Record<string, unknown> = {
                exploreName: query.exploreName,
            };
            if (projectUuid) args.projectUuid = projectUuid;
            if (query.dimensions?.length) args.dimensions = query.dimensions;
            if (query.metrics?.length) args.metrics = query.metrics;
            if (query.filters) args.filters = query.filters;
            if (query.sorts?.length) args.sorts = query.sorts;
            if (typeof query.limit === 'number') args.limit = query.limit;

            try {
                const result = await withTimeout(
                    upstream.client.callTool({
                        name: 'run_metric_query',
                        arguments: args,
                    }),
                    QUERY_TIMEOUT_MS,
                    query.label,
                );
                const elapsedMs = Date.now() - queryStart;
                if ((result as { isError?: boolean }).isError) {
                    return {
                        label: query.label,
                        rows: [] as RowRecord[],
                        elapsedMs,
                        error: extractErrorText(result),
                    };
                }
                return {
                    label: query.label,
                    rows: extractRows(result),
                    elapsedMs,
                    error: null as string | null,
                };
            } catch (err) {
                return {
                    label: query.label,
                    rows: [] as RowRecord[],
                    elapsedMs: Date.now() - queryStart,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        }),
    );

    const summaries = outcomes.map((o) =>
        summarizeOutcome(o.label, o.rows, o.elapsedMs, o.error),
    );

    const allRows = outcomes.flatMap((o) => o.rows);
    let detailHandle: string | null = null;
    let detailBytes = 0;

    if (detail && allRows.length > 0) {
        const ndjson = toNdjson(allRows);
        detailBytes = Buffer.byteLength(ndjson);
        await mkdir(DATA_DIR, { recursive: true });
        const file = path.join(DATA_DIR, `batch-${randomUUID()}.ndjson`);
        await writeFile(file, ndjson, 'utf8');
        detailHandle = `file://${file}`;
    }

    const payload = {
        results: summaries,
        rowCount: allRows.length,
        failed: summaries.filter((s) => !s.ok).map((s) => s.label),
        elapsedMs: Date.now() - started,
        detailHandle,
    };

    const text = JSON.stringify(payload);
    process.stderr.write(
        `[x_batch_query] queries=${queries.length} rows=${allRows.length} ` +
            `context=${Buffer.byteLength(text)}B detail=${detailBytes}B ` +
            `elapsed=${payload.elapsedMs}ms failed=${payload.failed.length}\n`,
    );

    return { content: [{ type: 'text' as const, text }] };
}

function createProxyServer(apiKey: string | null): Server {
    const server = new Server(
        { name: 'x-batch-proxy', version: '0.1.0' },
        { capabilities: { tools: {} } },
    );

    let upstream: Upstream | null = null;
    let connectError: string | null = null;

    const ensureUpstream = async (): Promise<Upstream> => {
        if (upstream) return upstream;
        if (!apiKey) throw new Error(AUTH_HINT);
        if (connectError) throw new Error(connectError);
        try {
            upstream = await connectUpstream(apiKey);
            return upstream;
        } catch (err) {
            connectError = `${AUTH_HINT}（上游连接失败：${
                err instanceof Error ? err.message : String(err)
            }）`;
            throw new Error(connectError);
        }
    };

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        try {
            const client = await ensureUpstream();
            const { tools } = await client.client.listTools();
            return { tools: [...tools, BATCH_TOOL] };
        } catch (err) {
            // 上游不可用时不隐瞒：仍给出批量工具，让模型拿到明确的鉴权错误
            process.stderr.write(
                `[listTools] 上游不可用：${
                    err instanceof Error ? err.message : String(err)
                }\n`,
            );
            return { tools: [BATCH_TOOL] };
        }
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: rawArgs } = request.params;

        if (name === BATCH_TOOL.name) {
            if (!apiKey) return authError(AUTH_HINT);
            const args = (rawArgs ?? {}) as {
                queries?: BatchQuery[];
                projectUuid?: string;
                detail?: boolean;
            };
            const queries = args.queries ?? [];
            if (queries.length === 0) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({
                                error: 'no_queries',
                                message:
                                    'queries 不能为空。请把所有需要的查询合并成一次调用。',
                            }),
                        },
                    ],
                    isError: true,
                };
            }
            if (queries.length > MAX_QUERIES) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({
                                error: 'too_many_queries',
                                message: `单次最多 ${MAX_QUERIES} 个查询，请拆分批次。`,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
            try {
                const client = await ensureUpstream();
                return await runBatch(
                    client,
                    queries,
                    args.projectUuid,
                    args.detail === true,
                );
            } catch (err) {
                return authError(err instanceof Error ? err.message : String(err));
            }
        }

        // 其余工具名全部透传到上游，保持与直连时一致
        try {
            const client = await ensureUpstream();
            return (await client.client.callTool(request.params)) as never;
        } catch (err) {
            return authError(err instanceof Error ? err.message : String(err));
        }
    });

    server.onclose = () => {
        void upstream?.close();
    };

    return server;
}

// ── HTTP 入口（无状态 Streamable HTTP） ──────────────────────────────
function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    if (url.pathname !== MCP_PATH) {
        res.writeHead(404).end('not found');
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' }).end('Method Not Allowed');
        return;
    }

    const rawKey = req.headers[API_KEY_HEADER];
    const apiKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    const server = createProxyServer(apiKey ?? null);
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
        process.stderr.write(
            `[error] ${err instanceof Error ? err.stack : String(err)}\n`,
        );
        if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32_603, message: 'Internal server error' },
                    id: null,
                }),
            );
        }
    }
});

httpServer.listen(PORT, () => {
    process.stderr.write(`x-batch-proxy listening on http://127.0.0.1:${PORT}${MCP_PATH}\n`);
    process.stderr.write(`upstream: ${process.env.UPSTREAM_URL ?? 'https://mcp-x.brandct.com/mcp'}\n`);
    process.stderr.write(`data dir: ${DATA_DIR}\n`);
});

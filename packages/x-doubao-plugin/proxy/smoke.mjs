#!/usr/bin/env node
/**
 * 对比实验：直连上游逐个查 vs 走代理批量查
 *
 *   node proxy/mock-upstream.ts &      # 假上游
 *   UPSTREAM_URL=http://127.0.0.1:8790/mcp node proxy/proxy.ts &
 *   node proxy/smoke.mjs               # 本脚本
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PROXY = process.env.PROXY_ENDPOINT ?? 'http://127.0.0.1:8788/mcp';
const API_KEY = process.env.DEMO_KEY ?? 'ldpat_demo';

const EXPLORES = [
    'category_trend',
    'brand_share',
    'group_share',
    'sku_rank',
    'channel_mix',
    'price_band',
];

const transport = new StreamableHTTPClientTransport(new URL(PROXY), {
    requestInit: { headers: { 'x-api-key': API_KEY } },
});
const client = new Client({ name: 'x-plugin-smoke', version: '0.1.0' });
await client.connect(transport);

const textOf = (res) =>
    (res.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n');

const tools = await client.listTools();
console.log(`工具：${tools.tools.map((t) => t.name).join(', ')}\n`);

const auth = await client.callTool({ name: 'get_my_access', arguments: {} });
console.log(`get_my_access → ${textOf(auth).slice(0, 160)}\n`);

// ── A：串行逐个查（现状） ───────────────────────────────────────────
const serialStart = Date.now();
let serialBytes = 0;
for (const explore of EXPLORES) {
    const res = await client.callTool({
        name: 'run_metric_query',
        arguments: {
            exploreName: explore,
            dimensions: [`${explore}_period`],
            metrics: [`${explore}_gmv`],
        },
    });
    serialBytes += Buffer.byteLength(textOf(res) + JSON.stringify(res.structuredContent ?? {}));
}
const serialMs = Date.now() - serialStart;

// ── B：一次批量（代理） ────────────────────────────────────────────
const batchStart = Date.now();
const batch = await client.callTool({
    name: 'x_batch_query',
    arguments: {
        queries: EXPLORES.map((explore) => ({
            label: explore,
            exploreName: explore,
            dimensions: [`${explore}_period`],
            metrics: [`${explore}_gmv`],
        })),
        detail: true,
    },
});
const batchMs = Date.now() - batchStart;
const batchText = textOf(batch);
const batchBytes = Buffer.byteLength(batchText);

// ── 结论 ──────────────────────────────────────────────────────────
const pct = (a, b) => `${(((a - b) / a) * 100).toFixed(0)}%`;
console.log('┌──────────────┬──────────┬──────────────┐');
console.log('│ 方式         │ 墙钟耗时 │ 上下文体积   │');
console.log('├──────────────┼──────────┼──────────────┤');
console.log(`│ 逐个查 ×6    │ ${String(serialMs).padStart(6)}ms │ ${(serialBytes / 1024).toFixed(1).padStart(8)} KB │`);
console.log(`│ 批量 ×1      │ ${String(batchMs).padStart(6)}ms │ ${(batchBytes / 1024).toFixed(1).padStart(8)} KB │`);
console.log('└──────────────┴──────────┴──────────────┘');
console.log(`\n耗时下降 ${pct(serialMs, batchMs)}，上下文下降 ${pct(serialBytes, batchBytes)}`);

const payload = JSON.parse(batchText);
console.log(`行数 ${payload.rowCount}，明细 handle：${payload.detailHandle}`);
console.log(`\n摘要样例：${JSON.stringify(payload.results[0]).slice(0, 400)}`);

await client.close();

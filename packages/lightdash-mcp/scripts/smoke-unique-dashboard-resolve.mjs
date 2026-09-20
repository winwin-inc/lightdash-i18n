#!/usr/bin/env node
/**
 * 发布前冒烟：唯一看板候选自动 resolved。
 *
 * 用法（在 packages/lightdash-mcp 下）：
 *   node scripts/smoke-unique-dashboard-resolve.mjs
 *   # 建议同时跑：
 *   pnpm exec tsx --test src/lib/dashboardContextResolver.test.ts
 *
 * 部署后连线上验证（不传 dashboardUuid 应不再 selection_required）：
 *   SMOKE_LIVE=1 LIGHTDASH_MCP_URL=http://mcp.x.brandct.com/mcp \
 *     LIGHTDASH_API_KEY=... LIGHTDASH_PROJECT_UUID=... \
 *     node scripts/smoke-unique-dashboard-resolve.mjs
 *
 * 说明：本脚本内联了与 createDashboardContextResolver 相同的「唯一→resolved」判定，
 * 用于不依赖 ts/esm 互操作时的快速检查；权威行为以 unit test + 部署后 LIVE 为准。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

function resolveLikeMcp(contexts) {
  if (!contexts.length) return { status: 'none' };
  if (contexts.length === 1) {
    const only = contexts[0];
    return {
      status: 'resolved',
      context: {
        dashboardUuid: only.dashboardUuid,
        source: 'uniqueExploreContext',
        candidateCount: 1,
      },
    };
  }
  return {
    status: 'needs_selection',
    candidateCount: contexts.length,
    candidates: contexts,
  };
}

function inlineUnit() {
  const unique = resolveLikeMcp([
    {
      dashboardUuid: '357c447c-9484-4eba-9f1d-b833139245db',
      dashboardSlug: 'c60',
      dashboardName: '新品数据库',
    },
  ]);
  assert.equal(unique.status, 'resolved');
  assert.equal(unique.context.source, 'uniqueExploreContext');

  const multi = resolveLikeMcp([
    { dashboardUuid: 'a', dashboardName: 'A' },
    { dashboardUuid: 'b', dashboardName: 'B' },
  ]);
  assert.equal(multi.status, 'needs_selection');
  assert.equal(multi.candidateCount, 2);

  const none = resolveLikeMcp([]);
  assert.equal(none.status, 'none');
  console.log('OK inline policy: unique→resolved, multi→needs_selection, none→none');
}

function runOfficialUnit() {
  const r = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'tsx', '--test', 'src/lib/dashboardContextResolver.test.ts'],
    { cwd: pkgRoot, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) {
    throw new Error('official unit test failed');
  }
  console.log('OK official unit: dashboardContextResolver.test.ts');
}

async function liveSmoke() {
  const mcpUrl = process.env.LIGHTDASH_MCP_URL?.trim();
  const apiKey = process.env.LIGHTDASH_API_KEY?.trim();
  const projectUuid = process.env.LIGHTDASH_PROJECT_UUID?.trim();
  if (!mcpUrl || !apiKey || !projectUuid) {
    throw new Error('SMOKE_LIVE=1 needs LIGHTDASH_MCP_URL / API_KEY / PROJECT_UUID');
  }
  let id = 0;
  async function rpc(method, params) {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();
    if (text.trim().startsWith('{')) return JSON.parse(text);
    const dataLines = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(dataLines[i]);
        if (parsed.result !== undefined || parsed.error !== undefined) return parsed;
      } catch {}
    }
    throw new Error('cannot parse MCP body: ' + text.slice(0, 200));
  }

  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-unique-dash', version: '0.0.1' },
  });
  await rpc('tools/call', { name: 'set_project', arguments: { projectUuid } });
  const call = await rpc('tools/call', {
    name: 'run_metric_query',
    arguments: {
      exploreName: 'report_newproduct_hotsales',
      projectUuid,
      dimensions: [
        'report_newproduct_hotsales_biz_date',
        'report_newproduct_hotsales_cls_4',
        'report_newproduct_hotsales_brand_name',
      ],
      metrics: ['report_newproduct_hotsales_total_amount'],
      filters: {
        dimensions: {
          id: 'root',
          and: [
            {
              id: 'c',
              target: { fieldId: 'report_newproduct_hotsales_cls_4' },
              operator: 'equals',
              values: ['常温纯牛奶'],
            },
          ],
        },
      },
      sorts: [{ fieldId: 'report_newproduct_hotsales_total_amount', descending: true }],
      limit: 3,
    },
  });
  const content = call?.result?.content;
  const raw = Array.isArray(content)
    ? content.map((c) => c.text || '').join('\n')
    : JSON.stringify(call);
  if (raw.includes('dashboard_selection_required')) {
    throw new Error(
      'LIVE FAIL: still dashboard_selection_required (服务未带上本改动？)\n' + raw.slice(0, 400),
    );
  }
  console.log('OK live: no dashboard_selection_required');
  console.log(raw.slice(0, 400));
}

inlineUnit();
runOfficialUnit();
if (process.env.SMOKE_LIVE === '1') {
  await liveSmoke();
} else {
  console.log('skip live (set SMOKE_LIVE=1 after deploy)');
}

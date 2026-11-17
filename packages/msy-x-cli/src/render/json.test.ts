import assert from 'node:assert/strict';
import test from 'node:test';
import { renderJson } from './json';
import { pickRows } from './detect';
import type { ToolResult } from '../types';

const toolResult = (partial: Partial<ToolResult>): ToolResult => ({
    structuredContent: undefined,
    content: [],
    isError: false,
    ...partial,
});

const render = (result: ToolResult, envelope: boolean, durationMs = 812) =>
    renderJson({
        tool: 'run_semantic_metric_query',
        result,
        envelope,
        site: 'x',
        durationMs,
        picked: pickRows(result),
    });

test('默认形态：structuredContent 原样输出（2 空格缩进 + 结尾换行）', () => {
    const result = toolResult({ structuredContent: { rows: [{ a: 1 }] } });
    const stdout = render(result, false);
    assert.equal(stdout, `${JSON.stringify({ rows: [{ a: 1 }] }, null, 2)}\n`);
    assert.deepEqual(JSON.parse(stdout), { rows: [{ a: 1 }] });
});

test('envelope 形态：ok/tool/data/meta 键序稳定，meta 含 site 与 durationMs', () => {
    const result = toolResult({ structuredContent: { rows: [{ a: 1 }] } });
    const stdout = render(result, true, 812);
    const parsed = JSON.parse(stdout) as {
        ok: boolean;
        tool: string;
        data: unknown;
        meta: Record<string, unknown>;
    };
    assert.deepEqual(Object.keys(parsed), ['ok', 'tool', 'data', 'meta']);
    assert.deepEqual(Object.keys(parsed.meta), ['site', 'durationMs']);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.tool, 'run_semantic_metric_query');
    assert.deepEqual(parsed.data, { rows: [{ a: 1 }] });
    assert.deepEqual(parsed.meta, { site: 'x', durationMs: 812 });
    assert.match(stdout, /"durationMs": 812/);
    assert.ok(stdout.endsWith('\n'));
});

test('只有 text（CSV）时输出 {csv, rows}', () => {
    const result = toolResult({
        content: [{ type: 'text', text: 'a,b\n1,2\n' }],
    });
    const stdout = render(result, false);
    const parsed = JSON.parse(stdout) as {
        csv: string;
        rows: Array<Record<string, string>>;
    };
    assert.deepEqual(Object.keys(parsed), ['csv', 'rows']);
    assert.equal(parsed.csv, 'a,b\n1,2\n');
    assert.deepEqual(parsed.rows, [{ a: '1', b: '2' }]);
});

test('无结构化无 CSV → 降级输出 {csv: \'\', rows: []}', () => {
    const stdout = render(toolResult({}), false);
    assert.equal(stdout, '{\n  "csv": "",\n  "rows": []\n}\n');
});

test('envelope 包住降级输出', () => {
    const stdout = render(toolResult({}), true, 0);
    const parsed = JSON.parse(stdout) as { data: Record<string, unknown> };
    assert.deepEqual(parsed.data, { csv: '', rows: [] });
    assert.deepEqual(Object.keys(parsed.meta), ['site', 'durationMs']);
});

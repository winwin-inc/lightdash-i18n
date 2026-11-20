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

test('D5：只有 text（真 CSV 源）时输出 {csv, rows}', () => {
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

test('D5/T6：text JSON 数据体原样输出（保留 pagination 等顶层键，无 csv 包装）', () => {
    const body = {
        results: [
            { uuid: 'u1', name: '看板一' },
            { uuid: 'u2', name: '看板二' },
        ],
        pagination: { page: 1, pageSize: 25, totalResults: 2 },
    };
    const result = toolResult({
        content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    });
    const stdout = render(result, false);
    const parsed = JSON.parse(stdout) as typeof body;
    assert.deepEqual(parsed, body);
    assert.ok(!('csv' in parsed));
    assert.ok(!('rows' in parsed));
});

test('D5：text 是 JSON 数组时输出数组本身', () => {
    const body = [{ a: 1 }, { a: 2 }];
    const result = toolResult({
        content: [{ type: 'text', text: JSON.stringify(body) }],
    });
    const stdout = render(result, false);
    assert.deepEqual(JSON.parse(stdout), body);
});

test('D5：```json 围栏输出剥围栏后的数据体', () => {
    const body = { siteUrl: 'https://x.brandct.com', total: 7 };
    const result = toolResult({
        content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(body)}\n\`\`\`` }],
    });
    const stdout = render(result, false);
    assert.deepEqual(JSON.parse(stdout), body);
});

test('D5：envelope 的 data 放解析后的数据体（非 {csv,rows}）', () => {
    const body = { results: [{ a: 1 }], pagination: { page: 1, totalResults: 1 } };
    const result = toolResult({
        content: [{ type: 'text', text: JSON.stringify(body) }],
    });
    const stdout = render(result, true);
    const parsed = JSON.parse(stdout) as { data: unknown };
    assert.deepEqual(parsed.data, body);
    assert.ok(!('csv' in (parsed.data as Record<string, unknown>)));
});

test('无结构化无 CSV → 原样输出文本（非 {csv,rows}）', () => {
    const stdout = render(toolResult({}), false);
    assert.equal(stdout, '""\n');
});

test('envelope 包住原样文本降级输出', () => {
    const stdout = render(toolResult({}), true, 0);
    const parsed = JSON.parse(stdout) as { data: unknown };
    assert.equal(parsed.data, '');
    assert.deepEqual(Object.keys(parsed.meta), ['site', 'durationMs']);
});

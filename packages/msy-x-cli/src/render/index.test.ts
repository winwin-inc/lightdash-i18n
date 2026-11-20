import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderResult } from './index';
import type { RenderInput, ToolResult } from '../types';
import { CliError } from '../cli/errors';

const fixture = (name: string): string =>
    readFileSync(join(__dirname, '../__fixtures__', name), 'utf8');

const makeInput = (overrides: Partial<RenderInput>): RenderInput => ({
    tool: 'run_semantic_metric_query',
    result: JSON.parse(
        fixture('runSemanticMetricQuery.json'),
    ) as ToolResult,
    format: 'json',
    envelope: false,
    out: null,
    quiet: false,
    startedAt: performance.now(),
    site: 'x',
    ...overrides,
});

test('json：原样 structuredContent（含嵌套 value 不转译），rows 填行数', () => {
    const output = renderResult(makeInput({ format: 'json' }));
    const { structuredContent } = JSON.parse(
        fixture('runSemanticMetricQuery.json'),
    ) as ToolResult;
    assert.equal(
        output.stdout,
        `${JSON.stringify(structuredContent, null, 2)}\n`,
    );
    assert.ok(output.stdout.includes('"raw": 1234.5'));
    assert.equal(output.rows, 2);
});

test('table：ASCII 表格，value.raw 展开为标量', () => {
    const output = renderResult(makeInput({ format: 'table' }));
    assert.ok(output.stdout.startsWith('+'));
    assert.match(output.stdout, /\| 1234\.5 +\|/);
    assert.equal(output.rows, 2);
});

test('csv：重序列化为 CSV 文本', () => {
    const output = renderResult(makeInput({ format: 'csv' }));
    assert.equal(
        output.stdout,
        'date,region,metric\n2024-01,华东,1234.5\n2024-02,华北,987.6\n',
    );
    assert.equal(output.rows, 2);
});

test('out 非 null：不产 stdout，仍返回行数', () => {
    const output = renderResult(makeInput({ out: '/tmp/x.json' }));
    assert.equal(output.stdout, '');
    assert.equal(output.rows, 2);
});

test('空行结果：json 降级正常，rows 为 0', () => {
    const result = JSON.parse(fixture('emptyRows.json')) as ToolResult;
    const output = renderResult(makeInput({ result, format: 'json' }));
    assert.equal(output.stdout, '{\n  "rows": []\n}\n');
    assert.equal(output.rows, 0);
});

test('无结构化无 CSV：原样输出文本，rows 为 null', () => {
    const output = renderResult(
        makeInput({ result: { structuredContent: undefined, content: [], isError: false } }),
    );
    assert.equal(output.stdout, '""\n');
    assert.equal(output.rows, null);
});

test('D5：text JSON 数据体原样输出（保留顶层键，无 csv 包装）', () => {
    const body = {
        results: [{ uuid: 'u1', name: '看板一' }],
        pagination: { page: 1, pageSize: 25, totalResults: 1 },
    };
    const output = renderResult(
        makeInput({
            result: {
                structuredContent: undefined,
                content: [{ type: 'text', text: JSON.stringify(body) }],
                isError: false,
            },
        }),
    );
    assert.deepEqual(JSON.parse(output.stdout), body);
    assert.ok(!output.stdout.includes('"csv"'));
    assert.equal(output.rows, 1);
});

test('D5：真 CSV 源才输出 {csv, rows}', () => {
    const output = renderResult(
        makeInput({
            result: {
                structuredContent: undefined,
                content: [{ type: 'text', text: 'a,b\n1,2\n' }],
                isError: false,
            },
        }),
    );
    const parsed = JSON.parse(output.stdout) as {
        csv: string;
        rows: Array<Record<string, string>>;
    };
    assert.deepEqual(Object.keys(parsed), ['csv', 'rows']);
    assert.equal(parsed.csv, 'a,b\n1,2\n');
    assert.deepEqual(parsed.rows, [{ a: '1', b: '2' }]);
});

test('坏 CSV 抛 CliError(PARSE_ERROR) 供上层统一输出', () => {
    const text = fixture('badCsv.txt');
    assert.throws(
        () =>
            renderResult(
                makeInput({
                    result: {
                        structuredContent: undefined,
                        content: [{ type: 'text', text }],
                        isError: false,
                    },
                }),
            ),
        (error: unknown) => error instanceof CliError,
    );
});

test('envelope 透传 site，durationMs 为非负数', () => {
    const output = renderResult(
        makeInput({ envelope: true, startedAt: performance.now() }),
    );
    const parsed = JSON.parse(output.stdout) as {
        meta: { site: string; durationMs: number };
    };
    assert.equal(parsed.meta.site, 'x');
    assert.ok(parsed.meta.durationMs >= 0);
});

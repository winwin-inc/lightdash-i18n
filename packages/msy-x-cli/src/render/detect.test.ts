import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickRows, pickText } from './detect';
import type { ToolResult } from '../types';

const fixture = (name: string): string =>
    readFileSync(join(__dirname, '../__fixtures__', name), 'utf8');

const toolResult = (partial: Partial<ToolResult>): ToolResult => ({
    structuredContent: undefined,
    content: [],
    isError: false,
    ...partial,
});

test('structuredContent 形状一：{rows: [...]}', () => {
    const picked = pickRows(
        toolResult({ structuredContent: { rows: [{ a: 1 }, { a: 2 }] } }),
    );
    assert.equal(picked.source, 'structured');
    assert.deepEqual(picked.columns, ['a']);
    assert.deepEqual(picked.rows, [{ a: 1 }, { a: 2 }]);
});

test('structuredContent 形状二：{data: {rows: [...]}}', () => {
    const picked = pickRows(
        toolResult({
            structuredContent: { data: { rows: [{ name: 'x' }] } },
        }),
    );
    assert.equal(picked.source, 'structured');
    assert.deepEqual(picked.columns, ['name']);
    assert.deepEqual(picked.rows, [{ name: 'x' }]);
});

test('structuredContent 形状三：{results: [...]}', () => {
    const picked = pickRows(
        toolResult({ structuredContent: { results: [{ id: 'abc' }] } }),
    );
    assert.equal(picked.source, 'structured');
    assert.deepEqual(picked.rows, [{ id: 'abc' }]);
});

test('嵌套 value.{raw,formatted} 只取 raw（fixture）', () => {
    const result = JSON.parse(
        fixture('runSemanticMetricQuery.json'),
    ) as ToolResult;
    const picked = pickRows(result);
    assert.equal(picked.source, 'structured');
    assert.deepEqual(picked.columns, ['date', 'region', 'metric']);
    assert.deepEqual(picked.rows, [
        { date: '2024-01', region: '华东', metric: 1234.5 },
        { date: '2024-02', region: '华北', metric: 987.6 },
    ]);
});

test('结构化为空行数组：source=structured、columns=null', () => {
    const result = JSON.parse(fixture('emptyRows.json')) as ToolResult;
    const picked = pickRows(result);
    assert.equal(picked.source, 'structured');
    assert.equal(picked.columns, null);
    assert.deepEqual(picked.rows, []);
});

test('退化路径：text 块拼成 CSV（引号内逗号/换行 + BOM）', () => {
    const text = fixture('runMetricQueryCsv.txt');
    const picked = pickRows(toolResult({ content: [{ type: 'text', text }] }));
    assert.equal(picked.source, 'csv');
    assert.deepEqual(picked.columns, ['date', 'city', '金额,元']);
    assert.deepEqual(picked.rows, [
        { date: '2024-01', city: '上海\n浦东', '金额,元': '100' },
        { date: '2024-02', city: '北京', '金额,元': '200' },
    ]);
});

test('坏 CSV（列数不齐）抛 PARSE_ERROR，message 含首行摘要', () => {
    const text = fixture('badCsv.txt');
    assert.throws(
        () => pickRows(toolResult({ content: [{ type: 'text', text }] })),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.equal((error as { code?: string }).code, 'PARSE_ERROR');
            assert.match((error as Error).message, /date,city,revenue/);
            return true;
        },
    );
});

test('无结构化无 text → source none、rows/columns 为 null', () => {
    const picked = pickRows(toolResult({}));
    assert.equal(picked.source, 'none');
    assert.equal(picked.columns, null);
    assert.equal(picked.rows, null);
});

test('未知 structuredContent 形状退到 CSV，text 为空则 none', () => {
    const picked = pickRows(
        toolResult({ structuredContent: { foo: 'bar' }, content: [] }),
    );
    assert.equal(picked.source, 'none');
    assert.equal(picked.rows, null);
});

test('六级-2：text 为 JSON 文本（含 rows 键）→ source json，不被当 CSV 拆成垃圾列', () => {
    const text = fixture('textJson.json');
    const picked = pickRows(toolResult({ content: [{ type: 'text', text }] }));
    assert.equal(picked.source, 'json');
    // JSON 正确取到 3 列，而不是被 CSV 拆成单列垃圾
    assert.deepEqual(picked.columns, [
        'pinleibaohsm_cls_top_id',
        'pinleibaohsm_cls_top_name',
        'pinleibaohsm_cls_top_gmv',
    ]);
    assert.equal(picked.rows?.length, 2);
    assert.deepEqual(picked.rows?.[0], {
        pinleibaohsm_cls_top_id: 'cls_top_001',
        pinleibaohsm_cls_top_name: '华东',
        pinleibaohsm_cls_top_gmv: 81200.5,
    });
});

test('六级-3：```json 围栏 → 剥围栏解析，source fenced-json', () => {
    const text = fixture('fencedJson.txt');
    const picked = pickRows(toolResult({ content: [{ type: 'text', text }] }));
    assert.equal(picked.source, 'fenced-json');
    assert.deepEqual(picked.columns, [
        'pinleibaohsm_cls_top_id',
        'pinleibaohsm_cls_top_name',
        'pinleibaohsm_cls_top_gmv',
    ]);
    assert.equal(picked.rows?.length, 2);
    assert.deepEqual(picked.rows?.[1], {
        pinleibaohsm_cls_top_id: 'cls_top_002',
        pinleibaohsm_cls_top_name: '品类TOP2',
        pinleibaohsm_cls_top_gmv: '8800.50',
    });
});

test('六级-5：XML 片段 → source xml、rows/columns 为 null，pickText 原样返回', () => {
    const text = fixture('xmlFindFields.txt');
    const result = toolResult({ content: [{ type: 'text', text }] });
    const picked = pickRows(result);
    assert.equal(picked.source, 'xml');
    assert.equal(picked.columns, null);
    assert.equal(picked.rows, null);
    assert.equal(pickText(result), text);
});

test('JSON 文本为单个对象（无 rows 键）→ 当单行记录，columns 为其键', () => {
    const text = fixture('singleObjectJson.txt');
    const picked = pickRows(toolResult({ content: [{ type: 'text', text }] }));
    assert.equal(picked.source, 'json');
    assert.deepEqual(picked.columns, [
        'pinleibaohsm_cls_top_id',
        'pinleibaohsm_cls_top_name',
        'pinleibaohsm_cls_top_gmv',
    ]);
    assert.deepEqual(picked.rows, [
        {
            pinleibaohsm_cls_top_id: 'cls_top_009',
            pinleibaohsm_cls_top_name: '全国TOP1',
            pinleibaohsm_cls_top_gmv: 99999.99,
        },
    ]);
});

test('JSON 路径同样走 unwrapCellValue：value.{raw,formatted} 只取 raw', () => {
    const text =
        '{"rows":[{"pinleibaohsm_cls_top_gmv":{"value":{"raw":123.4,"formatted":"123.40"}}}]}';
    const picked = pickRows(toolResult({ content: [{ type: 'text', text }] }));
    assert.equal(picked.source, 'json');
    assert.deepEqual(picked.rows, [{ pinleibaohsm_cls_top_gmv: 123.4 }]);
});

test('坏 JSON（单行无逗号）：回落到 none 而不是抛 JSON 异常', () => {
    const text = '{"pinleibaohsm_cls_top": oops}';
    const picked = pickRows(toolResult({ content: [{ type: 'text', text }] }));
    assert.equal(picked.source, 'none');
    assert.equal(picked.rows, null);
});

test('坏 JSON（首行含逗号 + 换行）：回落到 CSV 语义（PARSE_ERROR）', () => {
    const text = '{"a":1,"b":2\n"row","two",extra';
    assert.throws(
        () => pickRows(toolResult({ content: [{ type: 'text', text }] })),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.equal((error as { code?: string }).code, 'PARSE_ERROR');
            return true;
        },
    );
});

test('pickText 拼接多个 text 块并跳过非 text 块', () => {
    const result = toolResult({
        content: [
            { type: 'text', text: '{"a":' },
            { type: 'image', text: undefined },
            { type: 'text', text: '1}' },
        ],
    });
    assert.equal(pickText(result), '{"a":1}');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTable } from './table';

test('基础 ASCII 表格（快照）', () => {
    const rows = [
        { date: '2024-01', revenue: '100' },
        { date: '2024-02', revenue: '200' },
    ];
    assert.equal(
        renderTable(rows, { width: 100 }),
        [
            '+---------+---------+',
            '| date    | revenue |',
            '+---------+---------+',
            '| 2024-01 | 100     |',
            '| 2024-02 | 200     |',
            '+---------+---------+',
        ].join('\n'),
    );
});

test('单列超 40 字符截断加省略号（快照）', () => {
    const long = 'x'.repeat(45);
    const width = 40;
    assert.equal(
        renderTable([{ note: long }], { width: 100 }),
        [
            `+${'-'.repeat(width + 2)}+`,
            `| note${' '.repeat(width - 4)} |`,
            `+${'-'.repeat(width + 2)}+`,
            `| ${'x'.repeat(width - 1)}… |`,
            `+${'-'.repeat(width + 2)}+`,
        ].join('\n'),
    );
});

test('webUrl 字段固定为最后一列（快照）', () => {
    assert.equal(
        renderTable([{ webUrl: 'http://a', name: 'foo' }], { width: 100 }),
        [
            '+------+----------+',
            '| name | webUrl   |',
            '+------+----------+',
            '| foo  | http://a |',
            '+------+----------+',
        ].join('\n'),
    );
});

test('终端过窄时均分裁宽、不够再从末尾裁列（快照）', () => {
    // width=18 装不下 3 列（每列上限 < 3），裁掉 c 列后 a/b 均分
    assert.equal(
        renderTable([{ a: '12345', b: '12345', c: '12345' }], { width: 18 }),
        [
            '+-------+-------+',
            '| a     | b     |',
            '+-------+-------+',
            '| 12345 | 12345 |',
            '+-------+-------+',
        ].join('\n'),
    );
});

test('空结果返回 (no rows)', () => {
    assert.equal(renderTable([], { width: 100 }), '(no rows)');
});

test('缺省宽度回退 process.stdout.columns（管道下为 100）', () => {
    const output = renderTable([{ a: 'x' }]);
    assert.equal(
        output,
        ['+---+', '| a |', '+---+', '| x |', '+---+'].join('\n'),
    );
});

test('null/undefined 单元格渲染为空串', () => {
    const output = renderTable([{ a: null, b: undefined }, { a: 1, b: true }], {
        width: 100,
    });
    assert.equal(
        output,
        [
            '+---+------+',
            '| a | b    |',
            '+---+------+',
            '|   |      |',
            '| 1 | true |',
            '+---+------+',
        ].join('\n'),
    );
});

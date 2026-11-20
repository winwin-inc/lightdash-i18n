import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, toCsv } from './csv';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';

const fixture = (name: string): string =>
    readFileSync(join(__dirname, '../__fixtures__', name), 'utf8');

test('解析带 BOM 的 CSV，首列表头不含 BOM', () => {
    const rows = parseCsv(fixture('runMetricQueryCsv.txt'));
    assert.equal(rows.length, 2);
    assert.deepEqual(Object.keys(rows[0]), ['date', 'city', '金额,元']);
});

test('解析引号内逗号与换行', () => {
    const rows = parseCsv(fixture('runMetricQueryCsv.txt'));
    assert.deepEqual(rows[0], {
        date: '2024-01',
        city: '上海\n浦东',
        '金额,元': '100',
    });
    assert.deepEqual(rows[1], {
        date: '2024-02',
        city: '北京',
        '金额,元': '200',
    });
});

test('普通 CSV 返回字符串记录', () => {
    const rows = parseCsv('a,b\n1,2\n');
    assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('列数不齐 → CliError(PARSE_ERROR)，退出码 7，message 含首行摘要', () => {
    try {
        parseCsv(fixture('badCsv.txt'));
        assert.fail('应抛出 CliError');
    } catch (error) {
        assert.ok(error instanceof CliError);
        assert.equal(error.code, 'PARSE_ERROR');
        assert.equal(error.exitCode, ExitCode.PARSE_ERROR);
        assert.equal(error.exitCode, 7);
        assert.match(error.message, /date,city,revenue/);
    }
});

test('toCsv 对逗号/引号/换行做 RFC 4180 转义', () => {
    const csv = toCsv(['a', 'b,c'], [{ a: 'x"1"', 'b,c': 'y\nz' }]);
    assert.equal(csv, 'a,"b,c"\n"x""1""","y\nz"\n');
});

test('toCsv 空单元格与数字', () => {
    const csv = toCsv(['a', 'b'], [{ a: null, b: 3 }]);
    assert.equal(csv, 'a,b\n,3\n');
});

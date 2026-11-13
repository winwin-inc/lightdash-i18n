import { stringify } from 'csv-stringify';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PivotTableService } from './PivotTableService';

/**
 * Pivot CSV export used to build one giant string and copy it into a Buffer
 * (string matrix -> joined string -> Buffer). It now streams rows through
 * `csv-stringify` into the temp file, so we must prove the produced file is
 * byte-identical, otherwise customers parsing the CSV would see a change.
 */

const stringifyAll = (rows: string[][]): Promise<string> =>
    new Promise((resolve, reject) => {
        stringify(rows, { delimiter: ',' }, (error, output) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(output);
        });
    });

const tempFile = (suffix: string) =>
    path.join(
        os.tmpdir(),
        `pivot-csv-test-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}-${suffix}.csv`,
    );

describe('PivotTableService.writeRowsToCsvFile', () => {
    it('writes a UTF-8 BOM followed by the same bytes as a one-shot stringify', async () => {
        const rows: string[][] = [
            ['SPU', '2026-01', '销量', '占比'],
            ['运动饮料', '1,234', '12.5%', '含 "引号" 的值'],
            ['零食', '', '0', '多行\n单元格'],
            ['饮料', '999999', '-1.5%', '尾随空格 '],
            ['emoji', '🍹', '100%', '制表\t符'],
        ];

        const filePath = tempFile('compat');
        await PivotTableService.writeRowsToCsvFile(rows, filePath);

        const fileContent = await fs.readFile(filePath);
        const expected = `\uFEFF${await stringifyAll(rows)}`;

        expect(fileContent.toString('utf8')).toBe(expected);
        // BOM must be the first three bytes of the file
        expect([...fileContent.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

        await fs.unlink(filePath);
    });

    it('handles an empty row set without throwing', async () => {
        const filePath = tempFile('empty');
        await PivotTableService.writeRowsToCsvFile([], filePath);

        const fileContent = await fs.readFile(filePath);
        expect(fileContent.toString('utf8')).toBe('\uFEFF');

        await fs.unlink(filePath);
    });

    it('streams large pivots without buffering the whole file as one string', async () => {
        const columns = 20;
        const rowCount = 20_000;
        const rows: string[][] = [
            Array.from({ length: columns }, (_, index) => `col_${index}`),
        ];
        for (let row = 0; row < rowCount; row += 1) {
            rows.push(
                Array.from({ length: columns }, (_, column) =>
                    String(row * columns + column),
                ),
            );
        }

        const filePath = tempFile('large');
        await PivotTableService.writeRowsToCsvFile(rows, filePath);

        const fileContent = (await fs.readFile(filePath)).toString('utf8');
        expect(fileContent.startsWith('\uFEFF')).toBe(true);
        const lines = fileContent
            .slice(1)
            .split('\n')
            .filter((line) => line.length);

        // header + rows (the last line may not have a trailing newline)
        expect(lines.length).toBe(rowCount + 1);
        expect(lines[0]).toBe(
            Array.from({ length: columns }, (_, index) => `col_${index}`).join(
                ',',
            ),
        );
        expect(lines[lines.length - 1]).toBe(
            Array.from(
                { length: columns },
                (_, column) => String((rowCount - 1) * columns + column),
            ).join(','),
        );

        await fs.unlink(filePath);
    });
});

describe('PivotTableService.prependLeadingColumns', () => {
    const rows: string[][] = [
        ['SPU', '2026-01', '销量'],
        ['运动饮料', '1', '2'],
        ['零食', '3', '4'],
    ];

    it('returns the matrix untouched when there are no leading columns', () => {
        expect(PivotTableService.prependLeadingColumns(rows, [])).toBe(rows);
    });

    it('writes the header on the first row and the value on every other row', () => {
        const result = PivotTableService.prependLeadingColumns(rows, [
            { header: '时间', value: '2026-01 ~ 2026-06' },
            { header: '类目', value: '饮料' },
        ]);

        expect(result).toEqual([
            ['时间', '类目', 'SPU', '2026-01', '销量'],
            ['2026-01 ~ 2026-06', '饮料', '运动饮料', '1', '2'],
            ['2026-01 ~ 2026-06', '饮料', '零食', '3', '4'],
        ]);
    });
});

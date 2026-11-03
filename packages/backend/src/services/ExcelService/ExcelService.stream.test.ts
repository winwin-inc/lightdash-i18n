import {
    CustomFormatType,
    DimensionType,
    FieldType,
    ItemsMap,
    MetricType,
    type Item,
} from '@lightdash/common';
import * as fs from 'fs';
import { Readable } from 'stream';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ExcelService } from './ExcelService';

/**
 * Regression gate for the non-pivot XLSX export (#12): switching off
 * `useSharedStrings` and writing rows as arrays must not change the cell values
 * or the number formats users see in Excel.
 */

const fields: ItemsMap = {
    month: {
        name: 'month',
        label: '月份',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.month',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    } as Item,
    amount: {
        name: 'amount',
        label: '销售额',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.amount',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        formatOptions: {
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
            round: 2,
        },
    } as unknown as Item,
    sku: {
        name: 'sku',
        label: 'SKU 数',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.sku',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
    } as Item,
};

const rows = Array.from({ length: 30 }, (_, index) => ({
    month: `2026-${String((index % 12) + 1).padStart(2, '0')}`,
    amount: 1234.5 + index,
    sku: index + 1,
}));

const jsonl = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;

jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

describe('ExcelService.downloadAsyncExcelDirectly', () => {
    it('writes the same cell values and number formats', async () => {
        let uploadedPath: string | undefined;
        const storageClient = {
            getDowloadStream: async () => Readable.from([Buffer.from(jsonl)]),
            uploadFile: async (_name: string, filePath: string) => {
                // keep a copy: the service deletes its temp file
                uploadedPath = `${filePath}.copy`;
                fs.copyFileSync(filePath, uploadedPath);
                return 'https://example.com/file.xlsx';
            },
        };

        const result = await ExcelService.downloadAsyncExcelDirectly(
            'results-file',
            fields,
            storageClient as never,
            { onlyRaw: false, showTableNames: false },
        );

        expect(result.fileUrl).toBe('https://example.com/file.xlsx');
        expect(result.truncated).toBe(false);
        expect(uploadedPath).toBeDefined();

        // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
        const Excel = require('exceljs');
        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(uploadedPath);
        const sheet = workbook.getWorksheet(1);

        // header
        expect(sheet.getRow(1).getCell(1).value).toBe('月份');
        expect(sheet.getRow(1).getCell(2).value).toBe('销售额');
        expect(sheet.getRow(1).getCell(3).value).toBe('SKU 数');

        // values: strings stay strings, metrics stay numbers
        expect(sheet.getRow(2).getCell(1).value).toBe('2026-01');
        expect(sheet.getRow(2).getCell(2).value).toBe(1234.5);
        expect(sheet.getRow(2).getCell(3).value).toBe(1);
        expect(sheet.getRow(31).getCell(1).value).toBe('2026-06');
        expect(sheet.getRow(31).getCell(3).value).toBe(30);

        // number format defined per column must survive
        expect(sheet.getRow(2).getCell(2).numFmt).toBe('[$$]#,##0.00');

        fs.unlinkSync(uploadedPath as string);
    });
});

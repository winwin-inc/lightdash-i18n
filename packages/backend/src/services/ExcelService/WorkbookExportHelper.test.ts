import * as Excel from 'exceljs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WorkbookExportHelper } from './WorkbookExportHelper';

const toArrayBuffer = (buffer: Buffer) =>
    buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

const createWorkbookBuffer = async (value: number) => {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = [{ header: 'Amount', key: 'amount', width: 22 }];
    const row = worksheet.addRow({ amount: value });
    row.getCell(1).numFmt = '$#,##0.00';

    return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('WorkbookExportHelper', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('creates one workbook with safe sheets and counts failed files', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-${Date.now()}.xlsx`,
        );
        const firstBuffer = await createWorkbookBuffer(123.45);
        const secondBuffer = await createWorkbookBuffer(67.89);
        const fileErrors: Array<{ filename: string; error: string }> = [];

        global.fetch = jest.fn(
            async (url: RequestInfo | URL) => {
                if (url === 'https://example.com/first.xlsx') {
                    return {
                        ok: true,
                        arrayBuffer: async () => toArrayBuffer(firstBuffer),
                    };
                }

                if (url === 'https://example.com/second.xlsx') {
                    return {
                        ok: true,
                        arrayBuffer: async () => toArrayBuffer(secondBuffer),
                    };
                }

                return {
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                };
            },
        ) as unknown as typeof fetch;

        try {
            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'first',
                        sheetName:
                            'Revenue: by / customer ? segment * really long',
                        localPath: 'https://example.com/first.xlsx',
                    },
                    {
                        filename: 'second',
                        sheetName:
                            'Revenue: by / customer ? segment * really long',
                        localPath: 'https://example.com/second.xlsx',
                    },
                    {
                        filename: 'missing',
                        localPath: 'https://example.com/missing.xlsx',
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            expect(result).toEqual({
                worksheetCount: 2,
                failedFileCount: 1,
            });
            expect(fileErrors).toEqual([
                { filename: 'missing', error: 'HTTP 404 Not Found' },
            ]);

            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(outputPath);
            expect(workbook.worksheets).toHaveLength(2);
            expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
                'Revenue_ by _ customer _ segmen',
                'Revenue_ by _ customer _ segm_2',
            ]);
            expect(workbook.worksheets[0].getColumn(1).width).toBe(22);
            expect(workbook.worksheets[0].getCell('A2').numFmt).toBe(
                '$#,##0.00',
            );
        } finally {
            await fs.unlink(outputPath).catch(() => undefined);
        }
    });

    it('reads local file paths with fs instead of fetch', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-local-${Date.now()}.xlsx`,
        );
        const firstPath = path.join(
            os.tmpdir(),
            `lightdash-workbook-src-first-${Date.now()}.xlsx`,
        );
        const secondPath = path.join(
            os.tmpdir(),
            `lightdash-workbook-src-second-${Date.now()}.xlsx`,
        );
        const fileErrors: Array<{ filename: string; error: string }> = [];

        // 本地路径不应触发 fetch（Node fetch 不接受裸路径）
        global.fetch = jest.fn(async () => {
            throw new Error('fetch should not be called for local paths');
        }) as unknown as typeof fetch;

        try {
            await fs.writeFile(
                firstPath,
                await createWorkbookBuffer(123.45),
            );
            await fs.writeFile(
                secondPath,
                await createWorkbookBuffer(67.89),
            );

            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'first',
                        sheetName: 'First sheet',
                        localPath: firstPath,
                    },
                    {
                        filename: 'second',
                        sheetName: 'Second sheet',
                        localPath: secondPath,
                    },
                    {
                        filename: 'missing',
                        localPath: path.join(
                            os.tmpdir(),
                            `lightdash-workbook-src-missing-${Date.now()}.xlsx`,
                        ),
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            expect(result).toEqual({
                worksheetCount: 2,
                failedFileCount: 1,
            });
            expect(fileErrors).toHaveLength(1);
            expect(fileErrors[0].filename).toBe('missing');
            // jest 跨 realm 下 fs 错误不是 Error 实例，消息可能是
            // “Unknown object error”；不断言具体文案，只确认错误被上报
            expect(typeof fileErrors[0].error).toBe('string');

            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(outputPath);
            expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
                'First sheet',
                'Second sheet',
            ]);
            expect(workbook.worksheets[0].getCell('A2').numFmt).toBe(
                '$#,##0.00',
            );
        } finally {
            await Promise.all(
                [
                    outputPath,
                    firstPath,
                    secondPath,
                ].map((filePath) => fs.unlink(filePath).catch(() => undefined)),
            );
        }
    });
});

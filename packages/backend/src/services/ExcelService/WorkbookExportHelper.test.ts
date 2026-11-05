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

    it('dedupes case-insensitive sheet names and strips edge quotes', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-case-${Date.now()}.xlsx`,
        );
        const buffers = await Promise.all(
            [101, 102, 103, 104].map((value) => createWorkbookBuffer(value)),
        );
        const fileErrors: Array<{ filename: string; error: string }> = [];

        global.fetch = jest.fn(
            async (url: RequestInfo | URL) => {
                const match = /case-(\d)\.xlsx$/.exec(String(url));
                const buffer = match ? buffers[Number(match[1]) - 1] : undefined;
                if (!buffer) {
                    return {
                        ok: false,
                        status: 404,
                        statusText: 'Not Found',
                    };
                }
                return {
                    ok: true,
                    arrayBuffer: async () => toArrayBuffer(buffer),
                };
            },
        ) as unknown as typeof fetch;

        try {
            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'first',
                        sheetName: 'Revenue',
                        localPath: 'https://example.com/case-1.xlsx',
                    },
                    // Excel sheet 名大小写不敏感唯一：小写重名必须加后缀，
                    // 否则打开工作簿时 Excel 会提示修复
                    {
                        filename: 'second',
                        sheetName: 'revenue',
                        localPath: 'https://example.com/case-2.xlsx',
                    },
                    // 首尾单引号非法，应剥掉
                    {
                        filename: 'third',
                        sheetName: "'Q3 actuals'",
                        localPath: 'https://example.com/case-3.xlsx',
                    },
                    // 剥掉空白与引号后与第一个重名：应继续避开（含后缀链）
                    {
                        filename: 'fourth',
                        sheetName: "  'Revenue'  ",
                        localPath: 'https://example.com/case-4.xlsx',
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            expect(result).toEqual({
                worksheetCount: 4,
                failedFileCount: 0,
            });
            expect(fileErrors).toEqual([]);

            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(outputPath);
            expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
                'Revenue',
                'revenue_2',
                'Q3 actuals',
                // revenue / revenue_2 都已被占用（大小写不敏感），顺延到 _3
                'Revenue_3',
            ]);
        } finally {
            await fs.unlink(outputPath).catch(() => undefined);
        }
    });

    it('dedupes identical, case-insensitive and truncated sheet names', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-dedupe-${Date.now()}.xlsx`,
        );
        const buffers = await Promise.all(
            [201, 202, 203, 204, 205, 206].map((value) =>
                createWorkbookBuffer(value),
            ),
        );
        const fileErrors: Array<{ filename: string; error: string }> = [];

        global.fetch = jest.fn(
            async (url: RequestInfo | URL) => {
                const match = /dedupe-(\d+)\.xlsx$/.exec(String(url));
                const buffer = match
                    ? buffers[Number(match[1]) - 1]
                    : undefined;
                if (!buffer) {
                    return {
                        ok: false,
                        status: 404,
                        statusText: 'Not Found',
                    };
                }
                return {
                    ok: true,
                    arrayBuffer: async () => toArrayBuffer(buffer),
                };
            },
        ) as unknown as typeof fetch;

        // 超过 Excel sheet 名 31 字符上限，截断后两份仍需唯一
        const longName = 'L'.repeat(40);

        try {
            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'sales-1',
                        sheetName: 'Sales',
                        localPath: 'https://example.com/dedupe-1.xlsx',
                    },
                    // 同名必须顺延后缀：Sales / Sales_2
                    {
                        filename: 'sales-2',
                        sheetName: 'Sales',
                        localPath: 'https://example.com/dedupe-2.xlsx',
                    },
                    {
                        filename: 'revenue-1',
                        sheetName: 'Revenue',
                        localPath: 'https://example.com/dedupe-3.xlsx',
                    },
                    // 大小写不敏感冲突：revenue / revenue_2
                    {
                        filename: 'revenue-2',
                        sheetName: 'revenue',
                        localPath: 'https://example.com/dedupe-4.xlsx',
                    },
                    {
                        filename: 'long-1',
                        sheetName: longName,
                        localPath: 'https://example.com/dedupe-5.xlsx',
                    },
                    // 截断到 31 字符后仍同名：截断 + 后缀后保持唯一
                    {
                        filename: 'long-2',
                        sheetName: longName,
                        localPath: 'https://example.com/dedupe-6.xlsx',
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            expect(result).toEqual({
                worksheetCount: 6,
                failedFileCount: 0,
            });
            expect(fileErrors).toEqual([]);

            // 写入的文件真实存在且可读
            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(outputPath);
            const names = workbook.worksheets.map((sheet) => sheet.name);
            expect(names).toEqual([
                'Sales',
                'Sales_2',
                'Revenue',
                'revenue_2',
                'L'.repeat(31),
                `${'L'.repeat(29)}_2`,
            ]);
            // Excel 硬性约束：最长 31 字符，大小写不敏感唯一
            names.forEach((name) =>
                expect(name.length).toBeLessThanOrEqual(31),
            );
            expect(
                new Set(names.map((name) => name.toLowerCase())).size,
            ).toBe(names.length);
        } finally {
            await fs.unlink(outputPath).catch(() => undefined);
        }
    });

    it('still writes a workbook with the good files when one local input fails', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-partial-${Date.now()}.xlsx`,
        );
        const goodFirstPath = path.join(
            os.tmpdir(),
            `lightdash-workbook-src-partial-first-${Date.now()}.xlsx`,
        );
        const goodSecondPath = path.join(
            os.tmpdir(),
            `lightdash-workbook-src-partial-second-${Date.now()}.xlsx`,
        );
        const fileErrors: Array<{ filename: string; error: string }> = [];

        // 本地路径不应触发 fetch
        global.fetch = jest.fn(async () => {
            throw new Error('fetch should not be called for local paths');
        }) as unknown as typeof fetch;

        try {
            await fs.writeFile(
                goodFirstPath,
                await createWorkbookBuffer(123.45),
            );
            await fs.writeFile(
                goodSecondPath,
                await createWorkbookBuffer(67.89),
            );

            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'first',
                        sheetName: 'First sheet',
                        localPath: goodFirstPath,
                    },
                    // 坏输入：本地不存在的路径
                    {
                        filename: 'missing',
                        sheetName: 'Missing sheet',
                        localPath: path.join(
                            os.tmpdir(),
                            `lightdash-workbook-src-partial-missing-${Date.now()}.xlsx`,
                        ),
                    },
                    {
                        filename: 'second',
                        sheetName: 'Second sheet',
                        localPath: goodSecondPath,
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            // 部分失败不阻断整体：1 坏 2 好 → 只丢坏的，好的全部进工作簿
            expect(result).toEqual({
                worksheetCount: 2,
                failedFileCount: 1,
            });
            expect(fileErrors).toHaveLength(1);
            expect(fileErrors[0].filename).toBe('missing');
            expect(typeof fileErrors[0].error).toBe('string');

            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(outputPath);
            expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
                'First sheet',
                'Second sheet',
            ]);
        } finally {
            await Promise.all(
                [
                    outputPath,
                    goodFirstPath,
                    goodSecondPath,
                ].map((filePath) => fs.unlink(filePath).catch(() => undefined)),
            );
        }
    });

    it('returns zero worksheets and writes no file when every input fails', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-allbad-${Date.now()}.xlsx`,
        );
        const fileErrors: Array<{ filename: string; error: string }> = [];

        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        })) as unknown as typeof fetch;

        try {
            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'first',
                        sheetName: 'First',
                        localPath: 'https://example.com/broken-1.xlsx',
                    },
                    {
                        filename: 'second',
                        sheetName: 'Second',
                        localPath: 'https://example.com/broken-2.xlsx',
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            // 全部失败：不写输出文件（上层据此抛「所有文件失败」错误）
            expect(result).toEqual({
                worksheetCount: 0,
                failedFileCount: 2,
            });
            expect(fileErrors).toEqual([
                {
                    filename: 'first',
                    error: 'HTTP 500 Internal Server Error',
                },
                {
                    filename: 'second',
                    error: 'HTTP 500 Internal Server Error',
                },
            ]);
            await expect(fs.access(outputPath)).rejects.toThrow();
        } finally {
            await fs.unlink(outputPath).catch(() => undefined);
        }
    });
});

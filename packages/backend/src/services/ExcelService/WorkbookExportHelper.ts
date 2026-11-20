import { getErrorMessage } from '@lightdash/common';
import * as Excel from 'exceljs';
import fs from 'fs/promises';
import Logger from '../../logging/logger';

type WorkbookExportFile = {
    filename: string;
    sheetName?: string;
    localPath: string;
};

type CreateWorkbookFileArgs = {
    files: WorkbookExportFile[];
    outputPath: string;
    onFileError: (filename: string, error: string) => void;
};

export class WorkbookExportHelper {
    private static async loadSourceWorksheet({
        file,
        onFileError,
    }: {
        file: WorkbookExportFile;
        onFileError: (filename: string, error: string) => void;
    }) {
        try {
            let buffer: Buffer;
            if (/^https?:\/\//.test(file.localPath)) {
                const response = await fetch(file.localPath);
                if (!response.ok) {
                    onFileError(
                        file.filename,
                        `HTTP ${response.status} ${response.statusText}`,
                    );
                    return undefined;
                }
                buffer = Buffer.from(await response.arrayBuffer());
            } else {
                // 本地路径（如 keepTempFile 生成的 /tmp 中间文件）：
                // Node fetch 不接受裸路径，必须用 fs 读取
                buffer = await fs.readFile(file.localPath);
            }

            const sourceWorkbook = new Excel.Workbook();
            await sourceWorkbook.xlsx.load(
                buffer as unknown as Parameters<
                    typeof sourceWorkbook.xlsx.load
                >[0],
            );

            const sourceWorksheet = sourceWorkbook.worksheets[0];
            if (!sourceWorksheet) {
                onFileError(file.filename, 'No worksheet found');
                return undefined;
            }

            return { file, sourceWorksheet };
        } catch (e) {
            onFileError(file.filename, getErrorMessage(e));
            return undefined;
        }
    }

    private static getWorksheetName(name: string, usedNames: Set<string>) {
        const fallbackName = 'Sheet';
        // 首尾的空白与单引号都非法（Excel sheet 名不能以 ' 开头/结尾），
        // 且它们会交错出现（"  'Revenue'  "），反复剥到稳定为止
        const stripIllegalEdges = (value: string) => {
            let stripped = value;
            let previous: string | undefined;
            while (stripped !== previous) {
                previous = stripped;
                stripped = stripped
                    .replace(/^[\s']+/, '')
                    .replace(/[\s']+$/, '');
            }
            return stripped;
        };
        const sanitizedName =
            stripIllegalEdges(name.replace(/[:\\/?*[\]]/g, '_')) ||
            fallbackName;
        const maxLength = 31;
        let sheetName =
            stripIllegalEdges(sanitizedName.slice(0, maxLength)) ||
            fallbackName;

        // Excel 要求 sheet 名大小写不敏感唯一（"Revenue" 与 "revenue" 冲突），
        // 统一用小写作去重键，但保留原始大小写输出
        const hasConflict = (candidate: string) =>
            usedNames.has(candidate.toLowerCase());
        if (hasConflict(sheetName)) {
            let suffix = 2;
            do {
                const suffixText = `_${suffix}`;
                sheetName =
                    stripIllegalEdges(
                        `${sanitizedName.slice(
                            0,
                            maxLength - suffixText.length,
                        )}${suffixText}`,
                    ) || fallbackName;
                suffix += 1;
            } while (hasConflict(sheetName));
        }

        usedNames.add(sheetName.toLowerCase());
        return sheetName;
    }

    private static copyWorksheet(
        sourceWorksheet: Excel.Worksheet,
        targetWorksheet: Excel.Worksheet,
    ) {
        sourceWorksheet.columns.forEach((column, index) => {
            if (column.width) {
                const targetColumn = targetWorksheet.getColumn(index + 1);
                targetColumn.width = column.width;
            }
        });

        sourceWorksheet.eachRow((sourceRow, rowNumber) => {
            const targetRow = targetWorksheet.getRow(rowNumber);
            targetRow.height = sourceRow.height;
            targetRow.values = sourceRow.values;

            sourceRow.eachCell(
                { includeEmpty: true },
                (sourceCell, colNumber) => {
                    const targetCell = targetRow.getCell(colNumber);
                    targetCell.value = sourceCell.value;
                    targetCell.style = { ...sourceCell.style };
                    targetCell.numFmt = sourceCell.numFmt;
                },
            );

            targetRow.commit();
        });

        // 合并单元格、冻结窗格、筛选/打印设置也要跟着走，
        // 否则透视表在合并后的工作簿里版式会变（多单元格表头被拆开）
        const sourceMerges = sourceWorksheet.model?.merges ?? [];
        sourceMerges.forEach((range) => {
            try {
                targetWorksheet.mergeCells(range);
            } catch (e) {
                // 单个合并区域非法不影响整个 sheet
                Logger.warn(
                    `Failed to copy merged range "${range}": ${getErrorMessage(
                        e,
                    )}`,
                );
            }
        });

        // eslint 的 no-param-reassign 只认属性赋值，局部别名规避
        const target = targetWorksheet;
        if (sourceWorksheet.views && sourceWorksheet.views.length > 0) {
            target.views = sourceWorksheet.views.map((view) => ({ ...view }));
        }

        target.autoFilter = sourceWorksheet.autoFilter;
        target.pageSetup = { ...sourceWorksheet.pageSetup };
    }

    static async createWorkbookFile({
        files,
        outputPath,
        onFileError,
    }: CreateWorkbookFileArgs) {
        const workbook = new Excel.Workbook();
        const usedSheetNames = new Set<string>();
        const sourceWorksheets = await Promise.all(
            files.map((file) =>
                this.loadSourceWorksheet({ file, onFileError }),
            ),
        );
        const failedFileCount = sourceWorksheets.filter(
            (sourceWorksheet) => sourceWorksheet === undefined,
        ).length;

        sourceWorksheets.forEach((sourceFile) => {
            if (sourceFile) {
                const targetWorksheet = workbook.addWorksheet(
                    this.getWorksheetName(
                        sourceFile.file.sheetName ?? sourceFile.file.filename,
                        usedSheetNames,
                    ),
                );
                this.copyWorksheet(sourceFile.sourceWorksheet, targetWorksheet);
            }
        });

        if (workbook.worksheets.length === 0) {
            return {
                worksheetCount: 0,
                failedFileCount,
            };
        }

        await workbook.xlsx.writeFile(outputPath);
        return {
            worksheetCount: workbook.worksheets.length,
            failedFileCount,
        };
    }
}

import {
    AnyType,
    applyCustomFormat,
    DimensionType,
    DownloadFileType,
    FieldType,
    formatItemValue,
    formatRows,
    getCustomFormat,
    getErrorMessage,
    getFormatExpression,
    hasFormatOptions,
    isDimension,
    ItemsMap,
    MetricQuery,
    PivotConfig,
    pivotResultsAsCsv,
    TimeFrames,
    type ExportFilterColumn,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import fs from 'fs';
import moment from 'moment';
import os from 'os';
import path from 'path';
import { pipeline, Readable, Writable } from 'stream';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    generateGenericFileId,
    processFieldsForExport,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import {
    getPivotExportLimits,
    getPivotExportWidth,
} from '../../utils/FileDownloadUtils/exportLimits';
import { formatMomentByTimezone } from '../../utils/FileDownloadUtils/formatMomentByTimezone';

export class ExcelService {
    private static readonly EXCEL_ROW_LIMIT = 1_000_000;

    /**
     * Excel format expressions encode SI compact scaling as trailing commas
     * before a quoted suffix, e.g. `#,##0,,"M"` or `0," K"`.
     */
    private static readonly COMPACT_FORMAT_EXPRESSION_REGEX =
        /,{1,4}\s*"[^"]*"/;

    static itemHasCompactFormat(item: ItemsMap[string] | undefined): boolean {
        if (!item) {
            return false;
        }
        if ('compact' in item && item.compact) {
            return true;
        }
        const customFormat = getCustomFormat(
            item as Parameters<typeof getCustomFormat>[0],
        );
        if (customFormat?.compact) {
            return true;
        }
        const formatExpression = getFormatExpression(
            item as Parameters<typeof getFormatExpression>[0],
        );
        return (
            !!formatExpression &&
            ExcelService.COMPACT_FORMAT_EXPRESSION_REGEX.test(formatExpression)
        );
    }

    /**
     * Format cell value the same way as the dashboard / CSV formatted export.
     * Prefer formatOptions (chart metric overrides) over format expressions so
     * compact/prefix match the UI's applyCustomFormat path.
     */
    private static formatValueForDisplay(
        item: ItemsMap[string] | undefined,
        rawValue: unknown,
    ): string {
        if (
            item &&
            hasFormatOptions(item) &&
            item.formatOptions !== undefined
        ) {
            return applyCustomFormat(rawValue, item.formatOptions);
        }
        return formatItemValue(item, rawValue);
    }

    /**
     * Parse a cell value as a finite number for Excel numFmt columns.
     *
     * HARDENING (not the root cause of "ALL results empty metrics"):
     * exceljs stream writer persists NaN/Infinity as blank cells. Ratio SQL
     * without nullif can produce those values; without this guard a single cell
     * looks "missing" while CSV still shows a formatted string.
     * The TABLE-vs-ALL empty-metrics bug is pivotConfiguration leak on download
     * re-run (see useExplorerQuery.getDownloadQueryUuid / #19115) — keep both fixes.
     */
    private static toFiniteNumber(rawValue: unknown): number | null {
        if (typeof rawValue === 'number') {
            return Number.isFinite(rawValue) ? rawValue : null;
        }

        const stringValue = String(rawValue).trim();
        if (stringValue === '') {
            return null;
        }

        const numericValue = Number(stringValue);
        return Number.isFinite(numericValue) ? numericValue : null;
    }

    /**
     * True when the value is NaN/Infinity (number or numeric token string).
     * Non-numeric strings like "N/A" return false so we keep them as-is.
     * Used with formatValueForDisplay so exceljs does not write blank cells.
     */
    private static isNonFiniteNumericValue(rawValue: unknown): boolean {
        if (typeof rawValue === 'number') {
            return !Number.isFinite(rawValue);
        }

        if (typeof rawValue !== 'string') {
            return false;
        }

        const trimmed = rawValue.trim().toLowerCase();
        return (
            trimmed === 'nan' ||
            trimmed === 'infinity' ||
            trimmed === '+infinity' ||
            trimmed === '-infinity'
        );
    }

    /**
     * Excel formatted month period: 2026-08 → 202608.
     * Keep as text so Excel does not parse it as a date or add thousand separators.
     */
    private static toExcelMonthPeriod(value: string): string {
        const match = /^(\d{4})-(\d{2})$/.exec(value);
        return match ? `${match[1]}${match[2]}` : value;
    }

    /**
     * Calendar-only display strings that must stay text.
     * YYYYMM / YYYYMMDD are ISO-8601 basic and would otherwise become a Date.
     */
    private static isCalendarDateDisplayValue(value: string): boolean {
        return (
            /^\d{4}$/.test(value) ||
            /^\d{6}$/.test(value) ||
            /^\d{8}$/.test(value) ||
            /^\d{4}-\d{2}$/.test(value) ||
            /^\d{4}-\d{2}-\d{2}$/.test(value) ||
            /^\d{4}-Q[1-4]$/.test(value)
        );
    }

    /**
     * Convert full ISO datetimes to Date. Month/day periods stay text
     * (202608 / 20250101) so Excel does not shift timezone
     * (2026/7/31 16:00 or 2024/12/31 in UTC+8).
     */
    static convertToExcelDate(value: unknown): Date | unknown {
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}$/.test(value)) {
                return ExcelService.toExcelMonthPeriod(value);
            }
            if (ExcelService.isCalendarDateDisplayValue(value)) {
                return value;
            }
            const dateValue = moment(value, moment.ISO_8601, true);
            if (dateValue.isValid()) {
                return dateValue.toDate();
            }
        }
        return value;
    }

    static generateFileId(
        fileName: string,
        truncated: boolean = false,
        time: moment.Moment = moment(),
    ): string {
        return generateGenericFileId({
            fileName,
            fileExtension: DownloadFileType.XLSX,
            truncated,
            time,
        });
    }

    static convertRowToExcel(
        row: Record<string, AnyType>,
        itemMap: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
        displayTimezone?: string,
    ): (string | number | Date | null)[] {
        return sortedFieldIds.map((fieldId) => {
            const sourceValue = row[fieldId];
            let rawValue = sourceValue;

            if (rawValue === null || rawValue === undefined) {
                return rawValue;
            }

            const item = itemMap[fieldId];
            const isMetricField =
                !!item &&
                'fieldType' in item &&
                item.fieldType === FieldType.METRIC;
            const isTimestampField =
                !!item &&
                'type' in item &&
                item.type === DimensionType.TIMESTAMP;
            const isDateField =
                !!item && 'type' in item && item.type === DimensionType.DATE;
            const isTemporalField = isTimestampField || isDateField;

            // Always normalize temporal values to configured timezone first.
            if (isTimestampField) {
                rawValue = formatMomentByTimezone(
                    sourceValue,
                    'YYYY-MM-DD HH:mm:ss.SSS',
                    displayTimezone,
                );
            } else if (isDateField) {
                rawValue = formatMomentByTimezone(
                    sourceValue,
                    'YYYY-MM-DD',
                    displayTimezone,
                );
            }

            if (onlyRaw) {
                // Prevent Excel auto-number formatting for non-metric dimensions like 2025/202503.
                if (!isMetricField && typeof rawValue === 'number') {
                    return String(rawValue);
                }
                // Hardening: exceljs drops NaN/Infinity as empty cells — stringify instead.
                if (
                    typeof rawValue === 'number' &&
                    !Number.isFinite(rawValue)
                ) {
                    return String(rawValue);
                }
                return rawValue;
            }

            // Formatted mode: preserve existing formatter behavior, using timezone-normalized temporal value.
            if (isTemporalField) {
                const formatted = formatItemValue(item, rawValue);
                if (
                    isDimension(item) &&
                    item.timeInterval === TimeFrames.MONTH
                ) {
                    return ExcelService.toExcelMonthPeriod(formatted);
                }
                return formatted;
            }

            const formatExpression = getFormatExpression(item);
            const hasCompact = ExcelService.itemHasCompactFormat(item);

            // Compact metrics (and any non-metric with a format expression) write
            // display strings so downloads match the dashboard (e.g. ¥718M).
            // Non-metric strings also avoid Excel auto-detecting years as dates.
            if (formatExpression && (!isMetricField || hasCompact)) {
                return ExcelService.formatValueForDisplay(item, rawValue);
            }

            if (formatExpression && isMetricField) {
                // Metric without compact: keep raw number + column numFmt.
                // Only Number.isFinite values are safe for exceljs (see toFiniteNumber).
                // Non-finite → display string. This is cell-level hardening for ratio
                // metrics; do not confuse with empty ALL-export columns (pivot leak).
                const numericValue = ExcelService.toFiniteNumber(rawValue);
                if (numericValue !== null) {
                    return numericValue;
                }

                if (ExcelService.isNonFiniteNumericValue(rawValue)) {
                    return ExcelService.formatValueForDisplay(item, rawValue);
                }

                return rawValue;
            }

            // Use standard Lightdash formatting if not onlyRaw and we have item metadata but no format expression
            if (item) {
                return ExcelService.formatValueForDisplay(item, rawValue);
            }

            return rawValue;
        });
    }

    static async downloadPivotTableXlsx({
        rows,
        itemMap,
        metricQuery,
        pivotConfig,
        onlyRaw,
        customLabels,
        maxColumnLimit,
        pivotDetails,
        displayTimezone,
        leadingColumns = [],
    }: {
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        onlyRaw: boolean;
        customLabels: Record<string, string> | undefined;
        maxColumnLimit: number;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone?: string;
        /** 矩阵左侧前置的筛选器常量列（看板导出） */
        leadingColumns?: ExportFilterColumn[];
    }): Promise<{ filePath: string }> {
        // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
        const formattedRows = formatRows(rows, itemMap, undefined, {
            displayTimezone,
        });

        const csvResults = pivotResultsAsCsv({
            pivotConfig,
            rows: formattedRows,
            itemMap,
            metricQuery,
            customLabels,
            onlyRaw,
            maxColumnLimit,
            pivotDetails,
        });

        // Stream the workbook to a temp file instead of building it in memory and
        // returning the whole buffer (which was then copied again into the S3 stream).
        const filePath = ExcelService.createTempFilePath('pivot');
        const workbook = new Excel.stream.xlsx.WorkbookWriter({
            filename: filePath,
            useStyles: true,
            useSharedStrings: true,
        });
        const worksheet = workbook.addWorksheet('Pivot Table');

        // 前置常量列与 CSV 保持一致：第一行（透视表的首个表头行）写列名，
        // 其余行（含次级表头行）写取值，不做合并单元格
        const leadingHeaders = leadingColumns.map((column) => column.header);
        const leadingValues = leadingColumns.map((column) => column.value);

        csvResults.forEach((row, index) => {
            const excelRow = row.map((value) =>
                ExcelService.convertToExcelDate(value),
            );
            const addedRow = worksheet.addRow(
                leadingColumns.length > 0
                    ? [
                          ...(index === 0 ? leadingHeaders : leadingValues),
                          ...excelRow,
                      ]
                    : excelRow,
            );
            addedRow.commit();

            // Style headers (first row)
            if (index === 0) {
                addedRow.font = { bold: true };
                addedRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' },
                };
                addedRow.commit();
            }
        });

        // Column widths are sampled: scanning every row of a wide pivot is
        // O(rows x columns) over `toString()` and was a measurable chunk of the export.
        const SAMPLE_ROWS = 200;
        const widthOffset = leadingColumns.length;
        csvResults.slice(0, SAMPLE_ROWS).forEach((row) => {
            row.forEach((value, index) => {
                const column = worksheet.getColumn(index + 1 + widthOffset);
                if (!column) return;
                const valueLength = String(value ?? '').length;
                if (valueLength > (column.width ?? 0)) {
                    // eslint-disable-next-line no-param-reassign
                    column.width = Math.min(Math.max(valueLength + 2, 10), 50);
                }
            });
        });

        await workbook.commit();

        return { filePath };
    }

    /**
     * Downloads pivot table XLSX from async query results file
     * Handles loading data from JSONL storage file and generating pivot Excel file
     */
    static async downloadAsyncPivotTableXlsx({
        resultsFileName,
        fields,
        metricQuery,
        storageClient,
        lightdashConfig,
        options,
        pivotDetails,
    }: {
        resultsFileName: string;
        fields: ItemsMap;
        metricQuery: MetricQuery;
        storageClient: S3ResultsFileStorageClient; // S3ResultsFileStorageClient type
        lightdashConfig: LightdashConfig;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        options: {
            onlyRaw: boolean;
            showTableNames: boolean;
            customLabels: Record<string, string>;
            columnOrder: string[];
            hiddenFields: string[];
            pivotConfig: PivotConfig;
            attachmentDownloadName?: string;
            /** 合并多工作表时保留本地临时文件（由调用方负责清理） */
            keepTempFile?: boolean;
            /** 透视矩阵左侧前置的筛选器常量列（看板导出） */
            leadingColumns?: ExportFilterColumn[];
        };
    }): Promise<{
        fileUrl: string;
        truncated: boolean;
        localPath?: string;
        rowCount: number;
    }> {
        const { onlyRaw, customLabels, pivotConfig } = options;

        // Load rows from the results file using shared streaming utility
        // For pivot tables, we need to use csvCellsLimit to prevent memory issues
        const readStream = await storageClient.getDowloadStream(
            resultsFileName,
        );

        const fieldCount = Object.keys(fields).length;
        const cellsLimit = lightdashConfig.query?.csvCellsLimit || 100000;

        // Pivot exports build the whole matrix in memory, so tighten csvCellsLimit with the
        // memory budget: a 1M-row pivot export used to OOMKill the pod instead of truncating.
        // The matrix is as wide as the pivot output, not the input row width.
        const width = getPivotExportWidth({
            fieldCount,
            pivotTotalColumnCount: pivotDetails?.totalColumnCount,
            maxColumnLimit: lightdashConfig.pivotTable.maxColumnLimit,
        });
        const { effectiveCells, maxRows, clamped } = getPivotExportLimits(
            width,
            cellsLimit,
            lightdashConfig.query?.exportMaxPivotCells,
        );
        if (clamped) {
            Logger.warn(
                `Pivot Excel export clamped to ${maxRows} rows (${effectiveCells} cells, width ${width}, fields ${fieldCount}); csvCellsLimit=${cellsLimit}`,
            );
        }

        const { results: rows, truncated } = await streamJsonlData<
            Record<string, unknown>
        >({
            readStream,
            onRow: (parsedRow: Record<string, unknown>) => parsedRow, // Just collect all rows
            maxLines: maxRows, // Use standard csvCellsLimit logic
        });

        if (rows.length === 0) {
            throw new Error('No data found in results file');
        }

        if (truncated) {
            Logger.warn(
                `Pivot Excel export truncated: loaded ${rows.length} rows (csvCellsLimit: ${cellsLimit}, fieldCount: ${fieldCount})`,
            );
        }

        const fileName =
            options.attachmentDownloadName || `pivot-${resultsFileName}`;
        const formattedFileName = ExcelService.generateFileId(
            fileName,
            truncated,
        );

        const { filePath } = await ExcelService.downloadPivotTableXlsx({
            rows,
            itemMap: fields,
            metricQuery,
            pivotConfig,
            onlyRaw,
            customLabels,
            maxColumnLimit: lightdashConfig.pivotTable.maxColumnLimit,
            pivotDetails,
            displayTimezone: lightdashConfig.query.timezone,
            leadingColumns: options.leadingColumns,
        });

        try {
            // Stream the workbook from disk instead of holding the whole file in memory
            const result = await storageClient.transformResultsIntoNewFile(
                resultsFileName,
                formattedFileName,
                async (_, writeStream: Writable) => {
                    await new Promise<void>((resolve, reject) => {
                        pipeline(
                            fs.createReadStream(filePath),
                            writeStream,
                            (error) => {
                                if (error) {
                                    reject(error);
                                    return;
                                }
                                resolve();
                            },
                        );
                    });
                    return { truncated };
                },
            );
            return {
                ...result,
                ...(options.keepTempFile ? { localPath: filePath } : {}),
                // 透视按输入行数计入导出行数预算
                rowCount: rows.length,
            };
        } catch (error) {
            // 上传/转换失败时本地文件不会被调用方用到，直接清掉
            ExcelService.cleanupTempFile(filePath);
            throw error;
        } finally {
            // keepTempFile 时由调用方在合并完成后清理，避免合并布局还要回 S3 拉一次
            if (!options.keepTempFile) {
                ExcelService.cleanupTempFile(filePath);
            }
        }
    }

    // Helper method to create temporary file path
    private static createTempFilePath(prefix: string): string {
        return path.join(
            os.tmpdir(),
            `lightdash-excel-${prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 11)}.xlsx`,
        );
    }

    // Helper method to clean up temporary files
    private static cleanupTempFile(tempFilePath: string): void {
        fs.unlink(tempFilePath, (err: NodeJS.ErrnoException | null) => {
            if (err) {
                Logger.warn(`Could not delete temp file: ${err.message}`);
            }
        });
    }

    // Helper method to stream JSONL data to Excel temp file
    private static async streamJsonlToExcelFile(
        resultsStream: Readable,
        tempFilePath: string,
        headers: string[],
        fields: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
        displayTimezone?: string,
        /** 工作表最左侧的筛选器常量列（看板导出） */
        leadingColumns: ExportFilterColumn[] = [],
    ): Promise<{ truncated: boolean; rowCount: number }> {
        // Use the same approach as our working tests - direct filename instead of stream
        const workbook = new Excel.stream.xlsx.WorkbookWriter({
            filename: tempFilePath,
            useStyles: true,
            // Measured on a 17 columns x 60k rows export: ~59µs/row with shared
            // strings vs ~38µs/row without, same cell values and number formats.
            // Trade-off: the file can grow when string columns are low cardinality.
            useSharedStrings: false,
        });
        const worksheet = workbook.addWorksheet('Sheet1');

        // 前置常量列：列名直接当表头，每行写同一个值
        const leadingValues = leadingColumns.map((column) => column.value);
        const leadingHeaders = leadingColumns.map((column) => column.header);

        // Set up columns with formatting
        worksheet.columns = [
            ...leadingHeaders.map((header, index) => ({
                header,
                key: `leading_${index}`,
                width: Math.min(Math.max(header.length + 4, 12), 40),
            })),
            ...headers.map((header, index) => {
                const fieldId = sortedFieldIds[index];
                const item = fields[fieldId];
                const formatExpression = getFormatExpression(item);
                const isMetricField =
                    !!item &&
                    'fieldType' in item &&
                    item.fieldType === FieldType.METRIC;
                const isTemporalField =
                    !!item &&
                    'type' in item &&
                    (item.type === DimensionType.DATE ||
                        item.type === DimensionType.TIMESTAMP);

                const column: Partial<Excel.Column> = {
                    header,
                    key: `col_${index}`,
                    width: 15,
                };

                // Apply number formatting at column level for metrics that still
                // write raw numbers. Compact columns write display strings instead.
                if (
                    !onlyRaw &&
                    formatExpression &&
                    isMetricField &&
                    !isTemporalField &&
                    !ExcelService.itemHasCompactFormat(item)
                ) {
                    column.style = { numFmt: formatExpression };
                }

                return column;
            }),
        ];

        let actualRowCount = 0;

        // Use streamJsonlData for clean line processing with automatic truncation
        const { truncated } = await streamJsonlData<void>({
            readStream: resultsStream,
            onRow: (parsedRow: Record<string, unknown>, lineCount: number) => {
                // Convert row data for Excel
                const rowData = ExcelService.convertRowToExcel(
                    parsedRow,
                    fields,
                    onlyRaw,
                    sortedFieldIds,
                    displayTimezone,
                );

                if (Array.isArray(rowData) && rowData.length > 0) {
                    actualRowCount += 1;

                    // Stream directly to Excel temp file. `addRow(array)` maps values to
                    // `worksheet.columns` by index, so we skip building a per-row object
                    // with `col_N` keys.
                    const row = worksheet.addRow([
                        ...leadingValues,
                        ...rowData,
                    ]);
                    row.commit();
                } else {
                    Logger.warn(
                        `Invalid row data on row ${lineCount}, skipping`,
                    );
                }
                // Return void since we're processing rows directly
            },
            maxLines: ExcelService.EXCEL_ROW_LIMIT,
        });

        // Commit Excel to temp file
        worksheet.commit();
        await workbook.commit();

        return { truncated, rowCount: actualRowCount };
    }

    /**
     * Direct Excel export using streaming to minimize memory usage
     * Processes JSONL data row-by-row and streams directly to S3
     */
    static async downloadAsyncExcelDirectly(
        resultsFileName: string,
        fields: ItemsMap,
        storageClient: S3ResultsFileStorageClient,
        options: {
            onlyRaw?: boolean;
            showTableNames?: boolean;
            customLabels?: Record<string, string>;
            columnOrder?: string[];
            hiddenFields?: string[];
            attachmentDownloadName?: string;
            displayTimezone?: string;
            /**
             * 保留本地临时文件并返回路径，供同进程内的后续处理（如合并成多 sheet 工作簿）直接读取，
             * 省掉一次 S3 上传 + 下载。调用方负责删除该文件。
             */
            keepTempFile?: boolean;
            /** 工作表最左侧的筛选器常量列（看板导出） */
            leadingColumns?: ExportFilterColumn[];
        } = {},
    ): Promise<{
        fileUrl: string;
        truncated: boolean;
        localPath?: string;
        rowCount: number;
    }> {
        // Handle column ordering and filtering
        const {
            onlyRaw = false,
            showTableNames = false,
            customLabels = {},
            columnOrder = [],
            hiddenFields = [],
            attachmentDownloadName,
            displayTimezone,
            keepTempFile = false,
            leadingColumns = [],
        } = options;

        // Process fields and generate headers using shared utility
        const { sortedFieldIds, headers } = processFieldsForExport(fields, {
            showTableNames,
            customLabels,
            columnOrder,
            hiddenFields,
            onlyRaw,
        });

        // Create temporary file
        const tempFilePath = ExcelService.createTempFilePath('direct');

        try {
            // Step 1: Get source stream
            const resultsStream = await storageClient.getDowloadStream(
                resultsFileName,
            );

            // Step 2: Stream JSONL data to Excel temp file
            const { truncated, rowCount } =
                await ExcelService.streamJsonlToExcelFile(
                    resultsStream,
                    tempFilePath,
                    headers,
                    fields,
                    onlyRaw,
                    sortedFieldIds,
                    displayTimezone,
                    leadingColumns,
                );

            // Generate filename with truncated flag
            const formattedFileName = ExcelService.generateFileId(
                resultsFileName,
                truncated,
            );

            // Step 3: Stream temp file directly to S3 (no memory spike!)
            const fileUrl = await storageClient.uploadFile(
                formattedFileName,
                tempFilePath,
                {
                    contentType:
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    attachmentDownloadName: attachmentDownloadName
                        ? `${attachmentDownloadName}.xlsx`
                        : undefined,
                },
            );

            return {
                fileUrl,
                truncated,
                ...(keepTempFile ? { localPath: tempFilePath } : {}),
                rowCount,
            };
        } catch (error) {
            Logger.error(
                `Direct Excel export failed: ${getErrorMessage(error)}`,
            );
            throw error;
        } finally {
            // keepTempFile 时由调用方负责清理（合并完再删）
            if (!keepTempFile) {
                ExcelService.cleanupTempFile(tempFilePath);
            }
        }
    }
}

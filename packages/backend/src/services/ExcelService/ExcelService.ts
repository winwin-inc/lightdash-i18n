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
    ItemsMap,
    MetricQuery,
    PivotConfig,
    pivotResultsAsCsv,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import fs from 'fs';
import moment from 'moment';
import os from 'os';
import path from 'path';
import { Readable, Writable } from 'stream';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    generateGenericFileId,
    processFieldsForExport,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';

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

    private static formatMomentByTimezone(
        value: AnyType,
        pattern: string,
        displayTimezone?: string,
    ): string {
        if (displayTimezone) {
            const date = new Date(String(value));
            if (!Number.isNaN(date.getTime())) {
                const parts = new Intl.DateTimeFormat('sv-SE', {
                    timeZone: displayTimezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                }).formatToParts(date);
                const lookup = Object.fromEntries(
                    parts.map((part) => [part.type, part.value]),
                );
                if (pattern === 'YYYY-MM-DD') {
                    return `${lookup.year}-${lookup.month}-${lookup.day}`;
                }
                const milliseconds = String(date.getUTCMilliseconds()).padStart(
                    3,
                    '0',
                );
                return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}.${milliseconds}`;
            }
        }
        return moment(value).format(pattern);
    }

    // Helper method for date/timestamp conversion
    static convertToExcelDate(value: unknown): Date | unknown {
        if (typeof value === 'string') {
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
                rawValue = ExcelService.formatMomentByTimezone(
                    sourceValue,
                    'YYYY-MM-DD HH:mm:ss.SSS',
                    displayTimezone,
                );
            } else if (isDateField) {
                rawValue = ExcelService.formatMomentByTimezone(
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
                if (typeof rawValue === 'number' && !Number.isFinite(rawValue)) {
                    return String(rawValue);
                }
                return rawValue;
            }

            // Formatted mode: preserve existing formatter behavior, using timezone-normalized temporal value.
            if (isTemporalField) {
                return formatItemValue(item, rawValue);
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
    }): Promise<Excel.Buffer> {
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

        // Create Excel workbook
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Pivot Table');

        // Add data to worksheet
        csvResults.forEach((row, index) => {
            const excelRow = row.map((value) =>
                ExcelService.convertToExcelDate(value),
            );
            worksheet.addRow(excelRow);

            // Style headers (first row)
            if (index === 0) {
                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' },
                };
            }
        });

        // Auto-adjust column widths
        worksheet.columns.forEach((column, index) => {
            if (column) {
                let maxLength = 0;
                csvResults.forEach((row) => {
                    if (
                        row[index] &&
                        row[index].toString().length > maxLength
                    ) {
                        maxLength = row[index].toString().length;
                    }
                });
                // eslint-disable-next-line no-param-reassign
                column.width = Math.min(Math.max(maxLength + 2, 10), 50);
            }
        });

        // Write to buffer
        return workbook.xlsx.writeBuffer();
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
        };
    }): Promise<{ fileUrl: string; truncated: boolean }> {
        const { onlyRaw, customLabels, pivotConfig } = options;

        // Load rows from the results file using shared streaming utility
        // For pivot tables, we need to use csvCellsLimit to prevent memory issues
        const readStream = await storageClient.getDowloadStream(
            resultsFileName,
        );

        const fieldCount = Object.keys(fields).length;
        const cellsLimit = lightdashConfig.query?.csvCellsLimit || 100000;

        // Use standard csvCellsLimit calculation - same as original downloadPivotTableCsv
        const maxRows = Math.floor(cellsLimit / fieldCount);

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

        const excelBuffer = await ExcelService.downloadPivotTableXlsx({
            rows,
            itemMap: fields,
            metricQuery,
            pivotConfig,
            onlyRaw,
            customLabels,
            maxColumnLimit: lightdashConfig.pivotTable.maxColumnLimit,
            pivotDetails,
            displayTimezone: lightdashConfig.query.timezone,
        });

        // Upload the Excel buffer to storage using the storage client pattern
        return storageClient.transformResultsIntoNewFile(
            resultsFileName,
            formattedFileName,
            async (_, writeStream: Writable) => {
                // We already have the buffer, so just write it directly
                writeStream.write(Buffer.from(excelBuffer));
                writeStream.end();
                return { truncated };
            },
        );
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
    ): Promise<{ truncated: boolean }> {
        // Use the same approach as our working tests - direct filename instead of stream
        const workbook = new Excel.stream.xlsx.WorkbookWriter({
            filename: tempFilePath,
            useStyles: true,
            useSharedStrings: true,
        });
        const worksheet = workbook.addWorksheet('Sheet1');

        // Set up columns with formatting
        worksheet.columns = headers.map((header, index) => {
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
        });

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

                    // Stream directly to Excel temp file
                    const rowObject: Record<
                        string,
                        string | number | Date | null
                    > = {};
                    rowData.forEach(
                        (
                            value: string | number | Date | null,
                            colIndex: number,
                        ) => {
                            rowObject[`col_${colIndex}`] = value;
                        },
                    );

                    const row = worksheet.addRow(rowObject);
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

        return { truncated };
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
        } = {},
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // Handle column ordering and filtering
        const {
            onlyRaw = false,
            showTableNames = false,
            customLabels = {},
            columnOrder = [],
            hiddenFields = [],
            attachmentDownloadName,
            displayTimezone,
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
            const { truncated } = await ExcelService.streamJsonlToExcelFile(
                resultsStream,
                tempFilePath,
                headers,
                fields,
                onlyRaw,
                sortedFieldIds,
                displayTimezone,
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
            };
        } catch (error) {
            Logger.error(
                `Direct Excel export failed: ${getErrorMessage(error)}`,
            );
            throw error;
        } finally {
            // Always clean up temp file, regardless of success or failure
            ExcelService.cleanupTempFile(tempFilePath);
        }
    }
}

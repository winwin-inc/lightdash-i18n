import {
    DimensionType,
    DownloadFileType,
    getErrorMessage,
    getItemLabel,
    getItemLabelWithoutTableName,
    isMomentInput,
    ItemsMap,
} from '@lightdash/common';
import moment, { MomentInput } from 'moment/moment';
import { createInterface } from 'readline';
import { Readable } from 'stream';
import Logger from '../../logging/logger';

export const isRowValueTimestamp = (
    value: unknown,
    field: { type: DimensionType },
): value is MomentInput =>
    isMomentInput(value) && field.type === DimensionType.TIMESTAMP;

export const isRowValueDate = (
    value: unknown,
    field: { type: DimensionType },
): value is MomentInput =>
    isMomentInput(value) && field.type === DimensionType.DATE;

export function sanitizeGenericFileName(name: string): string {
    return (
        name
            // Remove filesystem-unsafe characters: / \ : * ? " < > |
            .replace(/[/\\:*?"<>|]/g, '_')
            // Remove control characters (characters 0-31 and 127)
            .replace(/[\u0000-\u001F\u007F]/g, '') // eslint-disable-line no-control-regex
            // Trim leading/trailing spaces and dots (Windows issues)
            .replace(/^[\s.]+|[\s.]+$/g, '')
            // Replace multiple consecutive underscores with single underscore
            .replace(/_{2,}/g, '_') ||
        // Ensure it's not empty
        'download'
    );
}

/**
 * Creates a properly encoded Content-Disposition header that supports UTF-8 filenames
 * Uses RFC 5987 encoding to handle non-ASCII characters like Japanese characters
 */
export function createContentDispositionHeader(filename: string): string {
    // First sanitize the filename using our standard sanitization
    const sanitizedFilename = sanitizeGenericFileName(filename);

    // Create ASCII fallback by removing non-ASCII characters and normalizing spaces
    const asciiFallback =
        sanitizedFilename
            .replace(/[^\u0000-\u007F]/g, '') // eslint-disable-line no-control-regex
            .replace(/\s+/g, ' ') // normalize multiple spaces to single space
            .replace(/\s+\./g, '.') // remove spaces before file extensions
            .trim() || // remove leading/trailing spaces
        'download'; // fallback if empty

    // RFC 5987 encoding: encode the filename and prepend with UTF-8''
    const encodedFilename = encodeURIComponent(sanitizedFilename);

    // Return both filename (ASCII fallback) and filename* (UTF-8 encoded)
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

export function generateGenericFileId({
    fileName,
    fileExtension = DownloadFileType.CSV,
    truncated = false,
    time = moment(),
}: {
    fileName: string;
    fileExtension: DownloadFileType;
    truncated: boolean;
    time: moment.Moment;
}): string {
    const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');
    const sanitizedFileName = sanitizeGenericFileName(fileName);
    return `${fileExtension}-${
        truncated ? 'incomplete_results-' : ''
    }${sanitizedFileName}-${timestamp}.${fileExtension}`;
}

/**
 * Strip compact/unit hints from export headers (e.g. `(M:百万)`, `（K:千）`)
 * so raw downloads do not imply scaled values.
 */
export function stripCompactUnitHintsFromHeader(header: string): string {
    return header
        .replace(/[（(]\s*[KMBT]\s*[:：][^）)]*[）)]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Processes fields for file export, handling column ordering, filtering, and header generation
 * This utility is shared between CSV and Excel export services to avoid duplication
 */
export function processFieldsForExport(
    fields: ItemsMap,
    options: {
        showTableNames?: boolean;
        customLabels?: Record<string, string>;
        columnOrder?: string[];
        hiddenFields?: string[];
        onlyRaw?: boolean;
    },
) {
    const {
        showTableNames = false,
        customLabels = {},
        columnOrder = [],
        hiddenFields = [],
        onlyRaw = false,
    } = options;

    // Filter out hidden fields and apply column ordering
    const availableFieldIds = Object.keys(fields).filter(
        (id) => !hiddenFields.includes(id),
    );

    const sortedFieldIds =
        columnOrder.length > 0
            ? [
                  ...columnOrder.filter((id) => availableFieldIds.includes(id)),
                  ...availableFieldIds.filter(
                      (id) => !columnOrder.includes(id),
                  ),
              ]
            : availableFieldIds;

    const headers = sortedFieldIds.map((fieldId) => {
        let header: string;
        if (customLabels[fieldId]) {
            header = customLabels[fieldId];
        } else {
            const item = fields[fieldId];
            if (!item) {
                header = fieldId;
            } else {
                header = showTableNames
                    ? getItemLabel(item)
                    : getItemLabelWithoutTableName(item);
            }
        }
        return onlyRaw ? stripCompactUnitHintsFromHeader(header) : header;
    });

    return { sortedFieldIds, headers };
}

/**
 * Shared utility for streaming JSONL data from storage
 * Can be used for both row-by-row processing and collecting all rows
 * Used by both ExcelService and CsvService
 */
export async function streamJsonlData<T>({
    readStream,
    onRow,
    onComplete,
    maxLines,
}: {
    readStream: Readable;
    onRow?: (parsedRow: Record<string, unknown>, lineCount: number) => T | void;
    onComplete?: (results: T[], truncated: boolean) => void;
    maxLines?: number; // undefined = no limit (for CSV), number = limit (for Excel)
}): Promise<{ results: T[]; truncated: boolean }> {
    return new Promise((resolve, reject) => {
        const lineReader = createInterface({
            input: readStream,
            crlfDelay: Infinity,
        });

        let lineCount = 0;
        let truncated = false;
        const results: T[] = [];

        /**
         * Release the source (an S3 response, possibly wrapped in a gunzip stream) as
         * soon as we stop reading. `lineReader.close()` only stops reading; without
         * this the download stays half-open until the S3 request timeout and every
         * truncated export leaks one connection.
         */
        const releaseReadStream = () => {
            if (!readStream.destroyed) {
                readStream.destroy();
            }
        };

        lineReader.on('line', (line: string) => {
            if (!line.trim()) return;

            lineCount += 1;

            // Check if we've exceeded the line limit (only if maxLines is defined)
            if (maxLines !== undefined && lineCount > maxLines) {
                truncated = true;
                lineReader.close();
                releaseReadStream();
                return;
            }

            try {
                const parsedRow = JSON.parse(line);
                if (onRow) {
                    const result = onRow(parsedRow, lineCount);
                    if (result !== undefined) {
                        results.push(result);
                    }
                }
            } catch (error) {
                Logger.error(
                    `Error parsing line ${lineCount}: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
        });

        lineReader.on('close', async () => {
            if (onComplete) {
                await onComplete(results, truncated);
            }
            releaseReadStream();
            resolve({ results, truncated });
        });

        lineReader.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * 为 zip 条目生成唯一文件名。
 *
 * 解压工具在 Windows / macOS 上是大小写不敏感的（`Sales.xlsx` 与 `sales.xlsx`
 * 会互相覆盖），所以去重键统一小写，输出仍保留原始大小写。
 */
export function dedupeZipEntryNames(
    baseNames: string[],
    extension: string,
): string[] {
    const usedNames = new Set<string>();
    return baseNames.map((baseName) => {
        const base = sanitizeGenericFileName(baseName);
        let name = `${base}.${extension}`;
        if (usedNames.has(name.toLowerCase())) {
            let suffix = 2;
            while (usedNames.has(`${base}_${suffix}.${extension}`.toLowerCase())) {
                suffix += 1;
            }
            name = `${base}_${suffix}.${extension}`;
        }
        usedNames.add(name.toLowerCase());
        return name;
    });
}

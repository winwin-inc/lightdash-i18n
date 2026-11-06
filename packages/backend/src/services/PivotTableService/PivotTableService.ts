import {
    AnyType,
    DownloadFileType,
    formatRows,
    getErrorMessage,
    ItemsMap,
    MetricQuery,
    MissingConfigError,
    PivotConfig,
    pivotResultsAsCsv,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';
import * as fs from 'fs';
import * as fsPromise from 'fs/promises';
import moment from 'moment';
import { nanoid } from 'nanoid';
import { pipeline, Readable } from 'stream';
import { S3Client } from '../../clients/Aws/S3Client';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import {
    generateGenericFileId,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import {
    getPivotExportLimits,
    getPivotExportWidth,
} from '../../utils/FileDownloadUtils/exportLimits';
import { BaseService } from '../BaseService';

type PivotTableServiceArguments = {
    lightdashConfig: LightdashConfig;
    s3Client: S3Client;
    downloadFileModel: DownloadFileModel;
};

export class PivotTableService extends BaseService {
    /**
     * Writes rows to `filePath` as CSV with a UTF-8 BOM, honouring stream backpressure.
     */
    static async writeRowsToCsvFile(
        csvRows: string[][],
        filePath: string,
    ): Promise<void> {
        const writeStream = fs.createWriteStream(filePath);
        writeStream.write('\uFEFF');

        await new Promise<void>((resolve, reject) => {
            pipeline(
                Readable.from(csvRows, { objectMode: true }),
                stringify({ delimiter: ',' }),
                writeStream,
                (error) => {
                    if (error) {
                        Logger.error(
                            `Failed to write pivot CSV to ${filePath}: ${getErrorMessage(
                                error,
                            )}`,
                        );
                        reject(error);
                        return;
                    }
                    resolve();
                },
            );
        });
    }

    lightdashConfig: LightdashConfig;

    s3Client: S3Client;

    downloadFileModel: DownloadFileModel;

    constructor({
        lightdashConfig,
        s3Client,
        downloadFileModel,
    }: PivotTableServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.s3Client = s3Client;
        this.downloadFileModel = downloadFileModel;
    }

    /**
     * Generates a file ID for CSV files
     */
    private static generateFileId(
        fileName: string,
        truncated: boolean = false,
        time: moment.Moment = moment(),
    ): string {
        return generateGenericFileId({
            fileName,
            fileExtension: DownloadFileType.CSV,
            truncated,
            time,
        });
    }

    /**
     * Checks if the rows could be truncated based on cell limit
     */
    private couldBeTruncated(
        rows: Record<string, AnyType>[],
        configuredCellsLimit: number = this.lightdashConfig.query
            ?.csvCellsLimit || 100000,
    ) {
        if (rows.length === 0) return false;

        const numberRows = rows.length;
        const numberColumns = Object.keys(rows[0]).length;

        // we use floor when limiting the rows, so the need to make sure we got the last row valid
        const cellsLimit = configuredCellsLimit;

        return numberRows * numberColumns >= cellsLimit - numberColumns;
    }

    /**
     * Downloads pivot table CSV from async query results file
     * Handles loading data from JSONL storage file and generating pivot CSV
     */
    async downloadAsyncPivotTableCsv({
        resultsFileName,
        fields,
        metricQuery,
        projectUuid,
        storageClient,
        options,
        pivotDetails,
    }: {
        resultsFileName: string;
        fields: ItemsMap;
        metricQuery: MetricQuery;
        projectUuid: string;
        storageClient: S3ResultsFileStorageClient;
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
        // Use the same logic as regular CSV exports - respect csvCellsLimit with field count
        const readStream = await storageClient.getDowloadStream(
            resultsFileName,
        );

        const fieldCount = Object.keys(fields).length;
        const cellsLimit = this.lightdashConfig.query?.csvCellsLimit || 100000;
        // A pivoted export is as wide as its output matrix, not the input row width.
        const width = getPivotExportWidth({
            fieldCount,
            pivotTotalColumnCount: pivotDetails?.totalColumnCount,
            maxColumnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
        });
        const { effectiveCells, maxRows, clamped } = getPivotExportLimits(
            width,
            cellsLimit,
            this.lightdashConfig.query?.exportMaxPivotCells,
        );
        if (clamped) {
            Logger.warn(
                `Pivot CSV export clamped to ${maxRows} rows (${effectiveCells} cells, width ${width}, fields ${fieldCount}); csvCellsLimit=${cellsLimit}`,
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

        // Use same truncation logic as original downloadPivotTableCsv
        const finalTruncated =
            truncated || this.couldBeTruncated(rows, effectiveCells);

        if (finalTruncated) {
            Logger.warn(
                `Pivot CSV export truncated: loaded ${rows.length} rows (csvCellsLimit: ${cellsLimit}, fieldCount: ${fieldCount})`,
            );
        }

        const fileName =
            options.attachmentDownloadName || `pivot-${resultsFileName}`;

        const attachmentUrl = await this.downloadPivotTableCsv({
            name: fileName,
            projectUuid,
            rows,
            itemMap: fields,
            metricQuery,
            pivotConfig,
            exploreId: metricQuery.exploreName || 'explore',
            onlyRaw,
            truncated: finalTruncated,
            customLabels,
            pivotDetails,
        });

        return {
            fileUrl: attachmentUrl.path,
            truncated: finalTruncated,
        };
    }

    /**
     * Downloads pivot table CSV and returns the final CSV result as a string
     * This method can be memory intensive
     */
    async downloadPivotTableCsv({
        name,
        projectUuid,
        rows,
        itemMap,
        metricQuery,
        pivotConfig,
        exploreId,
        onlyRaw,
        truncated,
        customLabels,
        pivotDetails,
    }: {
        name?: string;
        projectUuid: string;
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        exploreId: string;
        onlyRaw: boolean;
        truncated: boolean;
        customLabels: Record<string, string> | undefined;
        metricsAsRows?: boolean;
    }): Promise<AttachmentUrl> {
        // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
        // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
        const formattedRows = formatRows(rows, itemMap, undefined, {
            displayTimezone: this.lightdashConfig.query.timezone,
        });

        const csvResults = pivotResultsAsCsv({
            pivotConfig,
            rows: formattedRows,
            itemMap,
            metricQuery,
            customLabels,
            onlyRaw,
            maxColumnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
            pivotDetails,
        });

        // Stream the CSV straight to disk/S3 instead of joining it into one giant
        // string and copying it into a Buffer. For wide pivots that used to mean
        // 3-4 copies of the whole file (string matrix -> joined string -> Buffer).
        return this.writeCsvRowsToFile({
            csvRows: csvResults,
            fileName: name || exploreId,
            projectUuid,
            truncated,
        });
    }

    /**
     * Streams already pivoted CSV rows to a temp file, then uploads it to S3 (or registers
     * it for local download). Rows are written through `csv-stringify` so the whole CSV
     * never has to exist in memory as a single string or Buffer.
     */
    private async writeCsvRowsToFile({
        csvRows,
        fileName,
        projectUuid,
        truncated = false,
    }: {
        csvRows: string[][];
        fileName: string;
        projectUuid: string;
        truncated?: boolean;
    }): Promise<AttachmentUrl> {
        const fileId = PivotTableService.generateFileId(fileName, truncated);
        const filePath = `/tmp/${fileId}`;

        await PivotTableService.writeRowsToCsvFile(csvRows, filePath);

        if (this.s3Client.isEnabled()) {
            const s3Url = await this.s3Client.uploadCsv(
                fs.createReadStream(filePath),
                fileId,
            );

            // Delete local file in 10 minutes, we could still read from the local file to upload to google sheets
            setTimeout(() => {
                fsPromise.unlink(filePath).catch((error) => {
                    // Already gone (e.g. local download consumed it) or /tmp was cleaned:
                    // a rejected unlink here used to be an unhandled rejection.
                    Logger.warn(
                        `Could not delete pivot CSV temp file ${filePath}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                });
            }, 60 * 10 * 1000).unref();

            return {
                filename: fileName,
                path: s3Url,
                localPath: filePath,
                truncated,
            };
        }

        // storing locally
        const downloadFileId = nanoid();
        await this.downloadFileModel.createDownloadFile(
            downloadFileId,
            filePath,
            DownloadFileType.CSV,
        );

        const localUrl = new URL(
            `/api/v1/projects/${projectUuid}/csv/${downloadFileId}`,
            this.lightdashConfig.siteUrl,
        ).href;

        return {
            filename: fileName,
            path: localUrl,
            localPath: filePath,
            truncated,
        };
    }
}

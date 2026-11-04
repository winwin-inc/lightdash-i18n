import { GetObjectCommand, NotFound } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    getErrorMessage,
    MissingConfigError,
    WarehouseResults,
} from '@lightdash/common';
import fs from 'fs';
import { PassThrough, Readable, Writable } from 'stream';
import { createGunzip, createGzip } from 'zlib';
import Logger from '../../logging/logger';
import { createContentDispositionHeader } from '../../utils/FileDownloadUtils/FileDownloadUtils';
import { buildPublicDownloadUrl } from '../Aws/buildPublicDownloadUrl';
import {
    S3CacheClient,
    type S3CacheClientArguments,
} from '../Aws/S3CacheClient';

export class S3ResultsFileStorageClient extends S3CacheClient {
    private readonly s3ExpiresIn: number | undefined;

    /** Compress result files with gzip. Readers detect it via `ContentEncoding`. */
    private readonly jsonlGzip: boolean;

    constructor(args: S3CacheClientArguments) {
        super(args);

        const { lightdashConfig } = args;
        this.s3ExpiresIn = lightdashConfig.s3?.expirationTime;
        this.jsonlGzip = lightdashConfig.results?.jsonlGzip ?? false;
    }

    static sanitizeFileExtension(
        fileName: string,
        fileExtension: string = 'jsonl',
    ) {
        const hasExtension = fileName
            .toLowerCase()
            .endsWith(`.${fileExtension.toLowerCase()}`);
        return hasExtension ? fileName : `${fileName}.${fileExtension}`;
    }

    get isEnabled() {
        return !!this.configuration && !!this.s3;
    }

    createUploadStream(
        fileName: string,
        opts: {
            contentType: string;
        },
        attachmentDownloadName?: string,
        uploadOptions?: {
            /**
             * Override `RESULTS_JSONL_GZIP` for this object. Result JSONL files keep the
             * configured behaviour, but formatted exports (CSV/XLSX) must stay plain: the
             * browser would decode a gzip body, while scripts/Excel/`curl` get binary
             * bytes with a `.csv` extension.
             */
            compress?: boolean;
        },
    ) {
        if (!this.configuration || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const passThrough = new PassThrough();

        const contentDisposition = createContentDispositionHeader(
            attachmentDownloadName || fileName,
        );

        Logger.debug(
            `Creating upload stream for ${this.configuration.bucket}/${fileName} with content disposition: ${contentDisposition} and contentType: ${opts.contentType}`,
        );

        const prefixedKey = this.getPrefixedFileId(fileName);

        const shouldCompress = uploadOptions?.compress ?? this.jsonlGzip;

        // When gzip is on we pipe the raw sink through a gzip stream and upload the
        // compressed output. `write()` and `close()` stay untouched, so callers keep
        // pushing JSONL text exactly as before.
        const uploadBody: Readable = shouldCompress
            ? passThrough.pipe(createGzip({ level: 3 }))
            : passThrough;

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: prefixedKey,
                Body: uploadBody,
                ContentType: opts.contentType,
                ...(shouldCompress ? { ContentEncoding: 'gzip' } : {}),
                ContentDisposition: contentDisposition,
            },
        });

        let isClosed = false;

        // An upload failure destroys the body stream with its error. Without a listener that
        // emits an unhandled `error` event, and Node terminates the whole process (a 100M-row
        // export used to take the pod down this way). Keep the first error and surface it from
        // `close()` instead.
        let uploadError: Error | undefined;
        const recordUploadError = (error: Error) => {
            uploadError ??= error;
            Logger.warn(
                `Upload body failed for ${
                    this.configuration?.bucket
                }/${fileName}: ${getErrorMessage(error)}`,
            );
        };
        passThrough.on('error', recordUploadError);
        if (uploadBody !== passThrough) {
            uploadBody.on('error', recordUploadError);
        }

        // `@aws-sdk/lib-storage` does not read `params.Body` until `done()` is called, and
        // callers write the whole export before calling `close()`. Without this the body just
        // fills the PassThrough (64 KB) and backpressure never reaches the producer: the
        // export hangs and buffers the entire result in memory (the 1M-row OOM). Starting the
        // upload here makes lib-storage consume the body while it is being written, so
        // `write()` backpressure works end to end.
        const uploadDone: Promise<unknown> = upload
            .done()
            .catch((error: unknown) => {
                uploadError ??=
                    error instanceof Error ? error : new Error(String(error));
                throw uploadError;
            });
        // `close()` is the only place that awaits this; keep Node from reporting an
        // unhandled rejection when nothing else consumed it yet.
        void uploadDone.catch(() => undefined);

        const abortAndRelease = async () => {
            await upload.abort().catch((abortError) => {
                Logger.warn(
                    `Failed to abort upload to ${
                        this.configuration?.bucket
                    }/${fileName}: ${getErrorMessage(abortError)}`,
                );
            });
            if (!uploadBody.destroyed) {
                uploadBody.destroy();
            }
            if (!passThrough.destroyed) {
                passThrough.destroy();
            }
        };

        const close = async () => {
            if (!this.configuration) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            if (isClosed) return;
            isClosed = true;

            if (uploadError) {
                await abortAndRelease();
                throw uploadError;
            }

            try {
                passThrough.end(); // signal EOF
                await uploadDone; // resolves when the eager upload finishes
                Logger.debug(
                    `Successfully closed upload stream to ${this.configuration.bucket}/${fileName}`,
                );
            } catch (error) {
                Logger.error(
                    `Error closing upload stream to ${
                        this.configuration.bucket
                    }/${fileName}: ${getErrorMessage(error)}`,
                );
                Logger.debug(`Full error: ${JSON.stringify(error)}`);

                // Nothing else will drain these streams: abort the multipart upload and
                // release the gzip sink, otherwise a failed upload keeps its buffers alive
                // and leaves an incomplete object in the bucket.
                await abortAndRelease();

                throw error;
            }
        };

        // Create a function that can be used as a streamQuery callback
        const write = (rows: WarehouseResults['rows']) => {
            try {
                rows.forEach((row) =>
                    passThrough.push(`${JSON.stringify(row)}\n`),
                );
            } catch (error) {
                Logger.error(
                    `Failed to write rows to fileName ${fileName}: ${getErrorMessage(
                        error,
                    )}`,
                );
                throw error;
            }
        };

        return { write, close, writeStream: passThrough };
    }

    async getDowloadStream(
        cacheKey: string,
        fileExtension = 'jsonl',
    ): Promise<Readable> {
        try {
            const results = await this.getResults(cacheKey, fileExtension);
            if (!results.Body) {
                throw new Error('No results found');
            }

            const body = results.Body as Readable;
            // Result files may be gzip compressed (see `createUploadStream`). Older
            // objects have no `ContentEncoding`, so they keep streaming as-is.
            if (results.ContentEncoding !== 'gzip') {
                return body;
            }

            const decompressed = createGunzip();

            // `pipe()` only moves data: destroying the destination does not destroy the
            // source. Callers stop reading as soon as they have a full page
            // (`AsyncQueryService.getResultsPageFromS3` calls `destroy()` in `finally`),
            // so without this the S3 response stays half-read with its socket open until
            // `S3_REQUEST_TIMEOUT` (30 min by default) — one leaked connection per page
            // read, until S3 requests queue forever and every query hangs.
            const releaseSource = () => {
                if (!body.destroyed) {
                    body.destroy();
                }
            };
            decompressed.once('close', releaseSource);

            // `pipe()` does not forward errors either; propagate them so the reader fails
            // instead of waiting for the request timeout.
            body.once('error', (bodyError: Error) => {
                decompressed.destroy(bodyError);
            });

            body.pipe(decompressed);

            return decompressed;
        } catch (error) {
            if (error instanceof NotFound) {
                throw new Error(`Cache key ${cacheKey} not found`);
            }
            Logger.error(
                `Failed to download results from s3. ${getErrorMessage(error)}`,
            );
            throw error;
        }
    }

    async getFileUrl(cacheKey: string, fileExtension = 'jsonl') {
        if (!this.configuration || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const key = S3ResultsFileStorageClient.sanitizeFileExtension(
            cacheKey,
            fileExtension,
        );

        const prefixedKey = this.getPrefixedFileId(key);
        const publicEndpoint = this.configuration.publicEndpoint?.trim();
        if (publicEndpoint) {
            return buildPublicDownloadUrl(publicEndpoint, prefixedKey);
        }

        return getSignedUrl(
            this.s3,
            new GetObjectCommand({
                Bucket: this.configuration.bucket,
                Key: prefixedKey,
            }),
            {
                expiresIn: this.s3ExpiresIn,
            },
        );
    }

    async transformResultsIntoNewFile(
        sourceResultsFileWithoutExtension: string,
        sinkFileName: string,
        streamProcessor: (
            readStream: Readable,
            writeStream: Writable,
        ) => Promise<{ truncated: boolean }>,
        attachmentDownloadName?: string,
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // File format configuration map
        const formatConfig = new Map([
            [
                'csv',
                { contentType: 'text/csv; charset=utf-8', extension: 'csv' },
            ],
            [
                'xlsx',
                {
                    contentType:
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    extension: 'xlsx',
                },
            ],
            [
                'jsonl',
                {
                    contentType: 'application/jsonl; charset=utf-8',
                    extension: 'jsonl',
                },
            ],
        ]);

        // Determine file format from extension
        const fileExtension =
            sinkFileName.toLowerCase().split('.').pop() || 'jsonl';
        const config =
            formatConfig.get(fileExtension) || formatConfig.get('jsonl')!;

        // Create upload stream
        // The sink is usually a formatted export (CSV/XLSX) that users download directly, so
        // it is not compressed: `Content-Encoding: gzip` on a `.csv` object breaks scripts,
        // Excel/curl and anything that does not decode the body for us. A `.jsonl` sink keeps
        // following `RESULTS_JSONL_GZIP`.
        const { writeStream, close } = this.createUploadStream(
            sinkFileName,
            {
                contentType: config.contentType,
            },
            attachmentDownloadName
                ? `${attachmentDownloadName}.${config.extension}`
                : undefined,
            { compress: fileExtension === 'jsonl' ? undefined : false },
        );

        // Get the results stream
        const resultsStream = await this.getDowloadStream(
            sourceResultsFileWithoutExtension,
        );

        // Process the stream
        const { truncated } = await streamProcessor(resultsStream, writeStream);

        await close();

        const url = await this.getFileUrl(sinkFileName, config.extension);

        return {
            fileUrl: url,
            truncated,
        };
    }

    /**
     * Upload a file directly to S3 from a local file path
     * Useful for uploading pre-generated files like Excel files
     */
    async uploadFile(
        fileName: string,
        filePath: string,
        options: {
            contentType: string;
            attachmentDownloadName?: string;
        },
    ): Promise<string> {
        if (!this.configuration || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const fileStream = fs.createReadStream(filePath);

        const prefixedKey = this.getPrefixedFileId(fileName);
        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: prefixedKey,
                Body: fileStream,
                ContentType: options.contentType,
                ContentDisposition: createContentDispositionHeader(
                    options.attachmentDownloadName || fileName,
                ),
            },
        });

        try {
            await upload.done();
            Logger.debug(
                `Successfully uploaded file to ${this.configuration.bucket}/${fileName}`,
            );

            // Determine file extension for URL generation
            const fileExtension =
                fileName.toLowerCase().split('.').pop() || 'xlsx';
            return await this.getFileUrl(fileName, fileExtension);
        } catch (error) {
            Logger.error(
                `Failed to upload file to ${
                    this.configuration.bucket
                }/${fileName}: ${getErrorMessage(error)}`,
            );
            throw error;
        }
    }
}

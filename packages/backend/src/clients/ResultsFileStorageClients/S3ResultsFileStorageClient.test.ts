import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { gzipSync } from 'zlib';
import { LightdashConfig } from '../../config/parseConfig';
import { S3ResultsFileStorageClient } from './S3ResultsFileStorageClient';

const mockUploads: {
    params: Record<string, unknown>;
    done: jest.Mock;
    abort: jest.Mock;
}[] = [];

jest.mock('@aws-sdk/lib-storage', () => ({
    Upload: jest.fn().mockImplementation(({ params }) => {
        const instance = {
            params,
            done: jest.fn().mockResolvedValue(undefined),
            abort: jest.fn().mockResolvedValue(undefined),
        };
        mockUploads.push(instance);
        return instance;
    }),
}));

/**
 * Result JSONL files may be stored gzip compressed (`RESULTS_JSONL_GZIP=true`).
 * Readers must stay able to read both plain and compressed objects, otherwise
 * rolling the flag back (or reading older objects) breaks exports.
 */

const buildConfig = (jsonlGzip: boolean) =>
    ({
        results: { jsonlGzip },
        s3: undefined,
    } as unknown as LightdashConfig);

const readAll = async (stream: Readable): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
    });

const jsonl = `${['{"a":1}', '{"a":2}', '{"a":3}'].join('\n')}\n`;

describe('S3ResultsFileStorageClient.getDowloadStream', () => {
    const client = new S3ResultsFileStorageClient({
        lightdashConfig: buildConfig(true),
    });

    const mockGetResults = (body: Readable, contentEncoding?: 'gzip') =>
        jest.spyOn(client, 'getResults').mockResolvedValue({
            Body: body,
            ...(contentEncoding ? { ContentEncoding: contentEncoding } : {}),
            $metadata: {},
        } as unknown as GetObjectCommandOutput);

    afterEach(() => jest.restoreAllMocks());

    it('gunzips objects stored with ContentEncoding: gzip', async () => {
        mockGetResults(
            Readable.from([gzipSync(Buffer.from(jsonl, 'utf8'))]),
            'gzip',
        );

        const stream = await client.getDowloadStream('results-key');
        await expect(readAll(stream)).resolves.toBe(jsonl);
    });

    it('passes through plain objects written before gzip was enabled', async () => {
        mockGetResults(Readable.from([Buffer.from(jsonl, 'utf8')]));

        const stream = await client.getDowloadStream('results-key');
        await expect(readAll(stream)).resolves.toBe(jsonl);
    });

    /**
     * Callers stop reading as soon as they have a full page and then destroy the
     * stream. Destroying the gunzip must also release the S3 response, otherwise the
     * socket stays open until the request timeout and every page read leaks one.
     */
    it('destroys the underlying S3 response when the reader stops early', async () => {
        const body = Readable.from([
            gzipSync(Buffer.from(jsonl.repeat(1000), 'utf8')),
        ]);
        mockGetResults(body, 'gzip');

        const stream = await client.getDowloadStream('results-key');
        const closed = new Promise<void>((resolve) => {
            stream.once('close', () => resolve());
        });

        // Simulate `getResultsPageFromS3` finishing a page and cleaning up.
        stream.destroy();
        await closed;

        expect(body.destroyed).toBe(true);
    });

    it('forwards S3 response errors to the reader', async () => {
        const body = new Readable({
            read() {
                this.destroy(new Error('socket hang up'));
            },
        });
        mockGetResults(body, 'gzip');

        const stream = await client.getDowloadStream('results-key');
        await expect(readAll(stream)).rejects.toThrow('socket hang up');
    });
});

/**
 * `createUploadStream` used to have no `error` listener on its body stream. An upload
 * failure destroyed that stream with its error, the `error` event had no listener, and
 * Node terminated the process (the pod restart users saw after a failed export).
 */
describe('S3ResultsFileStorageClient.createUploadStream', () => {
    const buildS3Client = (jsonlGzip: boolean) =>
        new S3ResultsFileStorageClient({
            lightdashConfig: {
                results: {
                    jsonlGzip,
                    s3: {
                        bucket: 'bucket',
                        endpoint: 'https://oss.example.com',
                        region: 'auto',
                        accessKey: 'key',
                        secretKey: 'secret',
                        forcePathStyle: false,
                    },
                },
            } as unknown as LightdashConfig,
        });

    beforeEach(() => {
        mockUploads.length = 0;
    });

    it('does not gzip formatted exports so downloaded CSV/XLSX stay plain', async () => {
        const client = buildS3Client(true); // RESULTS_JSONL_GZIP=true

        const { close } = client.createUploadStream(
            'export.csv',
            { contentType: 'text/csv' },
            undefined,
            { compress: false },
        );
        await close();

        expect(mockUploads[0].params.ContentEncoding).toBeUndefined();
    });

    it('still gzips result JSONL when the flag is on', async () => {
        const client = buildS3Client(true);

        const { close } = client.createUploadStream('results.jsonl', {
            contentType: 'application/jsonl',
        });
        await close();

        expect(mockUploads[0].params.ContentEncoding).toBe('gzip');
    });

    it('surfaces body stream errors from close() instead of crashing the process', async () => {
        const client = buildS3Client(true);

        const { writeStream, close } = client.createUploadStream(
            'results.jsonl',
            { contentType: 'application/jsonl' },
        );

        writeStream.emit('error', new Error('socket hang up'));

        await expect(close()).rejects.toThrow('socket hang up');
        expect(mockUploads[0].abort).toHaveBeenCalled();
    });

    it('starts the upload before close() so the body is drained while writing', async () => {
        // Regression pin: lib-storage only reads `params.Body` once done() is called.
        // If it is deferred to close(), the body fills up (64 KB) and the export both
        // hangs and buffers everything in memory (the 1M-row OOM).
        const client = buildS3Client(false);

        const { close } = client.createUploadStream(
            'export.csv',
            { contentType: 'text/csv' },
            undefined,
            { compress: false },
        );

        expect(mockUploads[0].done).toHaveBeenCalledTimes(1);

        await close();
    });
});

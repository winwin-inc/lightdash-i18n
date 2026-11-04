import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { gzipSync } from 'zlib';
import { LightdashConfig } from '../../config/parseConfig';
import { S3ResultsFileStorageClient } from './S3ResultsFileStorageClient';

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

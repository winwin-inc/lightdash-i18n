import {
    DimensionType,
    FieldType,
    ItemsMap,
    MetricType,
    type Item,
} from '@lightdash/common';
import { Readable, Writable } from 'stream';
import { gzipSync } from 'zlib';
import { CsvService } from './CsvService';

// `@lightdash/warehouses` pulls in native drivers (lz4 for Databricks) that are not
// available in every local environment. This test only exercises the CSV pipeline.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

/**
 * Regression gate for the CSV export pipeline changes:
 *  - #23: result JSONL may now be gzip compressed; the exported CSV must be
 *         byte-identical to the plaintext path.
 *  - #24: a `maxLines` cap must truncate at exactly N rows and report it.
 */

const itemMap: ItemsMap = {
    month: {
        name: 'month',
        label: '月份',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.month',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    } as Item,
    amount: {
        name: 'amount',
        label: '销售额',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.amount',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        format: 'usd',
    } as Item,
    ratio: {
        name: 'ratio',
        label: '占比',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.ratio',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: MetricType.AVERAGE,
        format: 'percent',
    } as Item,
};

const sortedFieldIds = ['month', 'amount', 'ratio'];
const headers = ['月份', '销售额', '占比'];

const ROWS = 120;

const buildJsonl = (rows: number) =>
    `${Array.from({ length: rows }, (_, index) =>
        JSON.stringify({
            month: `2026-${String((index % 12) + 1).padStart(2, '0')}`,
            amount: 1234.5678 + index,
            ratio: index / 1000,
        }),
    ).join('\n')}\n`;

const render = async (
    input: Readable,
    maxLines?: number,
): Promise<{ csv: string; truncated: boolean }> => {
    const chunks: Buffer[] = [];
    const writeStream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        },
    });

    const { truncated } = await CsvService.streamJsonlRowsToFile(
        false,
        itemMap,
        sortedFieldIds,
        headers,
        { readStream: input, writeStream },
        'Asia/Shanghai',
        maxLines,
    );

    return {
        // strip the UTF-8 BOM written by the stringifier
        csv: Buffer.concat(chunks)
            .toString('utf8')
            .replace(/^\uFEFF/, ''),
        truncated,
    };
};

describe('CsvService.streamJsonlRowsToFile', () => {
    it('produces byte-identical CSV whether the source JSONL is gzip or plain', async () => {
        const jsonl = buildJsonl(ROWS);

        const plain = await render(Readable.from([Buffer.from(jsonl)]));
        const gzipped = await render(
            Readable.from([gzipSync(Buffer.from(jsonl))]).pipe(
                // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
                require('zlib').createGunzip(),
            ),
        );

        expect(gzipped.csv).toBe(plain.csv);
        expect(plain.truncated).toBe(false);
    });

    it('exports every row when no cap is set', async () => {
        const { csv, truncated } = await render(
            Readable.from([Buffer.from(buildJsonl(ROWS))]),
        );
        const lines = csv.trimEnd().split('\n');

        expect(truncated).toBe(false);
        expect(lines).toHaveLength(ROWS + 1); // header + rows
        expect(lines[0]).toBe('月份,销售额,占比');
    });

    it('stops at maxLines and reports truncated', async () => {
        const cap = 50;
        const uncapped = await render(
            Readable.from([Buffer.from(buildJsonl(ROWS))]),
        );
        const { csv, truncated } = await render(
            Readable.from([Buffer.from(buildJsonl(ROWS))]),
            cap,
        );

        const cappedLines = csv.trimEnd().split('\n');
        const uncappedLines = uncapped.csv.trimEnd().split('\n');

        expect(truncated).toBe(true);
        expect(cappedLines).toHaveLength(cap + 1); // header + cap rows
        // the truncated file must be a byte-identical prefix of the full export
        expect(cappedLines).toEqual(uncappedLines.slice(0, cap + 1));
    });

    it('does not mark the export as truncated when it fits under the cap', async () => {
        const { csv, truncated } = await render(
            Readable.from([Buffer.from(buildJsonl(10))]),
            ROWS,
        );

        expect(truncated).toBe(false);
        expect(csv.trimEnd().split('\n')).toHaveLength(11);
    });
});

/**
 * The old implementation wrote every row into the stringifier without checking
 * `write()`'s return value, so a slow sink (S3 upload) buffered the whole export and
 * OOMKilled the pod at ~1M rows. This test pins the backpressure: while the sink is
 * blocked, the source must stay essentially unread.
 */
describe('CsvService.streamJsonlRowsToFile backpressure', () => {
    it('pauses the source while the sink is blocked', async () => {
        const total = 2_000;
        let pushed = 0;
        const source = new Readable({
            read() {
                if (pushed >= total) {
                    this.push(null);
                    return;
                }
                pushed += 1;
                this.push(
                    `${JSON.stringify({
                        month: '2026-01',
                        amount: pushed,
                        ratio: 1,
                    })}\n`,
                );
            },
        });
        const pauseSpy = jest.spyOn(source, 'pause');
        const resumeSpy = jest.spyOn(source, 'resume');

        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let blocked = false;

        const writeStream = new Writable({
            write(_chunk: Buffer, _encoding, callback) {
                if (blocked) {
                    callback();
                    return;
                }
                // Block the sink until the test releases it, mimicking a slow S3 upload.
                blocked = true;
                void gate.then(() => callback());
            },
        });

        const done = CsvService.streamJsonlRowsToFile(
            false,
            itemMap,
            sortedFieldIds,
            headers,
            { readStream: source, writeStream },
            'Asia/Shanghai',
        );

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        // While the sink is blocked the reader must be held back, not drained into memory.
        // (The synthetic source pushes synchronously, so the observable signal here is the
        // pause/resume pair rather than the exact number of buffered rows.)
        expect(blocked).toBe(true);
        expect(pauseSpy).toHaveBeenCalled();

        release();
        const { truncated } = await done;

        expect(truncated).toBe(false);
        expect(resumeSpy).toHaveBeenCalled();
        expect(pushed).toBe(total);
    });

    it('rejects instead of hanging when the sink fails while backpressured', async () => {
        const writeStream = new Writable({
            write(_chunk: Buffer, _encoding, callback) {
                callback(new Error('upload failed'));
            },
        });

        await expect(
            CsvService.streamJsonlRowsToFile(
                false,
                itemMap,
                sortedFieldIds,
                headers,
                {
                    readStream: Readable.from([Buffer.from(buildJsonl(ROWS))]),
                    writeStream,
                },
                'Asia/Shanghai',
            ),
        ).rejects.toThrow('upload failed');
    });
});

describe('CsvService.streamJsonlRowsToFile leading filter columns', () => {
    const leadingColumns = [
        { header: '时间', value: '2026-01 ~ 2026-06' },
        { header: '类目', value: '饮料' },
    ];

    const renderWithLeading = async (
        input: Readable,
    ): Promise<string> => {
        const chunks: Buffer[] = [];
        const writeStream = new Writable({
            write(chunk: Buffer, _encoding, callback) {
                chunks.push(Buffer.from(chunk));
                callback();
            },
        });

        await CsvService.streamJsonlRowsToFile(
            false,
            itemMap,
            sortedFieldIds,
            headers,
            { readStream: input, writeStream },
            'Asia/Shanghai',
            undefined,
            leadingColumns,
        );

        return Buffer.concat(chunks)
            .toString('utf8')
            .replace(/^\uFEFF/, '');
    };

    it('prepends the header names once and the values on every row', async () => {
        const csv = await renderWithLeading(
            Readable.from([
                Buffer.from(
                    [
                        JSON.stringify({ month: '2026-01', amount: 1, ratio: 0.1 }),
                        JSON.stringify({ month: '2026-02', amount: 2, ratio: 0.2 }),
                    ].join('\n'),
                ),
            ]),
        );
        const lines = csv.trim().split('\n');

        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('时间,类目,月份,销售额,占比');
        expect(lines[1].startsWith('2026-01 ~ 2026-06,饮料,2026-01,')).toBe(true);
        expect(lines[2].startsWith('2026-01 ~ 2026-06,饮料,2026-02,')).toBe(true);
    });
});

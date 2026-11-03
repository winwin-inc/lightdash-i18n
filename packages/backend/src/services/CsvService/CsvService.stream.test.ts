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
        csv: Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''),
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

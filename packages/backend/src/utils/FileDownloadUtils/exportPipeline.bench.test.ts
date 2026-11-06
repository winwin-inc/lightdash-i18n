import { DimensionType, FieldType, ItemsMap, formatItemValue, type Item } from '@lightdash/common';
import { formatMomentByTimezone } from './formatMomentByTimezone';

/**
 * Row level benchmark for the CSV/XLSX cell pipeline.
 *
 * Run with:
 *   BENCH=1 TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 \
 *     pnpm -F backend exec jest --config jest.config.js src/utils/FileDownloadUtils/exportPipeline.bench.test.ts
 *
 * It compares the pre-optimisation implementation (one `Intl` formatter constructed per
 * cell) with the current one, using the same column mix a typical export has:
 * 12 string dimensions, 2 timestamps, 1 date, 5 numeric metrics.
 */

const TIMEZONE = 'Asia/Shanghai';

// --- legacy oracles -----------------------------------------------------------------

const legacyFormatMoment = (value: unknown, pattern: string): string => {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
        const parts = new Intl.DateTimeFormat('sv-SE', {
            timeZone: TIMEZONE,
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
        const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}.${milliseconds}`;
    }
    return String(value);
};

// `toLocaleString` with the same options the formatter used before caching
const legacyFormatNumber = (value: number, currency?: string): string =>
    value.toLocaleString(undefined, {
        ...(currency ? { style: 'currency', currency } : {}),
    });

// --- current implementation ----------------------------------------------------------

const NUMERIC_FIELDS = ['rev_usd', 'qty', 'ratio', 'share', 'growth'];
const TIMESTAMP_FIELDS = ['created_at', 'updated_at'];
const DATE_FIELDS = ['biz_date'];

const buildItemMap = (): ItemsMap => {
    const map: ItemsMap = {};
    const add = (name: string, type: DimensionType, fieldType: FieldType) => {
        map[name] = {
            name,
            label: name,
            table: 't',
            tableLabel: 't',
            sql: `\${TABLE}.${name}`,
            hidden: false,
            fieldType,
            type,
        } as Item;
    };
    for (let i = 0; i < 12; i += 1) add(`dim_${i}`, DimensionType.STRING, FieldType.DIMENSION);
    TIMESTAMP_FIELDS.forEach((f) => add(f, DimensionType.TIMESTAMP, FieldType.DIMENSION));
    DATE_FIELDS.forEach((f) => add(f, DimensionType.DATE, FieldType.DIMENSION));
    NUMERIC_FIELDS.forEach((f) => add(f, DimensionType.NUMBER, FieldType.METRIC));
    return map;
};

const itemMap = buildItemMap();
const fieldIds = Object.keys(itemMap);

const makeValue = (fieldId: string, row: number): unknown => {
    if (NUMERIC_FIELDS.includes(fieldId)) return 1234.5 + row;
    if (TIMESTAMP_FIELDS.includes(fieldId)) return '2026-01-02T16:00:00.000Z';
    if (DATE_FIELDS.includes(fieldId)) return '2026-01-02T00:00:00.000Z';
    return `sku-${row % 1000}`;
};

const legacyRow = (row: number): string[] =>
    fieldIds.map((fieldId) => {
        if (NUMERIC_FIELDS.includes(fieldId)) return legacyFormatNumber(makeValue(fieldId, row) as number);
        if (TIMESTAMP_FIELDS.includes(fieldId)) return legacyFormatMoment(makeValue(fieldId, row), 'YYYY-MM-DD HH:mm:ss.SSS');
        if (DATE_FIELDS.includes(fieldId)) return legacyFormatMoment(makeValue(fieldId, row), 'YYYY-MM-DD');
        return String(makeValue(fieldId, row));
    });

const currentRow = (row: number): string[] =>
    fieldIds.map((fieldId) => {
        if (NUMERIC_FIELDS.includes(fieldId)) return formatItemValue(itemMap[fieldId], makeValue(fieldId, row));
        if (TIMESTAMP_FIELDS.includes(fieldId)) return formatMomentByTimezone(makeValue(fieldId, row), 'YYYY-MM-DD HH:mm:ss.SSS', TIMEZONE);
        if (DATE_FIELDS.includes(fieldId)) return formatMomentByTimezone(makeValue(fieldId, row), 'YYYY-MM-DD', TIMEZONE);
        return String(makeValue(fieldId, row));
    });

const measure = (fn: (row: number) => string[], rows: number) => {
    for (let i = 0; i < 2000; i += 1) fn(i);
    const start = process.hrtime.bigint();
    let cells = 0;
    for (let i = 0; i < rows; i += 1) cells += fn(i).length;
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    return { elapsedMs, cells };
};

const describeBench = process.env.BENCH === '1' ? describe : describe.skip;

describeBench('export cell pipeline', () => {
    it('reports per row cost and projected export durations', () => {
        const rows = 20_000;
        const legacy = measure(legacyRow, rows);
        const current = measure(currentRow, rows);

        const legacyMicros = (legacy.elapsedMs * 1000) / rows;
        const currentMicros = (current.elapsedMs * 1000) / rows;

        // eslint-disable-next-line no-console
        console.log(
            `\n${fieldIds.length} columns x ${rows} rows\n` +
                `  legacy : ${legacyMicros.toFixed(1)} µs/row\n` +
                `  current: ${currentMicros.toFixed(1)} µs/row  (${(legacyMicros / currentMicros).toFixed(1)}x faster)\n` +
                `  projected 135k rows: ${((legacyMicros * 135000) / 1e6).toFixed(1)}s -> ${((currentMicros * 135000) / 1e6).toFixed(1)}s\n` +
                `  projected 700k rows: ${((legacyMicros * 700000) / 1e6).toFixed(1)}s -> ${((currentMicros * 700000) / 1e6).toFixed(1)}s`,
        );

        expect(legacy.cells).toBe(current.cells);
    });
});

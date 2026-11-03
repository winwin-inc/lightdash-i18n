import { CustomFormatType, NumberSeparator, type CustomFormat } from '../types/field';
import { formatNumberValue } from './formatting';

/**
 * Byte-for-byte compatibility gate for the number formatter.
 *
 * `formatNumberValue` used to call `Number#toLocaleString(locale, options)` which builds a
 * new ICU formatter per cell (~20µs). It now reuses a memoized `Intl.NumberFormat`, which is
 * ~30x faster but must stay byte-identical: exported CSVs are parsed by customer scripts.
 *
 * The oracle below is a verbatim copy of the previous implementation.
 */

// --- oracle: previous private implementation, do not "optimize" ---------------------

function legacyGetFormatNumberOptions(value: number, format?: CustomFormat) {
    const hasCurrency =
        format?.type === CustomFormatType.CURRENCY && format?.currency;
    const currencyOptions: Intl.NumberFormatOptions = hasCurrency
        ? { style: 'currency', currency: format.currency }
        : {};

    const round = format?.round;

    if (round === undefined) {
        return hasCurrency ? currencyOptions : {};
    }

    if (round < 0) {
        return {
            maximumSignificantDigits: Math.max(
                Math.floor(value).toString().length + round,
                1,
            ),
            maximumFractionDigits: 0,
            ...currencyOptions,
        };
    }

    const fractionDigits = Math.min(round, 20);
    return {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
        ...currencyOptions,
    };
}

function legacyFormatNumberValue(value: number, format?: CustomFormat): string {
    const options = legacyGetFormatNumberOptions(value, format);
    const separator = format?.separator || NumberSeparator.DEFAULT;
    switch (separator) {
        case NumberSeparator.COMMA_PERIOD:
            return value.toLocaleString('en-US', options);
        case NumberSeparator.SPACE_PERIOD:
            return value.toLocaleString('en-US', options).replace(/,/g, ' ');
        case NumberSeparator.PERIOD_COMMA:
            return value.toLocaleString('de-DE', options);
        case NumberSeparator.NO_SEPARATOR_PERIOD:
            return value.toLocaleString('en-US', {
                ...options,
                useGrouping: false,
            });
        case NumberSeparator.DEFAULT:
            return value.toLocaleString(undefined, options);
        default:
            throw new Error(`Unknown separator ${separator}`);
    }
}

// --- corpus ------------------------------------------------------------------------

const VALUES = [
    0,
    -0,
    1,
    -1,
    0.5,
    -0.5,
    1.005,
    2.675,
    -2.675,
    999,
    1000,
    1234.5678,
    -1234.5678,
    999999.999,
    1e6,
    1e21,
    1e-7,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 2,
    Number.MIN_SAFE_INTEGER,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    NaN,
    // non numeric values that reach the formatter through `isNumber` (`Number('') === 0`)
    '' as unknown as number,
    '   ' as unknown as number,
];

const SEPARATORS = Object.values(NumberSeparator);

const BASE_FORMATS: Array<CustomFormat | undefined> = [
    undefined,
    { type: CustomFormatType.DEFAULT },
    { type: CustomFormatType.NUMBER },
    { type: CustomFormatType.PERCENT },
    { type: CustomFormatType.ID },
    { type: CustomFormatType.BYTES_SI },
    { type: CustomFormatType.BYTES_IEC },
    { type: CustomFormatType.CURRENCY, currency: 'USD' },
    { type: CustomFormatType.CURRENCY, currency: 'EUR' },
    { type: CustomFormatType.CURRENCY, currency: 'JPY' },
    { type: CustomFormatType.CURRENCY, currency: 'CNY' },
    { type: CustomFormatType.CURRENCY, currency: 'CLP' },
    { type: CustomFormatType.CURRENCY, currency: 'BHD' },
];

const ROUNDS = [undefined, 0, 1, 2, 3, 4, 20, -1, -2, -3];

const CURRENCIES = [undefined, 'USD', 'EUR', 'CNY', 'JPY', 'BRL', 'CHF'];

const COMPACTS: CustomFormat['compact'][] = [
    undefined,
    'thousand',
    'million',
    'billion',
    'trillion',
    'K',
    'M',
    'B',
    'KiB',
    'MiB',
    'GiB',
];

const PREFIXES = [undefined, '$', '≈', ''];

const SUFFIXES = [undefined, ' rows', '%'];

const buildFormats = (): Array<CustomFormat | undefined> => {
    const formats: Array<CustomFormat | undefined> = [...BASE_FORMATS];

    SEPARATORS.forEach((separator) => {
        formats.push({ type: CustomFormatType.NUMBER, separator });
        formats.push({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
            separator,
        });
        formats.push({
            type: CustomFormatType.NUMBER,
            separator,
        });
    });

    ROUNDS.forEach((round) => {
        formats.push({ type: CustomFormatType.NUMBER, round });
        formats.push({ type: CustomFormatType.CURRENCY, currency: 'EUR', round });
        formats.push({ type: CustomFormatType.PERCENT, round });
    });

    CURRENCIES.forEach((currency) => {
        formats.push({ type: CustomFormatType.CURRENCY, currency });
        formats.push({
            type: CustomFormatType.CURRENCY,
            currency,
            round: 0,
        });
        formats.push({
            type: CustomFormatType.CURRENCY,
            currency,
            round: -2,
        });
    });

    COMPACTS.forEach((compact) => {
        formats.push({ type: CustomFormatType.NUMBER, compact });
        formats.push({ type: CustomFormatType.CURRENCY, currency: 'USD', compact });
        formats.push({ type: CustomFormatType.PERCENT, compact });
    });

    PREFIXES.forEach((prefix) => {
        SUFFIXES.forEach((suffix) => {
            formats.push({ type: CustomFormatType.NUMBER, prefix, suffix });
        });
    });

    return formats;
};

const FORMATS = buildFormats();

describe('formatNumberValue byte compatibility', () => {
    it('matches the previous toLocaleString implementation for the whole corpus', () => {
        const mismatches: string[] = [];

        FORMATS.forEach((format) => {
            VALUES.forEach((value) => {
                const expected = legacyFormatNumberValue(value, format);
                const actual = formatNumberValue(value, format);
                if (expected !== actual) {
                    mismatches.push(
                        `value=${String(value)} format=${JSON.stringify(
                            format,
                        )} expected=${JSON.stringify(
                            expected,
                        )} actual=${JSON.stringify(actual)}`,
                    );
                }
            });
        });

        expect(mismatches).toEqual([]);
    });

    it('covers the corpus size we expect', () => {
        expect(FORMATS.length * VALUES.length).toBeGreaterThan(2500);
    });

    it('keeps throwing on an invalid currency', () => {
        const invalid = {
            type: CustomFormatType.CURRENCY,
            currency: 'NOT_A_CURRENCY',
        } as unknown as CustomFormat;

        expect(() => formatNumberValue(1, invalid)).toThrow();
        // A second call must throw again instead of caching a broken formatter
        expect(() => formatNumberValue(1, invalid)).toThrow();
    });

    it('is stable across repeated calls (cache does not leak state)', () => {
        const format: CustomFormat = {
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
            round: 2,
        };
        const first = formatNumberValue(1234.5678, format);
        for (let i = 0; i < 100; i += 1) {
            expect(formatNumberValue(1234.5678, format)).toBe(first);
        }
        expect(first).toBe(legacyFormatNumberValue(1234.5678, format));
    });

    it('survives cache eviction (more distinct formats than the cache holds)', () => {
        const formats = Array.from({ length: 600 }, (_, index) => ({
            type: CustomFormatType.NUMBER,
            round: index % 21,
            prefix: `p${index}`,
        }));

        formats.forEach((format) => {
            const value = 1234.5678;
            expect(formatNumberValue(value, format)).toBe(
                legacyFormatNumberValue(value, format),
            );
        });
    });
});

/**
 * Run with `BENCH=1 pnpm -F common exec jest src/utils/formatting.bytecompat.test.ts`.
 * Kept out of the normal suite because timings are machine dependent.
 */
const describeBench = process.env.BENCH === '1' ? describe : describe.skip;

describeBench('formatNumberValue benchmark', () => {
    const cells = 300_000;

    const measure = (fn: (value: number, format?: CustomFormat) => string, format?: CustomFormat) => {
        // warm up so we measure steady state, not JIT compilation
        for (let i = 0; i < 20_000; i += 1) fn(1234.5 + i, format);
        const start = process.hrtime.bigint();
        for (let i = 0; i < cells; i += 1) fn(1234.5 + i, format);
        return Number(process.hrtime.bigint() - start) / 1e3 / cells;
    };

    it('prints µs/cell for legacy vs cached', () => {
        const cases: Array<[string, CustomFormat | undefined]> = [
            ['plain number', undefined],
            ['legacy currency (usd)', { type: CustomFormatType.CURRENCY, currency: 'USD', round: 2 }],
            ['percent', { type: CustomFormatType.PERCENT, round: 2 }],
            ['compact million', { type: CustomFormatType.NUMBER, compact: 'million' }],
        ];

        cases.forEach(([name, format]) => {
            const legacy = measure(legacyFormatNumberValue, format);
            const current = measure(formatNumberValue, format);
            // eslint-disable-next-line no-console
            console.log(
                `${name.padEnd(24)} legacy=${legacy.toFixed(2)}µs cached=${current.toFixed(2)}µs speedup=${(legacy / current).toFixed(1)}x  1M cells: ${legacy.toFixed(0)}s -> ${current.toFixed(0)}s`,
            );
        });
    });
});

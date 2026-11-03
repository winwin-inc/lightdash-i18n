import moment from 'moment';
import { formatMomentByTimezone } from './formatMomentByTimezone';

/**
 * Byte-for-byte compatibility gate for the timezone aware date formatting used by CSV /
 * XLSX exports. The previous implementation built a new `Intl.DateTimeFormat` and joined
 * `formatToParts()` for every single cell (~55µs). The new one caches formatters per
 * timezone and uses `format()` (~1.5µs), so we must prove the output did not change:
 * exported CSVs are consumed by customer scripts.
 */

// --- oracle: previous implementation, do not "optimize" ----------------------------

function legacyFormatMomentByTimezone(
    value: unknown,
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
    return moment(value as moment.MomentInput).format(pattern);
}

const TIMESTAMP_PATTERN = 'YYYY-MM-DD HH:mm:ss.SSS';
const DATE_PATTERN = 'YYYY-MM-DD';

const TIMEZONES = [
    'Asia/Shanghai',
    'UTC',
    'America/New_York',
    'Europe/Berlin',
    'Asia/Kolkata', // +05:30, half hour offset
    'Pacific/Chatham', // +12:45 / +13:45, quarter hour offset + DST
    'Australia/Lord_Howe', // +10:30 / +11:00, 30 min DST shift
];

const VALUES: unknown[] = [
    // midnight in +08:00 => 16:00Z of the previous day (hourCycle regression guard)
    '2026-01-02T16:00:00.000Z',
    '2026-01-02T15:59:59.999Z',
    // US DST spring forward / fall back
    '2026-03-08T07:30:00.000Z',
    '2026-03-08T06:59:59.000Z',
    '2026-11-01T05:30:00.000Z',
    '2026-11-01T06:30:00.000Z',
    // EU DST
    '2026-03-29T00:59:59.000Z',
    '2026-03-29T01:00:00.000Z',
    // leap day
    '2024-02-29T12:34:56.789Z',
    // year boundary
    '2025-12-31T23:59:59.999Z',
    '2026-01-01T00:00:00.000Z',
    // millisecond padding
    '2026-07-15T23:59:58.007Z',
    '2026-07-15T23:59:58.070Z',
    '2026-07-15T23:59:58.700Z',
    // Date instances and epoch numbers (both go through `new Date(String(value))`)
    new Date('2026-05-04T05:06:07.008Z'),
    1770000000000,
    // unparsable / empty values fall back to moment
    '',
    'not-a-date',
    null,
    undefined,
];

describe('formatMomentByTimezone byte compatibility', () => {
    // 解析失败的输入会回落到 moment().format(pattern)，而 moment 的 locale 是模块级全局状态。
    // 固定成 en + UTC，避免与其他测试文件共享 worker 进程时出现偶发不一致。
    beforeAll(() => {
        moment.locale('en');
        moment.tz?.setDefault('UTC');
    });

    it('matches the previous formatToParts implementation for every timezone/pattern', () => {
        const mismatches: string[] = [];

        TIMEZONES.forEach((timezone) => {
            VALUES.forEach((value) => {
                [TIMESTAMP_PATTERN, DATE_PATTERN].forEach((pattern) => {
                    const expected = legacyFormatMomentByTimezone(
                        value,
                        pattern,
                        timezone,
                    );
                    const actual = formatMomentByTimezone(
                        value,
                        pattern,
                        timezone,
                    );
                    if (expected !== actual) {
                        mismatches.push(
                            `tz=${timezone} pattern=${pattern} value=${String(
                                value,
                            )} expected=${JSON.stringify(
                                expected,
                            )} actual=${JSON.stringify(actual)}`,
                        );
                    }
                });
            });
        });

        expect(mismatches).toEqual([]);
    });

    it('keeps the moment fallback when no timezone is configured', () => {
        const values = [
            '2026-01-02T16:00:00.000Z',
            '2026-11-01T05:30:00.000Z',
            '2024-02-29T12:34:56.789Z',
        ];

        values.forEach((value) => {
            [TIMESTAMP_PATTERN, DATE_PATTERN].forEach((pattern) => {
                expect(formatMomentByTimezone(value, pattern, undefined)).toBe(
                    legacyFormatMomentByTimezone(value, pattern, undefined),
                );
                expect(formatMomentByTimezone(value, pattern, '')).toBe(
                    legacyFormatMomentByTimezone(value, pattern, ''),
                );
            });
        });
    });

    it('is stable across repeated calls', () => {
        const first = formatMomentByTimezone(
            '2026-01-02T16:00:00.000Z',
            TIMESTAMP_PATTERN,
            'Asia/Shanghai',
        );
        for (let i = 0; i < 1000; i += 1) {
            expect(
                formatMomentByTimezone(
                    '2026-01-02T16:00:00.000Z',
                    TIMESTAMP_PATTERN,
                    'Asia/Shanghai',
                ),
            ).toBe(first);
        }
        // 2026-01-03 00:00:00.000 in Asia/Shanghai
        expect(first).toBe('2026-01-03 00:00:00.000');
    });
});

/**
 * Run with `BENCH=1 TZ=UTC pnpm -F backend exec jest --config jest.config.js src/utils/FileDownloadUtils/formatMomentByTimezone.test.ts`.
 */
const describeBench = process.env.BENCH === '1' ? describe : describe.skip;

describeBench('formatMomentByTimezone benchmark', () => {
    const cells = 100_000;
    const value = '2026-01-02T16:00:00.000Z';

    const measure = (fn: (v: unknown, p: string, tz?: string) => string) => {
        for (let i = 0; i < 5_000; i += 1) fn(value, TIMESTAMP_PATTERN, 'Asia/Shanghai');
        const start = process.hrtime.bigint();
        for (let i = 0; i < cells; i += 1) fn(value, TIMESTAMP_PATTERN, 'Asia/Shanghai');
        return Number(process.hrtime.bigint() - start) / 1e3 / cells;
    };

    it('prints µs/cell for legacy vs cached', () => {
        const legacy = measure(legacyFormatMomentByTimezone);
        const current = measure(formatMomentByTimezone);
        // eslint-disable-next-line no-console
        console.log(
            `timestamp cell legacy=${legacy.toFixed(2)}µs cached=${current.toFixed(2)}µs speedup=${(legacy / current).toFixed(1)}x  1M cells: ${legacy.toFixed(0)}s -> ${current.toFixed(0)}s`,
        );
        // No assertion on timings: benchmarks are informational and must not make CI flaky.
        expect(Number.isFinite(current)).toBe(true);
    });
});

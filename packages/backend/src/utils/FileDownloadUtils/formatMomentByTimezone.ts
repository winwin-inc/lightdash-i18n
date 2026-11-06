import { type AnyType } from '@lightdash/common';
import moment from 'moment/moment';
import Logger from '../../logging/logger';

/**
 * Formatting a single DATE/TIMESTAMP cell with a custom `Intl.DateTimeFormat` instance
 * costs ~50-60µs, because the ICU formatter is built from scratch on every call.
 * Large exports (hundreds of thousands of rows x several date columns) spend most of
 * their CPU here, so we cache one formatter per timezone.
 *
 * The output must stay byte-identical to the previous implementation, which joined
 * `formatToParts` results of a `sv-SE` formatter. Different ICU versions can render
 * separators or the midnight hour differently, so we verify the `format()` output
 * against the `formatToParts()` output once per timezone and fall back to the
 * (slower but always faithful) parts join when they disagree.
 */
const TIMEZONE_FORMATTER_CACHE_LIMIT = 32;

type TimezoneFormatters = {
    date: Intl.DateTimeFormat;
    dateTime: Intl.DateTimeFormat;
    /** `format()` matches the legacy `formatToParts()` join for this timezone */
    canUseFastPath: boolean;
};

const timezoneFormatters = new Map<string, TimezoneFormatters>();

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    // `hour12: false` alone can resolve to h24 in some ICU builds, which renders
    // midnight as 24:00 instead of 00:00.
    hourCycle: 'h23',
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
};

const joinParts = (
    formatter: Intl.DateTimeFormat,
    date: Date,
): Record<string, string> => {
    const lookup: Record<string, string> = {};
    formatter.formatToParts(date).forEach((part) => {
        lookup[part.type] = part.value;
    });
    return lookup;
};

const buildFormatters = (timeZone: string): TimezoneFormatters => {
    const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone,
        ...DATE_TIME_OPTIONS,
    });
    const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone,
        ...DATE_OPTIONS,
    });

    // Self check: compare against the legacy output on a handful of instants
    // (midnight, month boundary, leap day, DST boundary in the northern hemisphere).
    const probes = [
        new Date('2024-02-29T16:00:00.000Z'),
        new Date('2026-01-02T16:00:00.000Z'),
        new Date('2026-03-08T07:30:00.000Z'),
        new Date('2026-07-15T23:59:58.123Z'),
    ];
    const canUseFastPath = probes.every((probe) => {
        const parts = joinParts(dateTimeFormatter, probe);
        const legacy = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
        const modern = dateTimeFormatter.format(probe);
        const partsDate = joinParts(dateFormatter, probe);
        const legacyDate = `${partsDate.year}-${partsDate.month}-${partsDate.day}`;
        const modernDate = dateFormatter.format(probe);
        return legacy === modern && legacyDate === modernDate;
    });

    if (!canUseFastPath) {
        Logger.warn(
            `Intl.DateTimeFormat output for timezone "${timeZone}" differs from the formatToParts fallback; using the slower fallback to keep exports byte-identical`,
        );
    }

    return { date: dateFormatter, dateTime: dateTimeFormatter, canUseFastPath };
};

const getFormatters = (timeZone: string): TimezoneFormatters => {
    const cached = timezoneFormatters.get(timeZone);
    if (cached) return cached;

    const formatters = buildFormatters(timeZone);
    if (timezoneFormatters.size >= TIMEZONE_FORMATTER_CACHE_LIMIT) {
        timezoneFormatters.clear();
    }
    timezoneFormatters.set(timeZone, formatters);
    return formatters;
};

/**
 * Formats a raw DATE / TIMESTAMP value for CSV & XLSX exports.
 *
 * - with `displayTimezone`: renders the value in that timezone. `YYYY-MM-DD` renders a
 *   date only, anything else renders `YYYY-MM-DD HH:mm:ss.SSS`.
 * - without `displayTimezone` (or with an unparsable value): falls back to moment, which
 *   is the behaviour of the legacy export paths.
 */
export const formatMomentByTimezone = (
    value: AnyType,
    pattern: string,
    displayTimezone?: string,
): string => {
    if (displayTimezone) {
        const date = new Date(String(value));
        if (!Number.isNaN(date.getTime())) {
            const formatters = getFormatters(displayTimezone);

            if (pattern === 'YYYY-MM-DD') {
                if (formatters.canUseFastPath) {
                    return formatters.date.format(date);
                }
                const parts = joinParts(formatters.date, date);
                return `${parts.year}-${parts.month}-${parts.day}`;
            }

            const milliseconds = String(date.getUTCMilliseconds()).padStart(
                3,
                '0',
            );

            if (formatters.canUseFastPath) {
                return `${formatters.dateTime.format(date)}.${milliseconds}`;
            }

            const parts = joinParts(formatters.dateTime, date);
            return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}`;
        }
    }
    return moment(value).format(pattern);
};

export default formatMomentByTimezone;

import cronstrue from 'cronstrue';
// Side-effect import so zh_CN locale is registered for cronstrue.toString
import 'cronstrue/locales/zh_CN';
import { getArrayValue } from './accessors';

export type SchedulerCronLocale = 'zh' | 'en';

export function normalizeSchedulerCronLocale(
    value: string | null | undefined,
): SchedulerCronLocale {
    if (!value) return 'zh';
    return value.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getTzMinutesOffset(oldTz: string, newTz: string) {
    const date = new Date();
    const oldFormattedString = date.toLocaleString('en-US', {
        timeZone: oldTz,
    });
    const newFormattedString = date.toLocaleString('en-US', {
        timeZone: newTz,
    });
    const dateInOldZone = new Date(oldFormattedString);
    const dateInNewZone = new Date(newFormattedString);
    return Math.round(
        (dateInNewZone.getTime() - dateInOldZone.getTime()) / (1000 * 60),
    );
}

export function formatMinutesOffset(offsetMins: number) {
    const sign = offsetMins >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMins);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes).padStart(2, '0');
    return `${sign}${paddedHours}:${paddedMinutes}`;
}

export function getTimezoneLabel(timezone: string | undefined) {
    if (timezone === undefined) return undefined;

    const minsOffset = getTzMinutesOffset('UTC', timezone);
    const offsetString = formatMinutesOffset(minsOffset);
    const keyWithNoUnderscores = timezone.replaceAll('_', ' ');

    const labelText =
        timezone === 'UTC'
            ? keyWithNoUnderscores
            : `(UTC ${offsetString}) ${keyWithNoUnderscores}`;
    return labelText;
}

export function getHumanReadableCronExpression(
    cronExpression: string,
    timezone: string,
    locale: string | null | undefined = 'zh',
) {
    const resolved = normalizeSchedulerCronLocale(locale);
    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
        locale: resolved === 'zh' ? 'zh_CN' : 'en',
    });

    const minsOffset = getTzMinutesOffset('UTC', timezone);
    const offsetString = formatMinutesOffset(minsOffset);

    // English cronstrue uses AM/PM; Chinese uses 上午/下午 — only rewrite English markers.
    const valueWithTimezone =
        resolved === 'en'
            ? value
                  .replaceAll(' PM', ` PM (UTC ${offsetString})`)
                  .replaceAll(' AM', ` AM (UTC ${offsetString})`)
            : `${value} (UTC ${offsetString})`;

    if (resolved === 'zh') {
        return valueWithTimezone;
    }

    return (
        getArrayValue(valueWithTimezone, 0).toLowerCase() +
        valueWithTimezone.slice(1)
    );
}

export function isValidFrequency(cronExpression: string): boolean {
    /** This function will return False if:
     * - the cronExpression is not valid (not 5 parts separated by spaces)
     * - the cronExpression frequency is less than 1 hour
     */
    const cronParts = cronExpression.trim().split(' ');
    if (cronParts.length !== 5) {
        // Invalid cron expression
        return false;
    }
    const [minutePart] = cronParts;
    if (minutePart === undefined) {
        return false;
    }
    if (
        minutePart.includes('/') ||
        minutePart.includes(',') ||
        minutePart.includes('-')
    ) {
        // We don't care about the values in the intervals
        return false;
    }
    if (minutePart === '*') {
        // Every minute case
        return false;
    }

    return true;
}

export function isValidTimezone(timezone: string | undefined): boolean {
    if (timezone === undefined) return true;

    try {
        Intl.DateTimeFormat('en-US', { timeZone: timezone });
        return true;
    } catch (e) {
        return false;
    }
}

import { type Account } from '../types/auth';
import { ParameterError } from '../types/errors';
import { type MetricQuery } from '../types/metricQuery';
import {
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '../types/timezone';
import { isValidTimezone } from './scheduler';

/**
 * Returns the account's stored user-level timezone preference, or null for
 * anonymous viewers (embeds / JWT) who have no profile.
 */
export function getAccountUserTimezone(account: Account): string | null {
    if (account.user.type !== 'registered') {
        return null;
    }
    return account.user.timezone ?? null;
}

/**
 * Resolves the effective timezone for a query.
 * Whether the resolved zone is applied is gated by EnableTimezoneSupport.
 */
export function resolveQueryTimezone({
    sessionTimezone,
    metricQuery,
    projectTimezone,
    userTimezone,
}: {
    sessionTimezone: string | null;
    metricQuery: Pick<MetricQuery, 'timezone'>;
    projectTimezone: string;
    userTimezone: string | null;
}): string {
    const setting = metricQuery.timezone;

    let timezone: string;
    if (sessionTimezone) {
        timezone = sessionTimezone;
    } else if (setting === USER_TIMEZONE_SETTING) {
        timezone = userTimezone ?? projectTimezone;
    } else if (!setting || setting === PROJECT_TIMEZONE_SETTING) {
        timezone = projectTimezone;
    } else {
        timezone = setting;
    }

    if (!isValidTimezone(timezone)) {
        throw new ParameterError(`Invalid timezone: ${timezone}`);
    }

    return timezone;
}

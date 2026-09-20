import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType, type TimestampDomain } from '../types/field';

/**
 * Per-warehouse SQL for the DATE_TRUNC timezone round-trip.
 * `toProjectTz` shifts into project-local wall-clock before truncation;
 * `toUTC` converts the truncated value back into a proper UTC instant.
 */
type DateTruncTimezoneConversion = {
    toProjectTz: (sql: string, tz: string, sourceTimezone?: string) => string;
    toProjectTzFromInstant: (instantSql: string, tz: string) => string;
    toUTC: (sql: string, tz: string) => string;
    castAsDate: (sql: string, tz: string) => string;
    castToInstant: (sql: string) => string;
    castNaiveToInstant: ((sql: string, z: string) => string) | null;
    castNaiveAggregateToInstant: ((sql: string, z: string) => string) | null;
    castAwareToInstant: ((sql: string) => string) | null;
    freezeInstantOutput: ((sql: string) => string) | null;
};

const bigqueryCastToInstant = (sql: string) => `TIMESTAMP(${sql})`;
const postgresLikeCastToInstant = (sql: string) => `(${sql})::timestamptz`;
const clickhouseCastToInstant = (sql: string) => `toTimeZone(${sql}, 'UTC')`;
const identityCastToInstant = (sql: string) => sql;

const bigqueryCastNaiveToInstant = (sql: string, z: string) =>
    `TIMESTAMP(${sql}, '${z}')`;
const snowflakeCastNaiveToInstant = (sql: string, z: string) =>
    `CONVERT_TIMEZONE('${z}', 'UTC', ${sql})`;
const postgresLikeCastNaiveToInstant = (sql: string, z: string) =>
    `((${sql}) AT TIME ZONE '${z}')`;
const databricksCastNaiveToInstant = (sql: string, z: string) =>
    `CAST(to_utc_timestamp(${sql}, '${z}') AS TIMESTAMP_NTZ)`;
const databricksCastAwareToInstant = (sql: string) =>
    `CAST(to_utc_timestamp(${sql}, current_timezone()) AS TIMESTAMP_NTZ)`;
const databricksFreezeInstantOutput = (sql: string) =>
    `CAST(${sql} AS TIMESTAMP_NTZ)`;
const trinoCastNaiveToInstant = (sql: string, z: string) =>
    `CAST(with_timezone(${sql}, '${z}') AT TIME ZONE 'UTC' AS timestamp)`;

const bigqueryToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `DATETIME(${instantSql}, '${tz}')`;
const postgresLikeToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `${instantSql} AT TIME ZONE '${tz}'`;
const databricksToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `from_utc_timestamp(${instantSql}, '${tz}')`;
const trinoToProjectTz = (sql: string, tz: string) =>
    `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`;
const trinoToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `CAST(with_timezone(${instantSql}, 'UTC') AT TIME ZONE '${tz}' AS timestamp)`;

export const dateTruncTimezoneConversions: Record<
    SupportedDbtAdapter,
    DateTruncTimezoneConversion
> = {
    [SupportedDbtAdapter.BIGQUERY]: {
        toProjectTz: (sql, tz) =>
            bigqueryToProjectTzFromInstant(bigqueryCastToInstant(sql), tz),
        toProjectTzFromInstant: bigqueryToProjectTzFromInstant,
        toUTC: (sql, tz) => `TIMESTAMP(${sql}, '${tz}')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: bigqueryCastToInstant,
        castNaiveToInstant: bigqueryCastNaiveToInstant,
        castNaiveAggregateToInstant: bigqueryCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        toProjectTz: (sql, tz, sourceTimezone = 'UTC') =>
            `CONVERT_TIMEZONE('${sourceTimezone}', '${tz}', ${sql})`,
        toProjectTzFromInstant: (sql, tz) =>
            `CONVERT_TIMEZONE('UTC', '${tz}', ${sql})`,
        toUTC: (sql, tz) => `CONVERT_TIMEZONE('${tz}', 'UTC', ${sql})`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: null,
        castNaiveAggregateToInstant: snowflakeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.POSTGRES]: {
        toProjectTz: (sql, tz) =>
            postgresLikeToProjectTzFromInstant(
                postgresLikeCastToInstant(sql),
                tz,
            ),
        toProjectTzFromInstant: postgresLikeToProjectTzFromInstant,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: postgresLikeCastToInstant,
        castNaiveToInstant: postgresLikeCastNaiveToInstant,
        castNaiveAggregateToInstant: postgresLikeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        toProjectTz: (sql, tz) =>
            postgresLikeToProjectTzFromInstant(
                postgresLikeCastToInstant(sql),
                tz,
            ),
        toProjectTzFromInstant: postgresLikeToProjectTzFromInstant,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: postgresLikeCastToInstant,
        castNaiveToInstant: postgresLikeCastNaiveToInstant,
        castNaiveAggregateToInstant: postgresLikeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.DATABRICKS]: {
        toProjectTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toProjectTzFromInstant: databricksToProjectTzFromInstant,
        toUTC: (sql, tz) => `to_utc_timestamp(${sql}, '${tz}')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: databricksCastNaiveToInstant,
        castNaiveAggregateToInstant: databricksCastNaiveToInstant,
        castAwareToInstant: databricksCastAwareToInstant,
        freezeInstantOutput: databricksFreezeInstantOutput,
    },
    [SupportedDbtAdapter.TRINO]: {
        toProjectTz: (sql, tz) => trinoToProjectTz(sql, tz),
        toProjectTzFromInstant: trinoToProjectTzFromInstant,
        toUTC: (sql, tz) =>
            `CAST(with_timezone(${sql}, '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: trinoCastNaiveToInstant,
        castNaiveAggregateToInstant: trinoCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.CLICKHOUSE]: {
        toProjectTz: (sql, tz) =>
            `toDateTime64(formatDateTime(toTimeZone(${sql}, '${tz}'), '%Y-%m-%d %H:%i:%S.%f'), 3, 'UTC')`,
        toProjectTzFromInstant: (sql, tz) =>
            `toDateTime64(formatDateTime(toTimeZone(${sql}, '${tz}'), '%Y-%m-%d %H:%i:%S.%f'), 3, 'UTC')`,
        toUTC: (sql, tz) =>
            `toTimeZone(toDateTime64(formatDateTime(${sql}, '%Y-%m-%d %H:%i:%S.%f'), 3, '${tz}'), 'UTC')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: clickhouseCastToInstant,
        castNaiveToInstant: null,
        castNaiveAggregateToInstant: null,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
};

const equalZonesSkipAdapters: ReadonlySet<SupportedDbtAdapter> = new Set([
    SupportedDbtAdapter.DATABRICKS,
    SupportedDbtAdapter.TRINO,
]);

export const isTimezoneRoundTripNoOp = (
    adapterType: SupportedDbtAdapter,
    timezone: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): boolean => {
    const source = sourceTimezone ?? 'UTC';
    if (
        timestampDomain === 'naive' &&
        dateTruncTimezoneConversions[adapterType].castNaiveToInstant !== null
    ) {
        return timezone === 'UTC' && source === 'UTC';
    }
    if (equalZonesSkipAdapters.has(adapterType)) return timezone === source;
    return timezone === 'UTC' && source === 'UTC';
};

export const resolveTimezoneWrap = (
    adapterType: SupportedDbtAdapter,
    type: DimensionType,
    timezone?: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): {
    timezone: string;
    sourceTimezone?: string;
    timestampDomain?: TimestampDomain;
} | null => {
    if (type !== DimensionType.TIMESTAMP || !timezone) return null;
    if (
        isTimezoneRoundTripNoOp(
            adapterType,
            timezone,
            sourceTimezone,
            timestampDomain,
        )
    ) {
        return null;
    }
    return { timezone, sourceTimezone, timestampDomain };
};

// EXTRACT returns a number/string, so no `toUTC` inverse — one-way shift only.
type DateExtractTimezoneConversion = {
    toExtractInputTz: (
        sql: string,
        tz: string,
        sourceTimezone?: string,
    ) => string;
    toExtractInputTzFromInstant: (instantSql: string, tz: string) => string;
};

export const dateExtractsTimezoneConversions: Record<
    SupportedDbtAdapter,
    DateExtractTimezoneConversion
> = {
    [SupportedDbtAdapter.BIGQUERY]: {
        toExtractInputTz: (sql, tz) => `TIMESTAMP(${sql}) AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: (sql, tz) => `${sql} AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        toExtractInputTz: (sql, tz, sourceTimezone = 'UTC') =>
            `CONVERT_TIMEZONE('${sourceTimezone}', '${tz}', ${sql})`,
        toExtractInputTzFromInstant: (sql, tz) =>
            `CONVERT_TIMEZONE('UTC', '${tz}', ${sql})`,
    },
    [SupportedDbtAdapter.POSTGRES]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: postgresLikeToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: postgresLikeToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.DATABRICKS]: {
        toExtractInputTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toExtractInputTzFromInstant: databricksToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.TRINO]: {
        toExtractInputTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
        toExtractInputTzFromInstant: trinoToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.CLICKHOUSE]: {
        toExtractInputTz: (sql, tz) => `toTimeZone(${sql}, '${tz}')`,
        toExtractInputTzFromInstant: (sql, tz) => `toTimeZone(${sql}, '${tz}')`,
    },
};

/** Shift an EXTRACT/format input into the project zone. */
export const getExtractInputTzSql = (
    adapterType: SupportedDbtAdapter,
    originalSql: string,
    timezone: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): string => {
    const { castNaiveToInstant } = dateTruncTimezoneConversions[adapterType];
    if (timestampDomain === 'naive' && castNaiveToInstant) {
        return dateExtractsTimezoneConversions[
            adapterType
        ].toExtractInputTzFromInstant(
            castNaiveToInstant(originalSql, sourceTimezone ?? 'UTC'),
            timezone,
        );
    }
    return dateExtractsTimezoneConversions[adapterType].toExtractInputTz(
        originalSql,
        timezone,
        sourceTimezone,
    );
};

/**
 * Apply timezone round-trip around a warehouse DATE_TRUNC expression.
 * Input `truncate` receives SQL already shifted into the project timezone.
 */
export const wrapTruncatedDateWithTimezone = ({
    adapterType,
    originalSql,
    timezone,
    sourceTimezone,
    timestampDomain,
    truncate,
    castDayOrCoarserToDate,
}: {
    adapterType: SupportedDbtAdapter;
    originalSql: string;
    timezone: string;
    sourceTimezone?: string;
    timestampDomain?: TimestampDomain;
    truncate: (inputSql: string) => string;
    castDayOrCoarserToDate: boolean;
}): string => {
    const {
        toProjectTz,
        toProjectTzFromInstant,
        toUTC,
        castAsDate,
        castNaiveToInstant,
        castAwareToInstant,
        freezeInstantOutput,
    } = dateTruncTimezoneConversions[adapterType];

    let explicitInstant: string | null = null;
    if (timestampDomain === 'naive' && castNaiveToInstant) {
        explicitInstant = castNaiveToInstant(
            originalSql,
            sourceTimezone ?? 'UTC',
        );
    } else if (timestampDomain === 'aware' && castAwareToInstant) {
        explicitInstant = castAwareToInstant(originalSql);
    }

    const input =
        explicitInstant !== null
            ? toProjectTzFromInstant(explicitInstant, timezone)
            : toProjectTz(originalSql, timezone, sourceTimezone);

    const truncated = truncate(input);

    if (castDayOrCoarserToDate) {
        return castAsDate(truncated, timezone);
    }

    const output = toUTC(truncated, timezone);
    return explicitInstant !== null && freezeInstantOutput
        ? freezeInstantOutput(output)
        : output;
};

import moment from 'moment-timezone';
import { SupportedDbtAdapter } from '../types/dbt';
import { CompileError } from '../types/errors';
import {
    CustomFormatType,
    DimensionType,
    MetricType,
    TableCalculationType,
    isCompiledCustomSqlDimension,
    isMetric,
    type CompiledCustomSqlDimension,
    type CompiledField,
    type TableCalculation,
} from '../types/field';
import {
    FilterOperator,
    UnitOfTime,
    isFilterTarget,
    isMetricFilterTarget,
    resolveDateRangeValuesAsDates,
    unitOfTimeFormat,
    type DateFilterRule,
    type FilterRule,
} from '../types/filter';
import { TimeFrames } from '../types/timeFrames';
import assertUnreachable from '../utils/assertUnreachable';
import { convertToBooleanValue } from '../utils/booleanConverter';
import { formatDate } from '../utils/formatting';
import { getItemId } from '../utils/item';
import { getMomentDateWithCustomStartOfWeek } from '../utils/time';
import { type WeekDay } from '../utils/timeFrames';

// NOTE: This function requires a complete date as input.
// It produces a timezoneless string which is implied to be in UTC.
// We could probably have it be a string WITH a timezone in the future.
// Calling .utc() here makes it safe to drop the tz.
const formatTimestampAsUTCWithNoTimezone = (date: Date): string =>
    moment(date).utc().format('YYYY-MM-DD HH:mm:ss');

const raiseInvalidFilterError = (
    type: string,
    filter: FilterRule<FilterOperator, unknown>,
): never => {
    let targetString = '';

    if (isMetricFilterTarget(filter.target)) {
        targetString = ` on "${filter.target.fieldRef}" field`;
    } else if (isFilterTarget(filter.target)) {
        targetString = ` on "${filter.target.fieldId}" field`;
    }

    throw new CompileError(
        `No function has been implemented to render SQL for the filter operator "${filter.operator}"${targetString} of type "${type}"`,
    );
};

export const renderStringFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
    stringQuoteChar: string,
): string => {
    const nonEmptyFilterValues = filter.values?.filter((v) => v !== '');

    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return filter.values && filter.values.length > 0
                ? `(${dimensionSql}) IN (${filter.values
                      .map((v) => `${stringQuoteChar}${v}${stringQuoteChar}`)
                      .join(',')})`
                : 'true';
        case FilterOperator.NOT_EQUALS:
            return filter.values && filter.values.length > 0
                ? `((${dimensionSql}) NOT IN (${filter.values
                      .map((v) => `${stringQuoteChar}${v}${stringQuoteChar}`)
                      .join(',')}) OR (${dimensionSql}) IS NULL)`
                : 'true';
        case FilterOperator.INCLUDE:
            if (nonEmptyFilterValues && nonEmptyFilterValues.length > 0) {
                const includesQuery = nonEmptyFilterValues.map(
                    (v) => `LOWER(${dimensionSql}) LIKE LOWER('%${v}%')`,
                );
                if (includesQuery.length > 1)
                    return `(${includesQuery.join('\n  OR\n  ')})`;
                return includesQuery.join('\n  OR\n  ');
            }
            return 'true';
        case FilterOperator.NOT_INCLUDE:
            if (nonEmptyFilterValues && nonEmptyFilterValues.length > 0) {
                const notIncludeQuery = nonEmptyFilterValues.map(
                    (v) => `LOWER(${dimensionSql}) NOT LIKE LOWER('%${v}%')`,
                );
                return notIncludeQuery.join('\n  AND\n  ');
            }
            return 'true';
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.STARTS_WITH:
            const startWithQuery = nonEmptyFilterValues?.map(
                (v) =>
                    `(${dimensionSql}) LIKE ${stringQuoteChar}${v}%${stringQuoteChar}`,
            );
            return startWithQuery?.join('\n  OR\n  ') || 'true';
        case FilterOperator.ENDS_WITH:
            const endsWithQuery = nonEmptyFilterValues?.map(
                (v) =>
                    `(${dimensionSql}) LIKE ${stringQuoteChar}%${v}${stringQuoteChar}`,
            );
            return endsWithQuery?.join('\n  OR\n  ') || 'true';
        default:
            return raiseInvalidFilterError('string', filter);
    }
};

// Validate that all values are valid numbers
const validateAndSanitizeNumber = (value: unknown): number => {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
        throw new CompileError(
            `Invalid number value in filter: "${value}". Expected a valid number.`,
        );
    }
    return num;
};

const isValidNumberFilterValue = <FilterType>(
    values: FilterType[] | undefined,
): values is FilterType[] => !!values && values.length > 0;

export const renderNumberFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
): string => {
    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) IN (${filter.values
                      .map(validateAndSanitizeNumber)
                      .join(',')})`
                : 'true';
        case FilterOperator.NOT_EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `((${dimensionSql}) NOT IN (${filter.values
                      .map(validateAndSanitizeNumber)
                      .join(',')}) OR (${dimensionSql}) IS NULL)`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.GREATER_THAN:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) > (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) >= (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.LESS_THAN:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) < (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) <= (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.IN_BETWEEN:
            return !isValidNumberFilterValue(filter.values) ||
                filter.values.length < 2
                ? 'true'
                : `(${dimensionSql}) >= (${validateAndSanitizeNumber(
                      filter.values[0],
                  )}) AND (${dimensionSql}) <= (${validateAndSanitizeNumber(
                      filter.values[1],
                  )})`;
        case FilterOperator.NOT_IN_BETWEEN:
            return !isValidNumberFilterValue(filter.values) ||
                filter.values.length < 2
                ? 'true'
                : `(${dimensionSql}) < (${validateAndSanitizeNumber(
                      filter.values[0],
                  )}) OR (${dimensionSql}) > (${validateAndSanitizeNumber(
                      filter.values[1],
                  )})`;
        default:
            return raiseInvalidFilterError('number', filter);
    }
};

export const renderDateFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    adapterType: SupportedDbtAdapter,
    timezone: string,
    dateFormatter: (date: Date) => string = formatDate,
    startOfWeek: WeekDay | null | undefined = undefined,
    /**
     * Optional raw SQL for upper bound of FROM_START_TO_LATEST_MONTH
     * (typically `SELECT MAX(...) FROM table AS alias`).
     * When omitted, falls back to filter.values[1] if present.
     */
    latestDataMonthMaxSql: string | undefined = undefined,
): string => {
    const castValue = (value: string): string => {
        switch (adapterType) {
            case SupportedDbtAdapter.TRINO: {
                return `CAST('${value}' AS timestamp)`;
            }
            default:
                return `('${value}')`;
        }
    };

    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return `(${dimensionSql}) = ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.NOT_EQUALS:
            return `((${dimensionSql}) != ${castValue(
                dateFormatter(filter.values?.[0]),
            )} OR (${dimensionSql}) IS NULL)`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.GREATER_THAN:
            return `(${dimensionSql}) > ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return `(${dimensionSql}) >= ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.LESS_THAN:
            return `(${dimensionSql}) < ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return `(${dimensionSql}) <= ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_PAST: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;
            const not =
                filter.operator === FilterOperator.NOT_IN_THE_PAST
                    ? 'NOT '
                    : '';

            if (completed) {
                const completedDate = moment(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .startOf(unitOfTime)
                        .format(unitOfTimeFormat[unitOfTime]),
                ).toDate();
                const untilDate = dateFormatter(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .startOf(unitOfTime)
                        .toDate(),
                );
                return `${not}((${dimensionSql}) >= ${castValue(
                    dateFormatter(
                        getMomentDateWithCustomStartOfWeek(
                            startOfWeek,
                            completedDate,
                        )
                            .subtract(filter.values?.[0], unitOfTime)
                            .toDate(),
                    ),
                )} AND (${dimensionSql}) < ${castValue(untilDate)})`;
            }
            const untilDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek).toDate(),
            );
            return `${not}((${dimensionSql}) >= ${castValue(
                dateFormatter(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .subtract(filter.values?.[0], unitOfTime)
                        .toDate(),
                ),
            )} AND (${dimensionSql}) <= ${castValue(untilDate)})`;
        }
        case FilterOperator.IN_THE_NEXT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;

            if (completed) {
                const fromDate = moment(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .add(1, unitOfTime)
                        .startOf(unitOfTime),
                ).toDate();
                const toDate = dateFormatter(
                    getMomentDateWithCustomStartOfWeek(startOfWeek, fromDate)
                        .add(filter.values?.[0], unitOfTime)
                        .toDate(),
                );
                return `((${dimensionSql}) >= ${castValue(
                    dateFormatter(fromDate),
                )} AND (${dimensionSql}) < ${castValue(toDate)})`;
            }
            const fromDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek).toDate(),
            );
            const toDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .add(filter.values?.[0], unitOfTime)
                    .toDate(),
            );
            return `((${dimensionSql}) >= ${castValue(
                fromDate,
            )} AND (${dimensionSql}) <= ${castValue(toDate)})`;
        }
        case FilterOperator.IN_THE_CURRENT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;

            const fromDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate(),
            );
            const untilDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .endOf(unitOfTime)
                    .utc()
                    .toDate(),
            );

            const castedFromDate = castValue(fromDate);
            const castedUntilDate = castValue(untilDate);

            return `((${dimensionSql}) >= ${castedFromDate} AND (${dimensionSql}) <= ${castedUntilDate})`;
        }
        case FilterOperator.NOT_IN_THE_CURRENT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;

            const fromDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate(),
            );
            const untilDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .endOf(unitOfTime)
                    .utc()
                    .toDate(),
            );

            const castedFromDate = castValue(fromDate);
            const castedUntilDate = castValue(untilDate);

            return `(NOT ((${dimensionSql}) >= ${castedFromDate} AND (${dimensionSql}) <= ${castedUntilDate}))`;
        }
        case FilterOperator.IN_BETWEEN: {
            // For dynamic ranges, resolve the values at query time so the
            // date defaults always reflect "now" rather than the values
            // captured at save time. The effective granularity (taken from
            // `dateRangeGranularity`) is used to align the resolved Date to
            // the period boundary so a "12 months ago" rule with month
            // granularity produces the start of the month.
            const [resolvedStart, resolvedEnd] =
                resolveDateRangeValuesAsDates(filter);
            const granularity =
                (filter as { dateRangeGranularity?: TimeFrames })
                    .dateRangeGranularity ?? TimeFrames.DAY;
            const alignStart = (d: Date): Date => {
                if (granularity === TimeFrames.MONTH)
                    return moment(d).startOf('month').toDate();
                if (granularity === TimeFrames.QUARTER)
                    return moment(d).startOf('quarter').toDate();
                if (granularity === TimeFrames.YEAR)
                    return moment(d).startOf('year').toDate();
                return d;
            };
            const alignEnd = (d: Date): Date => {
                if (granularity === TimeFrames.MONTH)
                    return moment(d).endOf('month').toDate();
                if (granularity === TimeFrames.QUARTER)
                    return moment(d).endOf('quarter').toDate();
                if (granularity === TimeFrames.YEAR)
                    return moment(d).endOf('year').toDate();
                return d;
            };
            const startDate =
                resolvedStart != null
                    ? dateFormatter(alignStart(resolvedStart))
                    : 'NaT';
            const endDate =
                resolvedEnd != null
                    ? dateFormatter(alignEnd(resolvedEnd))
                    : 'NaT';

            return `((${dimensionSql}) >= ${castValue(
                startDate,
            )} AND (${dimensionSql}) <= ${castValue(endDate)})`;
        }
        case FilterOperator.FROM_START_TO_LATEST_MONTH: {
            // Dynamic mode for FROM_START_TO_LATEST_MONTH resolves only the
            // start bound; the upper bound is provided separately via
            // `latestDataMonthMaxSql` (typically a MAX(field) subquery).
            const [resolvedStart] = resolveDateRangeValuesAsDates(filter);
            const granularity =
                (filter as { dateRangeGranularity?: TimeFrames })
                    .dateRangeGranularity ?? TimeFrames.MONTH;
            const alignStart = (d: Date): Date => {
                if (granularity === TimeFrames.YEAR)
                    return moment(d).startOf('year').toDate();
                if (granularity === TimeFrames.QUARTER)
                    return moment(d).startOf('quarter').toDate();
                return moment(d).startOf('month').toDate();
            };
            const startDate =
                resolvedStart != null
                    ? dateFormatter(alignStart(resolvedStart))
                    : dateFormatter(filter.values?.[0]);
            let endBound: string | undefined;
            if (latestDataMonthMaxSql) {
                endBound = `(${latestDataMonthMaxSql})`;
            } else if (filter.values?.[1] != null) {
                endBound = castValue(dateFormatter(filter.values[1]));
            }

            if (endBound === undefined) {
                throw new CompileError(
                    'Filter "fromStartToLatestMonth" requires a latest-data-month upper bound',
                );
            }

            return `((${dimensionSql}) >= ${castValue(
                startDate,
            )} AND (${dimensionSql}) <= ${endBound})`;
        }
        default:
            return raiseInvalidFilterError('date', filter);
    }
};

export const renderBooleanFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
): string => {
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${convertToBooleanValue(
                filter.values?.[0],
            )}`;
        case 'notEquals':
            return `((${dimensionSql}) != ${convertToBooleanValue(
                filter.values?.[0],
            )} OR (${dimensionSql}) IS NULL)`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        default:
            return raiseInvalidFilterError('boolean', filter);
    }
};

const escapeStringValuesOnFilterRule = (
    filterRule: FilterRule<FilterOperator, unknown>,
    escapeString: (string: string) => string,
): FilterRule<FilterOperator, unknown> => ({
    ...filterRule,
    values: filterRule.values?.map((v) =>
        typeof v === 'string'
            ? escapeString(v) // escape the string quote char
            : v,
    ),
});

export const renderTableCalculationFilterRuleSql = (
    filterRule: FilterRule<FilterOperator, unknown>,
    field: TableCalculation | undefined,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeString: (string: string) => string,
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
    timezone: string = 'UTC',
): string => {
    if (!field) return '1=1';

    const fieldSql = `${fieldQuoteChar}${getItemId(field)}${fieldQuoteChar}`;

    const escapedFilterRule = escapeStringValuesOnFilterRule(
        filterRule,
        escapeString,
    );

    // First we default to field.type
    // otherwise, we check the custom format for backwards compatibility
    switch (field.type) {
        case TableCalculationType.STRING:
            return renderStringFilterSql(
                fieldSql,
                escapedFilterRule,
                stringQuoteChar,
            );
        case TableCalculationType.DATE:
        case TableCalculationType.TIMESTAMP:
            return renderDateFilterSql(
                fieldSql,
                escapedFilterRule,
                adapterType,
                timezone,
                undefined,
                startOfWeek,
            );
        case TableCalculationType.NUMBER:
            return renderNumberFilterSql(fieldSql, escapedFilterRule);
        case TableCalculationType.BOOLEAN:
            return renderBooleanFilterSql(fieldSql, escapedFilterRule);
        default:
        // Do nothing here. This will try with format.type for backwards compatibility
    }

    switch (field.format?.type) {
        case CustomFormatType.PERCENT:
        case CustomFormatType.CURRENCY:
        case CustomFormatType.NUMBER: {
            return renderNumberFilterSql(fieldSql, escapedFilterRule);
        }
        default:
            return renderStringFilterSql(
                fieldSql,
                escapedFilterRule,
                stringQuoteChar,
            );
    }
};

export const renderFilterRuleSql = (
    filterRule: FilterRule<FilterOperator, unknown>,
    fieldType: DimensionType | MetricType,
    fieldSql: string,
    stringQuoteChar: string,
    escapeString: (string: string) => string,
    startOfWeek: WeekDay | null | undefined,
    adapterType: SupportedDbtAdapter,
    timezone: string = 'UTC',
    latestDataMonthMaxSql: string | undefined = undefined,
): string => {
    if (filterRule.disabled) {
        return `1=1`; // When filter is disabled, we want to return all rows
    }
    const escapedFilterRule = escapeStringValuesOnFilterRule(
        filterRule,
        escapeString,
    );

    switch (fieldType) {
        case DimensionType.STRING:
        case MetricType.STRING: {
            return renderStringFilterSql(
                fieldSql,
                escapedFilterRule,
                stringQuoteChar,
            );
        }
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL: {
            return renderNumberFilterSql(fieldSql, escapedFilterRule);
        }
        case DimensionType.DATE:
        case MetricType.DATE: {
            return renderDateFilterSql(
                fieldSql,
                escapedFilterRule,
                adapterType,
                timezone,
                undefined,
                startOfWeek,
                latestDataMonthMaxSql,
            );
        }
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP: {
            return renderDateFilterSql(
                fieldSql,
                escapedFilterRule,
                adapterType,
                timezone,
                formatTimestampAsUTCWithNoTimezone,
                startOfWeek,
                latestDataMonthMaxSql,
            );
        }
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN: {
            return renderBooleanFilterSql(fieldSql, escapedFilterRule);
        }
        default: {
            return assertUnreachable(
                fieldType,
                `No function implemented to render sql for filter group type ${fieldType}`,
            );
        }
    }
};

// To be used for filters with a field that is a dimension or metric
export const renderFilterRuleSqlFromField = (
    filterRule: FilterRule<FilterOperator, unknown>,
    field: CompiledField | CompiledCustomSqlDimension,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeString: (string: string) => string,
    startOfWeek: WeekDay | null | undefined,
    adapterType: SupportedDbtAdapter,
    timezone: string = 'UTC',
    latestDataMonthMaxSql: string | undefined = undefined,
): string => {
    const fieldType = isCompiledCustomSqlDimension(field)
        ? field.dimensionType
        : field.type;
    const fieldSql = isMetric(field)
        ? `${fieldQuoteChar}${getItemId(field)}${fieldQuoteChar}`
        : field.compiledSql;
    return renderFilterRuleSql(
        filterRule,
        fieldType,
        fieldSql,
        stringQuoteChar,
        escapeString,
        startOfWeek,
        adapterType,
        timezone,
        latestDataMonthMaxSql,
    );
};

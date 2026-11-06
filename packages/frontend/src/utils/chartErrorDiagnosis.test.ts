import { describe, expect, it } from 'vitest';

import {
    FilterOperator,
    MetricType,
    type ApiErrorDetail,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';

import { getChartErrorDiagnosis } from './chartErrorDiagnosis';

type DiagnosisErrorInput = Pick<
    ApiErrorDetail,
    'name' | 'statusCode' | 'message' | 'data'
>;

const makeError = (overrides: {
    name: string;
    message: string;
    statusCode?: number;
    data?: Record<string, unknown>;
}): DiagnosisErrorInput =>
    ({
        statusCode: 400,
        data: {},
        ...overrides,
    } as DiagnosisErrorInput);

const makeExplore = (options?: {
    dimensionIds?: string[];
    metricIds?: string[];
}) => {
    const dimensions = Object.fromEntries(
        (options?.dimensionIds ?? ['orders_status', 'orders_created_day']).map(
            (fieldId) => [
                fieldId.replace('orders_', ''),
                {
                    table: 'orders',
                    name: fieldId.replace('orders_', ''),
                    label: fieldId.replace('orders_', ''),
                    fieldType: 'dimension',
                },
            ],
        ),
    );
    const metrics = Object.fromEntries(
        (options?.metricIds ?? ['orders_revenue', 'orders_amount']).map(
            (fieldId) => [
                fieldId.replace('orders_', ''),
                {
                    table: 'orders',
                    name: fieldId.replace('orders_', ''),
                    label: fieldId.replace('orders_', ''),
                    fieldType: 'metric',
                },
            ],
        ),
    );
    return {
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: { name: 'orders', label: 'Orders', dimensions, metrics },
        },
        targetDatabase: 'postgres',
    } as unknown as Explore;
};

const makeMetricQuery = (
    overrides?: Partial<MetricQuery> & Record<string, unknown>,
): MetricQuery =>
    ({
        exploreName: 'orders',
        dimensions: ['orders_status', 'orders_created_day'],
        metrics: ['orders_revenue'],
        filters: {},
        sorts: [],
        limit: 10,
        tableCalculations: [],
        ...overrides,
    } as MetricQuery);

const QUERY_DIMENSION_MESSAGE =
    'Tried to reference dimension with unknown field id: orders_region';
const QUERY_METRIC_MESSAGE =
    'Tried to reference metric with unknown field id: orders_gone_metric';
const FILTER_MESSAGE =
    'Filter has a reference to an unknown dimension: orders_priority';
const TABLE_CALC_MESSAGE =
    'Table calculation contains a reference "orders_revenue" to a field or table calculation that isn\'t included in the query.';
const EXPLORE_COMPILER_MESSAGE =
    'Filter for metric "revenue" has a reference to an unknown dimension: orders_typo';

describe('getChartErrorDiagnosis', () => {
    it('attributes FieldReferenceError dimension field to the query', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: QUERY_DIMENSION_MESSAGE,
            }),
            metricQuery: makeMetricQuery({
                dimensions: ['orders_status', 'orders_region'],
            }),
            explore: makeExplore(),
        });

        expect(diagnosis.kind).toBe('field');
        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_region',
                label: null,
                group: 'dimension',
                origin: 'query',
            },
        ]);
    });

    it('attributes the unknown field to filters, sorts and dashboard sorts', () => {
        const base = {
            error: makeError({
                name: 'FieldReferenceError',
                message: QUERY_DIMENSION_MESSAGE,
            }),
            explore: null,
        };

        expect(
            getChartErrorDiagnosis({
                ...base,
                metricQuery: makeMetricQuery({
                    filters: {
                        dimensions: {
                            id: 'f-group',
                            and: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'orders_region' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['x'],
                                },
                            ],
                        },
                    },
                }),
            }).invalid,
        ).toEqual([
            {
                fieldId: 'orders_region',
                label: null,
                group: 'dimension',
                origin: 'filter',
            },
        ]);

        expect(
            getChartErrorDiagnosis({
                ...base,
                metricQuery: makeMetricQuery({
                    sorts: [{ fieldId: 'orders_region', descending: true }],
                }),
            }).invalid,
        ).toEqual([
            {
                fieldId: 'orders_region',
                label: null,
                group: 'dimension',
                origin: 'sort',
            },
        ]);

        expect(
            getChartErrorDiagnosis({
                ...base,
                metricQuery: makeMetricQuery(),
                dashboardSortFieldIds: ['orders_region'],
            }).invalid,
        ).toEqual([
            {
                fieldId: 'orders_region',
                label: null,
                group: 'dimension',
                origin: 'dashboardSort',
            },
        ]);

        expect(
            getChartErrorDiagnosis({
                ...base,
                metricQuery: makeMetricQuery(),
            }).invalid,
        ).toEqual([
            {
                fieldId: 'orders_region',
                label: null,
                group: 'dimension',
                origin: 'dateZoom',
            },
        ]);
    });

    it('attributes a filter-unknown dimension to dashboard filters', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: FILTER_MESSAGE,
            }),
            metricQuery: makeMetricQuery(),
            explore: null,
            dashboardFilterFieldIds: ['orders_priority'],
        });

        expect(diagnosis.kind).toBe('field');
        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_priority',
                label: null,
                group: 'dimension',
                origin: 'dashboardFilter',
            },
        ]);
    });

    it('marks a metric FieldReferenceError with metric group', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: QUERY_METRIC_MESSAGE,
            }),
            metricQuery: makeMetricQuery({
                metrics: ['orders_revenue', 'orders_gone_metric'],
            }),
            explore: makeExplore(),
        });

        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_gone_metric',
                label: null,
                group: 'metric',
                origin: 'query',
            },
        ]);
    });

    it('resolves the label for a table calculation reference', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'CompileError',
                message: TABLE_CALC_MESSAGE,
            }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore({ metricIds: ['orders_revenue'] }),
        });

        expect(diagnosis.kind).toBe('field');
        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_revenue',
                label: 'revenue',
                group: 'tableCalculation',
                origin: 'query',
            },
        ]);
    });

    it('returns unknown kind without fields for explore compiler errors', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'CompileError',
                message: EXPLORE_COMPILER_MESSAGE,
            }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore(),
        });

        expect(diagnosis.kind).toBe('unknown');
        expect(diagnosis.invalid).toEqual([]);
        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.declaredFieldIds).toEqual([
            'orders_status',
            'orders_created_day',
            'orders_revenue',
        ]);
    });

    it.each([
        { name: 'AuthorizationError', kind: 'permission' },
        { name: 'ForbiddenError', kind: 'permission' },
        { name: 'NotExistsError', kind: 'notFound' },
        { name: 'WarehouseQueryError', kind: 'warehouse' },
    ])('gates $name errors without any field diagnosis', ({ name, kind }) => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({ name, message: QUERY_DIMENSION_MESSAGE }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore(),
        });

        expect(diagnosis.kind).toBe(kind);
        expect(diagnosis.invalid).toEqual([]);
        expect(diagnosis.confident).toBe(false);
    });

    it('gates parameter errors by name or message', () => {
        const byName = getChartErrorDiagnosis({
            error: makeError({
                name: 'ParameterError',
                message: 'param x is required',
            }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore(),
        });
        expect(byName.kind).toBe('parameter');
        expect(byName.invalid).toEqual([]);

        const byMessage = getChartErrorDiagnosis({
            error: makeError({
                name: 'ChartSourceError',
                message: 'Missing required parameters: date_granularity',
            }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore(),
        });
        expect(byMessage.kind).toBe('parameter');
        expect(byMessage.invalid).toEqual([]);
    });

    it('treats unknown 500 errors as unknown kind', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'UnexpectedServerError',
                statusCode: 500,
                message: 'something exploded',
            }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore(),
        });

        expect(diagnosis.kind).toBe('unknown');
        expect(diagnosis.invalid).toEqual([]);
        expect(diagnosis.confident).toBe(false);
    });

    it('produces no fields and stays unconfident when explore is null', () => {
        const metricQuery = makeMetricQuery();
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: 'unrecognized compile failure',
            }),
            metricQuery,
            explore: null,
        });

        expect(diagnosis.kind).toBe('field');
        expect(diagnosis.invalid).toEqual([]);
        expect(diagnosis.confident).toBe(false);
        expect(diagnosis.declaredFieldIds).toEqual([
            'orders_status',
            'orders_created_day',
            'orders_revenue',
        ]);
    });

    it('prefers structured data.fieldId over message regexes', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: QUERY_METRIC_MESSAGE,
                data: { fieldId: 'orders_real_field' },
            }),
            metricQuery: makeMetricQuery(),
            explore: makeExplore(),
        });

        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_real_field',
                label: null,
                group: 'unknown',
                origin: 'dateZoom',
            },
        ]);
    });

    it('coerces numeric data.fieldId values to strings', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: QUERY_DIMENSION_MESSAGE,
                data: { fieldId: 42 },
            }),
            metricQuery: makeMetricQuery(),
            explore: null,
        });

        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.invalid.map((field) => field.fieldId)).toEqual(['42']);
    });

    it('still extracts the field from the message when metricQuery is undefined', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: QUERY_DIMENSION_MESSAGE,
            }),
            metricQuery: undefined,
            explore: null,
        });

        expect(diagnosis.kind).toBe('field');
        expect(diagnosis.confident).toBe(true);
        expect(diagnosis.declaredFieldIds).toEqual([]);
        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_region',
                label: null,
                group: 'dimension',
                origin: 'dateZoom',
            },
        ]);
    });

    it('adds structurally missing declared fields when explore is available', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: 'unrecognized compile failure',
            }),
            metricQuery: makeMetricQuery({
                metrics: ['orders_revenue', 'orders_dropped'],
            }),
            explore: makeExplore({ metricIds: ['orders_revenue'] }),
        });

        expect(diagnosis.kind).toBe('field');
        expect(diagnosis.confident).toBe(false);
        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'orders_dropped',
                label: null,
                group: 'metric',
                origin: 'query',
            },
        ]);
    });

    it('flags additional metrics whose parent table is gone with null label', () => {
        const diagnosis = getChartErrorDiagnosis({
            error: makeError({
                name: 'FieldReferenceError',
                message: 'unrecognized compile failure',
            }),
            metricQuery: makeMetricQuery({
                metrics: ['orders_revenue', 'am_extra'],
                additionalMetrics: [
                    {
                        name: 'am_extra',
                        table: 'table_that_is_gone',
                        type: MetricType.COUNT,
                        sql: 'count(*)',
                    },
                ],
            }),
            explore: makeExplore({ metricIds: ['orders_revenue'] }),
        });

        expect(diagnosis.confident).toBe(false);
        expect(diagnosis.invalid).toEqual([
            {
                fieldId: 'am_extra',
                label: null,
                group: 'metric',
                origin: 'query',
            },
        ]);
    });
});

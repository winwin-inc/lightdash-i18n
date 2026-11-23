import { type ItemsMap, type MetricQuery } from '../index';
import { DimensionType, FieldType, MetricType } from '../types/field';
import { type PivotData } from '../types/pivot';
import { VizAggregationOptions, VizIndexType } from '../visualizations/types';
import {
    convertSqlPivotedRowsToPivotData,
    pivotQueryResults,
    pivotResultsAsCsv,
    pivotResultsAsGrid,
} from './pivotQueryResults';
import {
    COMPLEX_NON_PIVOTED_ROWS,
    COMPLEX_SQL_PIVOTED_ROWS,
    COMPLEX_SQL_PIVOT_DETAILS,
    EXPECTED_COMPLEX_PIVOT_DATA,
    EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
    EXPECTED_PIVOT_DATA,
    EXPECTED_PIVOT_DATA_METRICS_AS_ROWS,
    EXPECTED_PIVOT_DATA_WITH_TOTALS,
    METRIC_QUERY_0DIM_2METRIC,
    METRIC_QUERY_1DIM_2METRIC,
    METRIC_QUERY_2DIM_2METRIC,
    NON_PIVOTED_ROWS,
    RESULT_ROWS_0DIM_2METRIC,
    RESULT_ROWS_1DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
    SQL_PIVOTED_ROWS,
    SQL_PIVOT_DETAILS,
    getFieldMock,
} from './pivotQueryResults.mock';

describe('Should pivot data', () => {
    it('with 1 dimension, pivoted, metrics as cols (everything on columns)', () => {
        const pivotConfig = {
            pivotDimensions: ['page'],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [
                { type: 'dimension', fieldId: 'page' },
                { type: 'metric' },
            ],
            headerValues: [
                [
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/home', raw: '/home' },
                        colSpan: 2,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/home', raw: '/home' },
                        colSpan: 0,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/about', raw: '/about' },
                        colSpan: 2,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/about', raw: '/about' },
                        colSpan: 0,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/first-post', raw: '/first-post' },
                        colSpan: 2,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/first-post', raw: '/first-post' },
                        colSpan: 0,
                    },
                ],
                [
                    { fieldId: 'views', type: 'label' },
                    { fieldId: 'devices', type: 'label' },
                    { fieldId: 'views', type: 'label' },
                    { fieldId: 'devices', type: 'label' },
                    { fieldId: 'views', type: 'label' },
                    { fieldId: 'devices', type: 'label' },
                ],
            ],
            indexValueTypes: [],
            indexValues: [],
            dataColumnCount: 6,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                    { raw: 12, formatted: '12.0' },
                    { raw: 0, formatted: '0.0' },
                    { raw: 11, formatted: '11.0' },
                    { raw: 1, formatted: '1.0' },
                ],
            ],

            rowTotalFields: undefined,
            rowTotals: undefined,
            rowsCount: 1,
            columnTotalFields: undefined,
            columnTotals: undefined,

            pivotConfig,
            titleFields: [[{ direction: 'header', fieldId: 'page' }], [null]],
            cellsCount: 7,
            retrofitData: {
                allCombinedData: [
                    {
                        page__views__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        page__devices__1: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        page__views__2: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        page__devices__3: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        page__views__4: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                        page__devices__5: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        baseId: 'views',
                        fieldId: 'page__views__0',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'page__devices__1',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'page__views__2',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'page__devices__3',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'page__views__4',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'page__devices__5',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toEqual(expected);
    });

    it('with 1 dimension, metrics as cols', () => {
        const pivotConfig = {
            pivotDimensions: [],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [{ type: 'metric' }],
            headerValues: [
                [
                    { type: 'label', fieldId: 'views' },
                    { type: 'label', fieldId: 'devices' },
                ],
            ],
            indexValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            indexValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/about',
                            formatted: '/about',
                        },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/first-post',
                            formatted: '/first-post',
                        },
                        colSpan: 1,
                    },
                ],
            ],
            dataColumnCount: 2,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                ],
                [
                    { raw: 12, formatted: '12.0' },
                    { raw: 0, formatted: '0.0' },
                ],
                [
                    { raw: 11, formatted: '11.0' },
                    { raw: 1, formatted: '1.0' },
                ],
            ],
            pivotConfig,
            titleFields: [[{ fieldId: 'page', direction: 'index' }]],
            cellsCount: 3,
            rowsCount: 3,
            retrofitData: {
                allCombinedData: [
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        views__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        devices__1: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        views__0: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        devices__1: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        views__0: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                        devices__1: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        fieldId: 'page',
                        columnType: 'indexValue',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'views__0',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'devices__1',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toEqual(expected);
    });

    it('with 1 dimension, 1 pivoted, metrics as rows', () => {
        const pivotConfig = {
            pivotDimensions: ['page'],
            metricsAsRows: true,
        };
        const expected = {
            headerValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            headerValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/about', formatted: '/about' },
                        colSpan: 1,
                    },
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/first-post', formatted: '/first-post' },
                        colSpan: 1,
                    },
                ],
            ],
            indexValueTypes: [{ type: 'metric' }],
            indexValues: [
                [{ type: 'label', fieldId: 'views' }],
                [{ type: 'label', fieldId: 'devices' }],
            ],
            dataColumnCount: 3,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 12, formatted: '12.0' },
                    { raw: 11, formatted: '11.0' },
                ],
                [
                    { raw: 7, formatted: '7.0' },
                    { raw: 0, formatted: '0.0' },
                    { raw: 1, formatted: '1.0' },
                ],
            ],
            pivotConfig: {
                pivotDimensions: ['page'],
                metricsAsRows: true,
            },
            titleFields: [[{ fieldId: 'page', direction: 'header' }]],
            cellsCount: 4,
            rowsCount: 2,
            retrofitData: {
                allCombinedData: [
                    {
                        'label-0': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        page__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        page__1: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        page__2: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                    },
                    {
                        'label-0': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        page__0: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        page__1: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        page__2: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        fieldId: 'label-0',
                        columnType: 'label',
                    },
                    {
                        baseId: 'page',
                        fieldId: 'page__0',
                    },
                    {
                        baseId: 'page',
                        fieldId: 'page__1',
                    },
                    {
                        baseId: 'page',
                        fieldId: 'page__2',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toEqual(expected);
    });

    it('with 2 dimensions, 1 pivoted, metrics as columns', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [
                { type: 'dimension', fieldId: 'site' },
                { type: 'metric' },
            ],
            headerValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'blog', formatted: 'Blog' },
                        colSpan: 2,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'blog', formatted: 'Blog' },
                        colSpan: 0,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'docs', formatted: 'Docs' },
                        colSpan: 2,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'docs', formatted: 'Docs' },
                        colSpan: 0,
                    },
                ],
                [
                    { type: 'label', fieldId: 'views' },
                    { type: 'label', fieldId: 'devices' },
                    { type: 'label', fieldId: 'views' },
                    { type: 'label', fieldId: 'devices' },
                ],
            ],
            indexValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            indexValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/about', formatted: '/about' },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/first-post', formatted: '/first-post' },
                        colSpan: 1,
                    },
                ],
            ],
            dataColumnCount: 4,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                    { raw: 2, formatted: '2.0' },
                    { raw: 10, formatted: '10.0' },
                ],
                [
                    { raw: 12, formatted: '12.0' },
                    { raw: 0, formatted: '0.0' },
                    { raw: 2, formatted: '2.0' },
                    { raw: 13, formatted: '13.0' },
                ],
                [
                    { raw: 11, formatted: '11.0' },
                    { raw: 1, formatted: '1.0' },
                    null,
                    null,
                ],
            ],
            pivotConfig: { pivotDimensions: ['site'], metricsAsRows: false },
            titleFields: [
                [{ fieldId: 'site', direction: 'header' }],
                [{ fieldId: 'page', direction: 'index' }],
            ],
            columnTotals: undefined,
            rowTotals: undefined,
            cellsCount: 5,
            rowsCount: 3,
            retrofitData: {
                allCombinedData: [
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        site__views__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        site__devices__1: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        site__views__2: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                        site__devices__3: {
                            value: { raw: 10, formatted: '10.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        site__views__0: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        site__devices__1: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        site__views__2: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                        site__devices__3: {
                            value: { raw: 13, formatted: '13.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        site__views__0: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                        site__devices__1: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        fieldId: 'page',
                        columnType: 'indexValue',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'site__views__0',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'site__devices__1',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'site__views__2',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'site__devices__3',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });

        expect(result).toEqual(expected);
    });

    it('with 2 dimensions, 1 pivoted, metrics as rows with totals', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: true,
            rowTotals: true,
        };
        const expected = {
            groupedSubtotals: undefined,
            headerValueTypes: [{ type: 'dimension', fieldId: 'site' }],
            headerValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'blog', formatted: 'Blog' },
                        colSpan: 1,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'docs', formatted: 'Docs' },
                        colSpan: 1,
                    },
                ],
            ],
            indexValueTypes: [
                { type: 'dimension', fieldId: 'page' },
                { type: 'metric' },
            ],
            indexValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'views' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'devices' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/about',
                            formatted: '/about',
                        },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'views' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/about',
                            formatted: '/about',
                        },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'devices' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/first-post',
                            formatted: '/first-post',
                        },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'views' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/first-post', formatted: '/first-post' },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'devices' },
                ],
            ],
            dataColumnCount: 2,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 2, formatted: '2.0' },
                ],
                [
                    { raw: 7, formatted: '7.0' },
                    { raw: 10, formatted: '10.0' },
                ],
                [
                    { raw: 12, formatted: '12.0' },
                    { raw: 2, formatted: '2.0' },
                ],
                [
                    { raw: 0, formatted: '0.0' },
                    { raw: 13, formatted: '13.0' },
                ],
                [{ raw: 11, formatted: '11.0' }, null],
                [{ raw: 1, formatted: '1.0' }, null],
            ],
            pivotConfig: {
                pivotDimensions: ['site'],
                metricsAsRows: true,
                rowTotals: true,
            },
            retrofitData: {
                allCombinedData: [
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        'label-1': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        site__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        site__1: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        'label-1': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        site__0: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        site__1: {
                            value: { raw: 10, formatted: '10.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        'label-1': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        site__0: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        site__1: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        'label-1': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        site__0: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        site__1: {
                            value: { raw: 13, formatted: '13.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        'label-1': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        site__0: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        'label-1': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        site__0: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        baseId: undefined,
                        fieldId: 'page',
                        columnType: 'indexValue',
                        underlyingId: undefined,
                    },
                    {
                        baseId: undefined,
                        fieldId: 'label-1',
                        columnType: 'label',
                        underlyingId: undefined,
                    },
                    {
                        baseId: 'site',
                        columnType: undefined,
                        fieldId: 'site__0',
                        underlyingId: undefined,
                    },
                    {
                        baseId: 'site',
                        columnType: undefined,
                        fieldId: 'site__1',
                        underlyingId: undefined,
                    },
                    {
                        baseId: 'row-total-0',
                        fieldId: 'row-total-0',
                        underlyingId: undefined,
                        columnType: 'rowTotal',
                    },
                ],
            },
            titleFields: [
                [
                    { fieldId: 'page', direction: 'index' },
                    { fieldId: 'site', direction: 'header' },
                ],
            ],
            columnTotalFields: undefined,
            rowTotalFields: [[{ fieldId: undefined }]],
            columnTotals: undefined,
            rowTotals: [[8], [17], [14], [13], [11], [1]],
            cellsCount: 5,
            rowsCount: 6,
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toStrictEqual(expected);
    });

    it.skip('with 0 dimensions and 2 metrics as columns', () => {
        const pivotConfig = {
            pivotDimensions: [],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [{ type: 'metric' }],
            headerValues: [
                [
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                ],
            ],
            indexValueTypes: [],
            indexValues: [],
            dataColumnCount: 2,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                ],
            ],
            pivotConfig,
        };
        const results = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_0DIM_2METRIC,
            rows: RESULT_ROWS_0DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(results).toStrictEqual(expected);
    });
});

describe('convertSqlPivotedRowsToPivotData', () => {
    it('should convert SQL-pivoted rows to PivotData format', () => {
        // Pivot "normal" rows (legacy way)
        const resultLegacy = pivotQueryResults({
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            pivotConfig: {
                pivotDimensions: ['payments_payment_method'],
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
                hiddenMetricFieldIds: [],
                columnTotals: false,
                rowTotals: false,
            },
            metricQuery: {
                dimensions: [
                    'payments_payment_method',
                    'orders_order_date_year',
                ],
                metrics: ['payments_total_revenue'],
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
            },
            rows: NON_PIVOTED_ROWS,
            options: {
                maxColumns: 60,
            },
        });
        // Convert SQL Pivoted rows to PivotData
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });
        // Verify legacy way to pivot in FE
        expect(resultLegacy).toStrictEqual(EXPECTED_PIVOT_DATA);
        // Verify the new conversion matches legacy method
        expect(result).toStrictEqual(resultLegacy);
    });

    it('should convert SQL-pivoted rows with totals to PivotData format', () => {
        // Pivot "normal" rows (legacy way)
        const resultLegacy = pivotQueryResults({
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            pivotConfig: {
                pivotDimensions: ['payments_payment_method'],
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
                hiddenMetricFieldIds: [],
                columnTotals: true,
                rowTotals: true,
            },
            metricQuery: {
                dimensions: [
                    'payments_payment_method',
                    'orders_order_date_year',
                ],
                metrics: ['payments_total_revenue'],
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
            },
            rows: NON_PIVOTED_ROWS,
            options: {
                maxColumns: 60,
            },
        });
        // Convert SQL Pivoted rows to PivotData
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });
        // Verify legacy way to pivot in FE
        expect(resultLegacy).toStrictEqual(EXPECTED_PIVOT_DATA_WITH_TOTALS);
        // Verify the new conversion matches legacy method
        expect(result).toStrictEqual(resultLegacy);
    });

    it('should convert SQL-pivoted rows with metricsAsRows: true to PivotData format', () => {
        // Pivot "normal" rows (legacy way) with metricsAsRows: true
        const resultLegacy = pivotQueryResults({
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                return fieldId;
            },
            pivotConfig: {
                pivotDimensions: ['payments_payment_method'],
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
                hiddenMetricFieldIds: [],
                columnTotals: true,
                rowTotals: true,
            },
            metricQuery: {
                dimensions: [
                    'payments_payment_method',
                    'orders_order_date_year',
                ],
                metrics: ['payments_total_revenue'],
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
            },
            rows: NON_PIVOTED_ROWS,
            options: {
                maxColumns: 60,
            },
        });

        // Convert SQL Pivoted rows to PivotData with metricsAsRows: true
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                return fieldId;
            },
            groupedSubtotals: undefined,
        });

        // Verify legacy way to pivot in FE matches expected structure
        expect(resultLegacy).toStrictEqual(EXPECTED_PIVOT_DATA_METRICS_AS_ROWS);

        // Verify the new conversion matches legacy method
        expect(result).toStrictEqual(resultLegacy);
    });

    it('should convert complex SQL-pivoted rows to PivotData format', () => {
        // Pivot "normal" rows (legacy way) with metricsAsRows: true
        const resultLegacy = pivotQueryResults({
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                if (fieldId === 'orders_average_order_size') {
                    return 'Orders Average order size';
                }
                if (fieldId === 'orders_total_order_amount') {
                    return 'Orders Total order amount';
                }
                return fieldId;
            },
            pivotConfig: {
                pivotDimensions: [
                    'payments_payment_method',
                    'orders_is_completed',
                ],
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
                hiddenMetricFieldIds: [],
                columnTotals: true,
                rowTotals: true,
            },
            metricQuery: {
                dimensions: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                ],
                metrics: [
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
            },
            rows: COMPLEX_NON_PIVOTED_ROWS,
            options: {
                maxColumns: 60,
            },
        });

        // Convert SQL Pivoted rows to PivotData with metricsAsRows: true
        const result = convertSqlPivotedRowsToPivotData({
            rows: COMPLEX_SQL_PIVOTED_ROWS,
            pivotDetails: COMPLEX_SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                if (fieldId === 'orders_average_order_size') {
                    return 'Orders Average order size';
                }
                if (fieldId === 'orders_total_order_amount') {
                    return 'Orders Total order amount';
                }
                return fieldId;
            },
            groupedSubtotals: undefined,
        });

        // Verify legacy way to pivot in FE matches expected structure
        expect(resultLegacy).toStrictEqual(EXPECTED_COMPLEX_PIVOT_DATA);

        // Verify the new conversion matches legacy method
        expect(result).toStrictEqual(resultLegacy);
    });

    it('should convert complex SQL-pivoted rows with metric as rows to PivotData format', () => {
        // Pivot "normal" rows (legacy way) with metricsAsRows: true
        const resultLegacy = pivotQueryResults({
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                if (fieldId === 'orders_average_order_size') {
                    return 'Orders Average order size';
                }
                if (fieldId === 'orders_total_order_amount') {
                    return 'Orders Total order amount';
                }
                return fieldId;
            },
            pivotConfig: {
                pivotDimensions: [
                    'payments_payment_method',
                    'orders_is_completed',
                ],
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
                hiddenMetricFieldIds: [],
                columnTotals: true,
                rowTotals: true,
            },
            metricQuery: {
                dimensions: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                ],
                metrics: [
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
            },
            rows: COMPLEX_NON_PIVOTED_ROWS,
            options: {
                maxColumns: 60,
            },
        });

        // Convert SQL Pivoted rows to PivotData with metricsAsRows: true
        const result = convertSqlPivotedRowsToPivotData({
            rows: COMPLEX_SQL_PIVOTED_ROWS,
            pivotDetails: COMPLEX_SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                if (fieldId === 'orders_average_order_size') {
                    return 'Orders Average order size';
                }
                if (fieldId === 'orders_total_order_amount') {
                    return 'Orders Total order amount';
                }
                return fieldId;
            },
            groupedSubtotals: undefined,
        });

        // Verify legacy way to pivot in FE matches expected structure
        expect(resultLegacy).toStrictEqual(
            EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
        );

        // Verify the new conversion matches legacy method
        expect(result).toStrictEqual(resultLegacy);
    });
});

const headerRowRawValues = (
    headerRow: PivotData['headerValues'][number],
): unknown[] =>
    headerRow.map((cell) =>
        cell.type === 'value' ? cell.value.raw : cell.fieldId,
    );

describe('pivot header rows stay aligned with data columns', () => {
    it('in-memory path: every header row has the data column count', () => {
        const result = pivotQueryResults({
            pivotConfig: { pivotDimensions: ['site'], metricsAsRows: false },
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });

        expect(result.headerValues.length).toBeGreaterThan(0);
        const dataWidth = result.dataValues[0].length;
        result.headerValues.forEach((headerRow) => {
            expect(headerRow).toHaveLength(dataWidth);
        });
        expect(result.headerValues).toHaveLength(
            result.headerValueTypes.length,
        );
    });

    it('SQL path: every header row has the data column count', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        expect(result.headerValues).toHaveLength(
            result.headerValueTypes.length,
        );
        const dataWidth = result.dataValues[0].length;
        result.headerValues.forEach((headerRow) => {
            expect(headerRow).toHaveLength(dataWidth);
        });
    });

    it('SQL path: header order follows data column order for shuffled valuesColumns', () => {
        // The mock columns carry no columnIndex, so the (stable) sort keeps
        // the shuffled input order: headers and data must still line up.
        const shuffledDetails = {
            ...SQL_PIVOT_DETAILS,
            valuesColumns: [...SQL_PIVOT_DETAILS.valuesColumns].reverse(),
        };
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: shuffledDetails,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        expect(result.headerValues).toHaveLength(2);
        result.headerValues.forEach((headerRow) => {
            expect(headerRow).toHaveLength(result.dataValues[0].length);
        });

        // Black-box alignment: map every data column back to the source
        // valuesColumn through its value and compare with the header cell
        const firstRow = SQL_PIVOTED_ROWS[0];
        expect(headerRowRawValues(result.headerValues[0])).toEqual([
            'gift_card',
            'credit_card',
            'coupon',
            'bank_transfer',
        ]);
        expect(result.dataValues[0].map((value) => value?.raw)).toEqual([
            347.29, 780.06, 125.64, 493.78,
        ]);
        result.dataValues[0].forEach((value, colIndex) => {
            const sourceColumn = shuffledDetails.valuesColumns.find(
                (col) => firstRow[col.pivotColumnName].value.raw === value?.raw,
            );
            expect(sourceColumn).toBeDefined();
            expect(headerRowRawValues(result.headerValues[0])[colIndex]).toBe(
                sourceColumn?.pivotValues[0].value,
            );
        });
    });

    it('SQL path: columnIndex normalizes shuffled valuesColumns for headers and data', () => {
        const shuffledDetails = {
            ...SQL_PIVOT_DETAILS,
            valuesColumns: SQL_PIVOT_DETAILS.valuesColumns
                .map((col, index) => ({ ...col, columnIndex: index }))
                .reverse(),
        };
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: shuffledDetails,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        // Both the header row and the data columns are back in columnIndex order
        expect(headerRowRawValues(result.headerValues[0])).toEqual([
            'bank_transfer',
            'coupon',
            'credit_card',
            'gift_card',
        ]);
        expect(result.dataValues[0].map((value) => value?.raw)).toEqual([
            493.78, 125.64, 780.06, 347.29,
        ]);
    });

    it('SQL path: a missing pivotValue gets a placeholder so header rows stay full length', () => {
        const detailsWithMissingValue = {
            ...SQL_PIVOT_DETAILS,
            valuesColumns: SQL_PIVOT_DETAILS.valuesColumns.map((col) =>
                col.pivotValues[0]?.value === 'coupon'
                    ? { ...col, pivotValues: [] }
                    : col,
            ),
        };
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: detailsWithMissingValue,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        const dataWidth = result.dataValues[0].length;
        expect(dataWidth).toBe(4);
        expect(result.headerValues).toHaveLength(2);
        result.headerValues.forEach((headerRow) => {
            expect(headerRow).toHaveLength(dataWidth);
        });
        expect(result.headerValues[0][1]).toEqual({
            type: 'value',
            fieldId: 'payments_payment_method',
            value: { raw: '', formatted: '' },
            colSpan: 0,
        });
        // The other cells keep their positions
        expect(headerRowRawValues(result.headerValues[0])).toEqual([
            'bank_transfer',
            '',
            'credit_card',
            'gift_card',
        ]);
    });
});

const EXPORT_ITEM_MAP: ItemsMap = {
    payments_payment_method: getFieldMock('payments_payment_method')!,
    orders_order_date_year: getFieldMock('orders_order_date_year')!,
    payments_total_revenue: getFieldMock('payments_total_revenue')!,
};

const EXPORT_METRIC_QUERY: MetricQuery = {
    exploreName: 'test',
    dimensions: ['page', 'site'],
    metrics: ['views', 'devices'],
    tableCalculations: [],
    additionalMetrics: [],
    customDimensions: [],
    filters: {},
    sorts: [],
    limit: 500,
};

const SQL_EXPORT_ARGS = {
    pivotConfig: {
        pivotDimensions: ['payments_payment_method'],
        rowTotals: true,
        columnTotals: false,
        metricsAsRows: false,
        columnOrder: [
            'payments_payment_method',
            'orders_order_date_year',
            'payments_total_revenue',
        ],
    },
    pivotDetails: SQL_PIVOT_DETAILS,
    rows: SQL_PIVOTED_ROWS,
    itemMap: EXPORT_ITEM_MAP,
    metricQuery: EXPORT_METRIC_QUERY,
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
};

const IN_MEMORY_EXPORT_ARGS = {
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: false,
        rowTotals: true,
    },
    pivotDetails: null,
    rows: RESULT_ROWS_2DIM_2METRIC,
    itemMap: EXPORT_ITEM_MAP,
    metricQuery: EXPORT_METRIC_QUERY,
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
};

// Plain items for the page/site/views/devices fixture (getFieldMock has no
// entries for them); views/devices must be summable for row totals to appear.
const makeDimensionItem = (fieldId: string, label: string): ItemsMap[string] =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: fieldId,
        label,
        table: 't',
        tableLabel: 'T',
        sql: `\${TABLE}.${fieldId}`,
        hidden: false,
    } as ItemsMap[string]);

const makeSummableMetricItem = (
    fieldId: string,
    label: string,
): ItemsMap[string] =>
    ({
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: fieldId,
        label,
        table: 't',
        tableLabel: 'T',
        sql: `SUM(\${TABLE}.${fieldId})`,
        hidden: false,
    } as ItemsMap[string]);

const PIVOT_ITEM_MAP: ItemsMap = {
    page: makeDimensionItem('page', 'Page'),
    site: makeDimensionItem('site', 'Site'),
    views: makeSummableMetricItem('views', 'Views'),
    devices: makeSummableMetricItem('devices', 'Devices'),
};

const PIVOT_METRIC_QUERY: MetricQuery = {
    exploreName: 'test',
    dimensions: ['page', 'site'],
    metrics: ['views', 'devices'],
    tableCalculations: [],
    additionalMetrics: [],
    customDimensions: [],
    filters: {},
    sorts: [],
    limit: 500,
};

// Both dimensions pivoted: grid gets a single empty leading prefix column and
// a 4-row header block (dimension names, site, page+metric, ... plus totals).
const TWO_PIVOT_DIMS_EXPORT_ARGS = {
    pivotConfig: {
        pivotDimensions: ['site', 'page'],
        metricsAsRows: false,
        rowTotals: true,
    },
    pivotDetails: null,
    rows: RESULT_ROWS_2DIM_2METRIC,
    itemMap: PIVOT_ITEM_MAP,
    metricQuery: PIVOT_METRIC_QUERY,
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
};

const METRICS_AS_ROWS_EXPORT_ARGS = {
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: true,
        rowTotals: false,
    },
    pivotDetails: null,
    rows: RESULT_ROWS_2DIM_2METRIC,
    itemMap: PIVOT_ITEM_MAP,
    metricQuery: PIVOT_METRIC_QUERY,
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
};

const SINGLE_DATA_COLUMN_EXPORT_ARGS = {
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: false,
        rowTotals: false,
    },
    pivotDetails: null,
    rows: [
        {
            page: { value: { raw: '/home', formatted: '/home' } },
            site: { value: { raw: 'blog', formatted: 'Blog' } },
            views: { value: { raw: 6, formatted: '6.0' } },
        },
    ] as PivotData['retrofitData']['allCombinedData'],
    itemMap: PIVOT_ITEM_MAP,
    metricQuery: {
        ...PIVOT_METRIC_QUERY,
        metrics: ['views'],
    },
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
};

// SQL-pivoted fixture whose valuesColumns carry no columnIndex and are
// deliberately shuffled so equal-prefix groups interleave (bank_transfer and
// coupon columns alternate). The colSpan the SQL path computes for a group
// counts *all* columns of that group even when they are not adjacent, so the
// grid must derive merges from contiguous runs instead of trusting colSpan.
const SHUFFLED_SQL_EXPORT_ARGS = {
    pivotConfig: {
        pivotDimensions: ['payments_payment_method', 'orders_is_completed'],
        rowTotals: false,
        columnTotals: false,
        metricsAsRows: false,
        columnOrder: [
            'payments_payment_method',
            'orders_is_completed',
            'orders_order_date_year',
            'payments_total_revenue',
            'orders_total_order_amount',
        ],
    },
    pivotDetails: {
        ...SQL_PIVOT_DETAILS,
        totalColumnCount: 6,
        valuesColumns: [
            {
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        value: 'bank_transfer',
                        referenceField: 'payments_payment_method',
                    },
                    { value: false, referenceField: 'orders_is_completed' },
                ],
                referenceField: 'payments_total_revenue',
                pivotColumnName: 'rev_bt_false',
            },
            {
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        value: 'coupon',
                        referenceField: 'payments_payment_method',
                    },
                    { value: false, referenceField: 'orders_is_completed' },
                ],
                referenceField: 'orders_total_order_amount',
                pivotColumnName: 'amt_coupon_false',
            },
            {
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        value: 'bank_transfer',
                        referenceField: 'payments_payment_method',
                    },
                    { value: true, referenceField: 'orders_is_completed' },
                ],
                referenceField: 'orders_total_order_amount',
                pivotColumnName: 'amt_bt_true',
            },
            {
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        value: 'coupon',
                        referenceField: 'payments_payment_method',
                    },
                    { value: false, referenceField: 'orders_is_completed' },
                ],
                referenceField: 'payments_total_revenue',
                pivotColumnName: 'rev_coupon_false',
            },
            {
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        value: 'coupon',
                        referenceField: 'payments_payment_method',
                    },
                    { value: true, referenceField: 'orders_is_completed' },
                ],
                referenceField: 'payments_total_revenue',
                pivotColumnName: 'rev_coupon_true',
            },
            {
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        value: 'bank_transfer',
                        referenceField: 'payments_payment_method',
                    },
                    { value: false, referenceField: 'orders_is_completed' },
                ],
                referenceField: 'orders_total_order_amount',
                pivotColumnName: 'amt_bt_false',
            },
        ],
        indexColumn: [
            { type: VizIndexType.TIME, reference: 'orders_order_date_year' },
            { type: VizIndexType.CATEGORY, reference: 'orders_promo_code' },
        ],
        groupByColumns: [
            { reference: 'payments_payment_method' },
            { reference: 'orders_is_completed' },
        ],
    },
    rows: [
        {
            orders_order_date_year: {
                value: { raw: '2025-01-01T00:00:00Z', formatted: '2025' },
            },
            orders_promo_code: {
                value: { raw: 'AFTER', formatted: 'AFTER' },
            },
            rev_bt_false: { value: { raw: 1, formatted: '1' } },
            amt_coupon_false: { value: { raw: 2, formatted: '$2.00' } },
            amt_bt_true: { value: { raw: 3, formatted: '$3.00' } },
            rev_coupon_false: { value: { raw: 4, formatted: '4' } },
            rev_coupon_true: { value: { raw: 5, formatted: '5' } },
            amt_bt_false: { value: { raw: 6, formatted: '$6.00' } },
        },
    ] as PivotData['retrofitData']['allCombinedData'],
    itemMap: {
        payments_payment_method: getFieldMock('payments_payment_method')!,
        orders_is_completed: getFieldMock('orders_is_completed')!,
        orders_order_date_year: getFieldMock('orders_order_date_year')!,
        orders_promo_code: makeDimensionItem('orders_promo_code', 'Promo Code'),
        payments_total_revenue: getFieldMock('payments_total_revenue')!,
        orders_total_order_amount: getFieldMock('orders_total_order_amount')!,
    },
    metricQuery: {
        exploreName: 'test',
        dimensions: ['orders_order_date_year', 'orders_promo_code'],
        metrics: ['payments_total_revenue', 'orders_total_order_amount'],
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
        filters: {},
        sorts: [],
        limit: 500,
    },
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
};

// 'region' is hidden from display but still part of the grouping keys: the
// first two rows share all *visible* dimension values (page=/home, site=East)
// and differ only in region, so they must stay separate data rows.
const HIDDEN_DIM_ROWS: PivotData['retrofitData']['allCombinedData'] = [
    {
        page: { value: { raw: '/home', formatted: '/home' } },
        site: { value: { raw: 'East', formatted: 'East' } },
        region: { value: { raw: 'us', formatted: 'US' } },
        views: { value: { raw: 6, formatted: '6.0' } },
        devices: { value: { raw: 7, formatted: '7.0' } },
    },
    {
        page: { value: { raw: '/home', formatted: '/home' } },
        site: { value: { raw: 'East', formatted: 'East' } },
        region: { value: { raw: 'eu', formatted: 'EU' } },
        views: { value: { raw: 2, formatted: '2.0' } },
        devices: { value: { raw: 10, formatted: '10.0' } },
    },
    {
        page: { value: { raw: '/about', formatted: '/about' } },
        site: { value: { raw: 'East', formatted: 'East' } },
        region: { value: { raw: 'us', formatted: 'US' } },
        views: { value: { raw: 12, formatted: '12.0' } },
        devices: { value: { raw: 0, formatted: '0.0' } },
    },
];

const HIDDEN_DIM_ITEM_MAP: ItemsMap = {
    ...PIVOT_ITEM_MAP,
    region: makeDimensionItem('region', 'Region'),
};

const HIDDEN_DIM_METRIC_QUERY: MetricQuery = {
    ...PIVOT_METRIC_QUERY,
    dimensions: ['page', 'site', 'region'],
};

const makeHiddenDimGridArgs = (hiddenDimensionFieldIds: string[]) => ({
    pivotConfig: {
        pivotDimensions: ['page'],
        metricsAsRows: false,
        rowTotals: false,
        hiddenDimensionFieldIds,
    },
    pivotDetails: null,
    rows: HIDDEN_DIM_ROWS,
    itemMap: HIDDEN_DIM_ITEM_MAP,
    metricQuery: HIDDEN_DIM_METRIC_QUERY,
    customLabels: undefined,
    onlyRaw: false,
    maxColumnLimit: 60,
});

describe('pivotResultsAsCsv / pivotResultsAsGrid', () => {
    it('csv output is unchanged (pinned against the pre-grid implementation)', () => {
        expect(pivotResultsAsCsv(IN_MEMORY_EXPORT_ARGS)).toEqual([
            ['site', 'Blog', 'Blog', 'Docs', 'Docs'],
            ['page', 'views', 'devices', 'views', 'devices'],
            ['/home', '6.0', '7.0', '2.0', '10.0'],
            ['/about', '12.0', '0.0', '2.0', '13.0'],
            ['/first-post', '11.0', '1.0', '', ''],
        ]);
        expect(pivotResultsAsCsv(SQL_EXPORT_ARGS)).toEqual([
            [
                'Payment Method',
                'bank_transfer',
                'coupon',
                'credit_card',
                'gift_card',
                'Total',
            ],
            [
                'Order Date Year',
                'Total Revenue',
                'Total Revenue',
                'Total Revenue',
                'Total Revenue',
                'Total Total Revenue',
            ],
            ['2025', '493.78', '125.64', '780.06', '347.29', '1,746.77'],
            ['2024', '301.9', '82', '630.1', '175.6', '1,189.6'],
            ['2023', '10.5', '51', '42', '14', '117.5'],
        ]);
    });

    it('in-memory: adds the dimension-name row, colSpan merges and the vertical index merge', () => {
        const grid = pivotResultsAsGrid(IN_MEMORY_EXPORT_ARGS);

        expect(grid.rows).toEqual([
            ['page', 'site', '', '', ''],
            ['', 'Blog', '', 'Docs', ''],
            ['', 'views', 'devices', 'views', 'devices'],
            ['/home', '6.0', '7.0', '2.0', '10.0'],
            ['/about', '12.0', '0.0', '2.0', '13.0'],
            ['/first-post', '11.0', '1.0', '', ''],
        ]);
        expect(grid.merges).toEqual([
            { row: 0, col: 1, rowSpan: 1, colSpan: 4 }, // dimension names over all data columns
            { row: 1, col: 1, rowSpan: 1, colSpan: 2 }, // Blog
            { row: 1, col: 3, rowSpan: 1, colSpan: 2 }, // Docs
            { row: 0, col: 0, rowSpan: 3, colSpan: 1 }, // "page" spans the whole header
        ]);
        // Data rows are identical to the CSV export
        expect(grid.rows.slice(3)).toEqual(
            pivotResultsAsCsv(IN_MEMORY_EXPORT_ARGS).slice(2),
        );
    });

    it('SQL path: adds the dimension-name row and the vertical index merge', () => {
        const grid = pivotResultsAsGrid(SQL_EXPORT_ARGS);

        // Three header rows: dimension names, pivot values, metric labels
        expect(grid.headerRowCount).toBe(3);
        expect(grid.rows[0]).toEqual([
            'Order Date Year',
            'Payment Method',
            '',
            '',
            '',
            '',
        ]);
        expect(grid.rows[1]).toEqual([
            '',
            'bank_transfer',
            'coupon',
            'credit_card',
            'gift_card',
            'Total',
        ]);
        expect(grid.rows[2]).toEqual([
            '',
            'Total Revenue',
            'Total Revenue',
            'Total Revenue',
            'Total Revenue',
            'Total Total Revenue',
        ]);
        expect(grid.merges).toEqual([
            { row: 0, col: 1, rowSpan: 1, colSpan: 4 },
            { row: 0, col: 0, rowSpan: 3, colSpan: 1 },
        ]);
        // Data rows are identical to the CSV export
        expect(grid.rows.slice(3)).toEqual(
            pivotResultsAsCsv(SQL_EXPORT_ARGS).slice(2),
        );
    });

    it('grid rows are rectangular and merges never overlap or leave the grid', () => {
        [IN_MEMORY_EXPORT_ARGS, SQL_EXPORT_ARGS].forEach((args) => {
            const grid = pivotResultsAsGrid(args);

            const width = grid.rows[0].length;
            expect(width).toBeGreaterThan(0);
            grid.rows.forEach((row) => expect(row).toHaveLength(width));

            const height = grid.rows.length;
            const covered = new Set<string>();
            grid.merges.forEach((merge) => {
                expect(merge.row).toBeGreaterThanOrEqual(0);
                expect(merge.col).toBeGreaterThanOrEqual(0);
                expect(merge.rowSpan).toBeGreaterThanOrEqual(1);
                expect(merge.colSpan).toBeGreaterThanOrEqual(1);
                expect(merge.row + merge.rowSpan).toBeLessThanOrEqual(height);
                expect(merge.col + merge.colSpan).toBeLessThanOrEqual(width);
                for (let r = merge.row; r < merge.row + merge.rowSpan; r += 1) {
                    for (
                        let c = merge.col;
                        c < merge.col + merge.colSpan;
                        c += 1
                    ) {
                        const key = `${r}:${c}`;
                        expect(covered.has(key)).toBe(false);
                        covered.add(key);
                    }
                }
            });
        });
    });

    it('without pivot dimensions the grid equals the CSV rows and has no merges', () => {
        const args = {
            ...IN_MEMORY_EXPORT_ARGS,
            pivotConfig: { pivotDimensions: [], metricsAsRows: false },
        };
        const grid = pivotResultsAsGrid(args);

        expect(grid.rows).toEqual(pivotResultsAsCsv(args));
        expect(grid.merges).toEqual([]);
        expect(grid.headerRowCount).toBe(1);
    });

    // Shared invariant helpers: rectangular rows, merges inside the grid,
    // never overlapping and never a pointless 1x1 range.
    const expectMergesAreValidRanges = (
        grid: ReturnType<typeof pivotResultsAsGrid>,
    ) => {
        const width = grid.rows[0]?.length ?? 0;
        expect(width).toBeGreaterThan(0);
        grid.rows.forEach((row) => expect(row).toHaveLength(width));

        const height = grid.rows.length;
        const covered = new Set<string>();
        grid.merges.forEach((merge) => {
            expect(merge.row).toBeGreaterThanOrEqual(0);
            expect(merge.col).toBeGreaterThanOrEqual(0);
            expect(merge.rowSpan).toBeGreaterThanOrEqual(1);
            expect(merge.colSpan).toBeGreaterThanOrEqual(1);
            expect(merge.row + merge.rowSpan).toBeLessThanOrEqual(height);
            expect(merge.col + merge.colSpan).toBeLessThanOrEqual(width);
            for (let r = merge.row; r < merge.row + merge.rowSpan; r += 1) {
                for (let c = merge.col; c < merge.col + merge.colSpan; c += 1) {
                    const key = `${r}:${c}`;
                    expect(covered.has(key)).toBe(false);
                    covered.add(key);
                }
            }
        });
        return covered;
    };

    const expectNoOneByOneMerges = (
        grid: ReturnType<typeof pivotResultsAsGrid>,
    ) => {
        grid.merges.forEach((merge) => {
            expect(merge.rowSpan === 1 && merge.colSpan === 1).toBe(false);
        });
    };

    it('grid with 2 pivot dimensions + rowTotals: nested spans nest exactly, Total columns stay unmerged, no 1x1 merges', () => {
        const grid = pivotResultsAsGrid(TWO_PIVOT_DIMS_EXPORT_ARGS);

        // 3 header-value rows + the dimension-name row
        expect(grid.headerRowCount).toBe(4);

        // Width: 1 empty prefix + (2 sites x 3 pages x 2 metrics) + 2 totals
        expect(grid.rows[0]).toHaveLength(13);
        expect(grid.rows[0]).toEqual([
            '',
            'Site / Page',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
        ]);
        expect(grid.rows[1]).toEqual([
            '',
            'Blog',
            '',
            '',
            '',
            '',
            '',
            'Docs',
            '',
            '',
            '',
            'Total',
            'Total',
        ]);
        expect(grid.rows[3]).toEqual([
            '',
            'Views',
            'Devices',
            'Views',
            'Devices',
            'Views',
            'Devices',
            'Views',
            'Devices',
            'Views',
            'Devices',
            'Total Views',
            'Total Devices',
        ]);

        // Dimension-name merge covers exactly the 10 data columns (cols 1-10),
        // never the Total columns (11-12).
        expect(grid.merges).toContainEqual({
            row: 0,
            col: 1,
            rowSpan: 1,
            colSpan: 10,
        });
        const nameMerge = grid.merges.find(
            (merge) => merge.row === 0 && merge.colSpan > 1,
        );
        expect(nameMerge).toEqual({
            row: 0,
            col: 1,
            rowSpan: 1,
            colSpan: 10,
        });
        expect(nameMerge!.col + nameMerge!.colSpan).toBe(11);

        // Site runs (level 1) sit inside the name merge: Blog cols 1-6,
        // Docs cols 7-10. Page runs (level 2) sit inside their site run:
        // every (site, page) pair spans exactly its 2 metric columns.
        expect(grid.merges).toEqual([
            { row: 0, col: 1, rowSpan: 1, colSpan: 10 },
            { row: 1, col: 1, rowSpan: 1, colSpan: 6 },
            { row: 1, col: 7, rowSpan: 1, colSpan: 4 },
            { row: 2, col: 1, rowSpan: 1, colSpan: 2 },
            { row: 2, col: 3, rowSpan: 1, colSpan: 2 },
            { row: 2, col: 5, rowSpan: 1, colSpan: 2 },
            { row: 2, col: 7, rowSpan: 1, colSpan: 2 },
            { row: 2, col: 9, rowSpan: 1, colSpan: 2 },
        ]);

        const covered = expectMergesAreValidRanges(grid);
        expectNoOneByOneMerges(grid);

        // Parent (row-0 name merge) covers every child cell of rows 1-2
        grid.merges
            .filter((merge) => merge.row === 1 || merge.row === 2)
            .forEach((child) => {
                for (let c = child.col; c < child.col + child.colSpan; c += 1) {
                    expect(covered.has(`0:${c}`)).toBe(true);
                }
            });

        // No row dimensions: no vertical merges at all
        expect(grid.merges.filter((merge) => merge.rowSpan > 1)).toEqual([]);
    });

    it('grid with metricsAsRows: headerRowCount is 2, the label column stays unmerged, rows are rectangular and match the CSV', () => {
        const grid = pivotResultsAsGrid(METRICS_AS_ROWS_EXPORT_ARGS);

        // 1 pivot-value row + the dimension-name row
        expect(grid.headerRowCount).toBe(2);
        expect(grid.rows).toEqual([
            ['Page', '', 'Site', ''],
            ['', '', 'Blog', 'Docs'],
            ['/home', 'Views', '6.0', '2.0'],
            ['/home', 'Devices', '7.0', '10.0'],
            ['/about', 'Views', '12.0', '2.0'],
            ['/about', 'Devices', '0.0', '13.0'],
            ['/first-post', 'Views', '11.0', ''],
            ['/first-post', 'Devices', '1.0', ''],
        ]);

        // Exactly two merges: the site names and the 'Page' vertical anchor.
        // The metric label column (col 1) never merges across its rows.
        expect(grid.merges).toEqual([
            { row: 0, col: 2, rowSpan: 1, colSpan: 2 },
            { row: 0, col: 0, rowSpan: 2, colSpan: 1 },
        ]);

        expectMergesAreValidRanges(grid);
        expectNoOneByOneMerges(grid);

        // Data rows are identical to the CSV export
        expect(grid.rows.slice(2)).toEqual(
            pivotResultsAsCsv(METRICS_AS_ROWS_EXPORT_ARGS).slice(1),
        );
    });

    it('grid with a single data column: no merges at all besides the row-dimension anchor (no 1x1 ranges)', () => {
        const grid = pivotResultsAsGrid(SINGLE_DATA_COLUMN_EXPORT_ARGS);

        expect(grid.headerRowCount).toBe(3);
        expect(grid.rows).toEqual([
            ['Page', 'Site'],
            ['', 'Blog'],
            ['', 'Views'],
            ['/home', '6.0'],
        ]);

        // One data column means the dimension-name row cannot span anything:
        // only the vertical 'Page' anchor exists.
        expect(grid.merges).toEqual([
            { row: 0, col: 0, rowSpan: 3, colSpan: 1 },
        ]);
        expectNoOneByOneMerges(grid);
        expectMergesAreValidRanges(grid);
    });

    it('SQL path with shuffled valuesColumns (no columnIndex): run-based merges never overlap and stay aligned with the data columns', () => {
        const grid = pivotResultsAsGrid(SHUFFLED_SQL_EXPORT_ARGS);
        const csv = pivotResultsAsCsv(SHUFFLED_SQL_EXPORT_ARGS);

        expect(grid.headerRowCount).toBe(4);
        expect(grid.rows).toEqual([
            [
                'Promo Code',
                'Order Date Year',
                'Payment Method / Is completed',
                '',
                '',
                '',
                '',
                '',
            ],
            ['', '', 'bank_transfer', 'coupon', '', '', 'bank_transfer', ''],
            ['', '', 'False', 'False', 'True', 'False', 'True', 'False'],
            [
                '',
                '',
                'Total Revenue',
                'Total Revenue',
                'Total Revenue',
                'Order Amount',
                'Order Amount',
                'Order Amount',
            ],
            ['AFTER', '2025', '1', '4', '5', '$2.00', '$3.00', '$6.00'],
        ]);

        // Input column order was [bt,false,rev] [coupon,false,amt]
        // [bt,true,amt] [coupon,false,rev] [coupon,true,rev] [bt,false,amt].
        // Trusting the SQL colSpan would merge bank_transfer over cols 2-4 and
        // coupon over cols 3-5 (overlapping, and 1-wide groups would emit 1x1
        // merges). Contiguous runs instead produce disjoint ranges.
        expect(grid.merges).toEqual([
            { row: 0, col: 2, rowSpan: 1, colSpan: 6 },
            { row: 1, col: 3, rowSpan: 1, colSpan: 3 },
            { row: 1, col: 6, rowSpan: 1, colSpan: 2 },
            { row: 0, col: 0, rowSpan: 4, colSpan: 1 },
            { row: 0, col: 1, rowSpan: 4, colSpan: 1 },
        ]);

        expectMergesAreValidRanges(grid);
        expectNoOneByOneMerges(grid);

        // Data row stays identical to the CSV export (same shuffled order)
        expect(grid.rows[4]).toEqual(csv[3]);
    });

    it('hiddenDimensionFieldIds: the grid only shows visible index dims and vertical merges only cover visible row-dimension columns', () => {
        const grid = pivotResultsAsGrid(makeHiddenDimGridArgs(['region']));

        expect(grid.headerRowCount).toBe(3);
        // Only 'Site' is a visible index column (1 leading column, not 2);
        // 'region' stays in the grouping keys so both East rows survive.
        expect(grid.rows).toEqual([
            ['Site', 'Page', '', '', ''],
            ['', '/home', '', '/about', ''],
            ['', 'Views', 'Devices', 'Views', 'Devices'],
            ['East', '6.0', '7.0', '12.0', '0.0'],
            ['East', '2.0', '10.0', '', ''],
        ]);

        // The vertical merge covers only the visible row-dimension column 0;
        // there is no merge for the hidden region column.
        expect(grid.merges).toEqual([
            { row: 0, col: 1, rowSpan: 1, colSpan: 4 },
            { row: 1, col: 1, rowSpan: 1, colSpan: 2 },
            { row: 1, col: 3, rowSpan: 1, colSpan: 2 },
            { row: 0, col: 0, rowSpan: 3, colSpan: 1 },
        ]);
        grid.merges
            .filter((merge) => merge.rowSpan > 1)
            .forEach((merge) => expect(merge.col).toBe(0));

        expectMergesAreValidRanges(grid);
        expectNoOneByOneMerges(grid);

        // Contrast: without hiding, the region column exists, the rows show
        // their region values, and that column also anchors a vertical merge.
        const visibleGrid = pivotResultsAsGrid(makeHiddenDimGridArgs([]));
        expect(visibleGrid.rows).toEqual([
            ['Site', 'Region', 'Page', '', '', ''],
            ['', '', '/home', '', '/about', ''],
            ['', '', 'Views', 'Devices', 'Views', 'Devices'],
            ['East', 'US', '6.0', '7.0', '12.0', '0.0'],
            ['East', 'EU', '2.0', '10.0', '', ''],
        ]);
        expect(visibleGrid.merges).toEqual([
            { row: 0, col: 2, rowSpan: 1, colSpan: 4 },
            { row: 1, col: 2, rowSpan: 1, colSpan: 2 },
            { row: 1, col: 4, rowSpan: 1, colSpan: 2 },
            { row: 0, col: 0, rowSpan: 3, colSpan: 1 },
            { row: 0, col: 1, rowSpan: 3, colSpan: 1 },
        ]);
    });
});

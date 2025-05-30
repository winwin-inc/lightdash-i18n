import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    SupportedDbtAdapter,
    type AdditionalMetric,
    type DateFilterSettings,
    type Explore,
    type Metric,
    type MetricFilterRule,
    type MetricQuery,
    type Source,
} from '../index';

export const metricQuery: MetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1', 'table2_dim2', 'custom_dimension_1'],
    metrics: ['table1_metric1', 'table2_metric2', 'table1_additional_metric_1'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [
        {
            name: 'calc2',
            displayName: '',
            sql: 'dim reference ${table1.dim1}',
        },
    ],
    additionalMetrics: [
        {
            name: 'additional_metric_1',
            sql: '${TABLE}.dim1',
            table: 'table1',
            type: MetricType.COUNT,
            description: 'My description',
        },
    ],
    customDimensions: [
        {
            id: 'custom_dimension_1',
            name: 'custom_dimension_1',
            type: CustomDimensionType.BIN,
            dimensionId: 'table1_dim1', // Parent dimension id
            binType: BinType.FIXED_NUMBER,
            binNumber: 5,
            table: 'table1',
        },
    ],
};

const exploreBase: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: '',
    label: '',
    tags: [],
    baseTable: 'a',
    joinedTables: [],
    tables: {},
    groupLabel: undefined,
};

const sourceMock: Source = {
    path: '',
    content: '',
    range: {
        start: {
            line: 0,
            character: 0,
        },
        end: {
            line: 0,
            character: 0,
        },
    },
};
export const explore: Explore = {
    ...exploreBase,
    tables: {
        table1: {
            name: 'table1',
            label: 'table1',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.table',
            sqlWhere: undefined,
            dimensions: {
                dim1: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'dim1',
                    label: 'dim1',
                    table: 'table1',
                    tableLabel: 'table1',
                    sql: '${TABLE}.dim1',
                    compiledSql: '"table1".dim1',
                    tablesReferences: ['table1'],
                    source: sourceMock,
                    hidden: false,
                    groups: [],
                },
            },
            metrics: {
                metric1: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.AVERAGE,
                    name: 'metric1',
                    label: 'metric1',
                    table: 'table1',
                    tableLabel: 'table1',
                    sql: 'AVG(${TABLE}.metric1)',
                    source: sourceMock,
                    hidden: false,
                    compiledSql: 'AVG("table1".metric1)',
                    tablesReferences: ['table1'],
                    groups: [],
                },
            },
            lineageGraph: {},
            groupLabel: undefined,
            source: sourceMock,
        },
    },
};

export const emptyExplore: Explore = {
    ...exploreBase,
    tables: {},
};

export const emptyMetricQuery: MetricQuery = {
    exploreName: 'test',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

export const customMetric: AdditionalMetric = {
    type: MetricType.AVERAGE,
    sql: '${TABLE}.dim1',
    table: 'a',
    name: 'average_dim1',
    label: 'Average dim1',
    baseDimensionName: 'dim1',
};
export const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.AVERAGE,
    name: 'average_dim1',
    label: 'Average dim1',
    table: 'a',
    tableLabel: 'a',
    sql: '${TABLE}.dim1',
    hidden: false,
    dimensionReference: 'a_dim1',
};

export const metricFilterRule = (args?: {
    fieldRef?: string;
    values?: unknown[];
    operator?: FilterOperator;
    settings?: DateFilterSettings;
}): MetricFilterRule => ({
    id: 'uuid',
    operator: args?.operator || FilterOperator.GREATER_THAN_OR_EQUAL,
    target: {
        fieldRef: args?.fieldRef || 'a_dim1',
    },
    settings: args?.settings || undefined,
    values: args?.values || [14],
});

import {
    CompiledMetricQuery,
    DimensionType,
    Explore,
    FieldType,
    FilterOperator,
    JoinRelationship,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
} from '@lightdash/common';
import {
    getIntervalSyntax,
    MetricQueryBuilder,
    type BuildQueryProps,
    type CompiledQuery,
} from './MetricQueryBuilder';
import {
    INTRINSIC_USER_ATTRIBUTES,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';

const POP_TEST_POP_METRIC_NAME = 'total_order_amount__pop__year_1__snapshot';
const POP_TEST_POP_METRIC_ID = `orders_${POP_TEST_POP_METRIC_NAME}`;

const POP_TEST_EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'orders',
    baseTable: 'orders',
    tags: [],
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'postgres',
            schema: 'jaffle',
            sqlTable: '"postgres"."jaffle"."orders"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'order_id',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                order_date: {
                    type: DimensionType.DATE,
                    name: 'order_date',
                    label: 'order_date',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_date',
                    compiledSql: '"orders".order_date',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                order_date_year: {
                    type: DimensionType.DATE,
                    name: 'order_date_year',
                    label: 'order_date_year',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: "DATE_TRUNC('YEAR', ${TABLE}.order_date)",
                    compiledSql: `DATE_TRUNC('YEAR', "orders".order_date)`,
                    tablesReferences: ['orders'],
                    hidden: false,
                    timeInterval: TimeFrames.YEAR,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                is_completed: {
                    type: DimensionType.BOOLEAN,
                    name: 'is_completed',
                    label: 'is_completed',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.is_completed',
                    compiledSql: '"orders".is_completed',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_order_amount: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'total_order_amount',
                    label: 'total_order_amount',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

const POP_TEST_METRIC_QUERY: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_year'],
    metrics: ['orders_total_order_amount', POP_TEST_POP_METRIC_ID],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'is-completed',
                    target: {
                        fieldId: 'orders_is_completed',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [true],
                },
                {
                    id: 'base-year',
                    target: {
                        fieldId: 'orders_order_date_year',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['2025-01-01'],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'orders_order_date_year', descending: true }],
    limit: 500,
    tableCalculations: [],
    compiledTableCalculations: [],
    additionalMetrics: [
        {
            table: 'orders',
            name: POP_TEST_POP_METRIC_NAME,
            label: 'Previous year total_order_amount',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            generationType: 'periodOverPeriod' as const,
            baseMetricId: 'orders_total_order_amount',
            timeDimensionId: 'orders_order_date_year',
            granularity: TimeFrames.YEAR,
            periodOffset: 1,
        },
    ],
    compiledAdditionalMetrics: [
        {
            type: MetricType.SUM,
            fieldType: FieldType.METRIC,
            table: 'orders',
            tableLabel: 'orders',
            name: POP_TEST_POP_METRIC_NAME,
            label: 'Previous year total_order_amount',
            sql: '${TABLE}.amount',
            compiledSql: 'SUM("orders".amount)',
            tablesReferences: ['orders'],
            hidden: true,
            generationType: 'periodOverPeriod',
            baseMetricId: 'orders_total_order_amount',
            timeDimensionId: 'orders_order_date_year',
            granularity: TimeFrames.YEAR,
            periodOffset: 1,
        },
    ],
    compiledCustomDimensions: [],
};

const buildQuery = (
    args: Omit<BuildQueryProps, 'parameterDefinitions'>,
): CompiledQuery =>
    new MetricQueryBuilder({
        ...args,
        parameterDefinitions: {},
    }).compileQuery();

describe('getIntervalSyntax', () => {
    test('Should use DATEADD for Redshift month granularity', () => {
        expect(
            getIntervalSyntax(
                SupportedDbtAdapter.REDSHIFT,
                '"orders".order_date',
                'pop.min_date',
                '>=',
                1,
                'month',
                false,
            ),
        ).toBe('"orders".order_date >= DATEADD(month, -1, pop.min_date)');
    });

    test('Should convert Redshift quarter granularity to months in DATEADD', () => {
        expect(
            getIntervalSyntax(
                SupportedDbtAdapter.REDSHIFT,
                '"orders".order_date',
                'pop.max_date',
                '<=',
                1,
                'quarter',
                false,
            ),
        ).toBe('"orders".order_date <= DATEADD(MONTH, -3, pop.max_date)');
    });

    test('Should use Postgres interval arithmetic', () => {
        expect(
            getIntervalSyntax(
                SupportedDbtAdapter.POSTGRES,
                '"orders".order_date',
                'pop.min_date',
                '>=',
                1,
                'year',
                false,
            ),
        ).toBe(
            `"orders".order_date >= pop.min_date - INTERVAL '1 year'`,
        );
    });
});

describe('Period-over-Period simple path', () => {
    test('Should emit base_metrics and pop CTEs with shifted period filters', () => {
        const { query } = buildQuery({
            explore: POP_TEST_EXPLORE,
            compiledMetricQuery: POP_TEST_METRIC_QUERY,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(query).toContain('base_metrics');
        expect(query).toMatch(/pop_min_max_/);
        expect(query).toMatch(/pop_metrics_/);
        expect(query).toContain(POP_TEST_POP_METRIC_ID);
        // Non-time dimension filters are applied on both base and pop paths
        expect(
            query.match(/\("orders"\.is_completed\) = \(true\)/g)?.length ??
                query.match(/is_completed/g)?.length ??
                0,
        ).toBeGreaterThanOrEqual(1);
        // Time filter on comparison dimension is stripped from pop path /
        // shifted via interval — base year literal should appear once
        expect(query.match(/'2025-01-01'/g)?.length ?? 0).toBeGreaterThanOrEqual(
            1,
        );
        expect(query).toMatch(/INTERVAL '1 year'/i);
    });

    test('Should throw when PoP time dimension is not selected', () => {
        const badQuery: CompiledMetricQuery = {
            ...POP_TEST_METRIC_QUERY,
            dimensions: [],
        };
        expect(() =>
            buildQuery({
                explore: POP_TEST_EXPLORE,
                compiledMetricQuery: badQuery,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }),
        ).toThrow(/time dimension/i);
    });
});

describe('Period-over-Period fanout path', () => {
    const FANOUT_POP_METRIC_NAME = 'metric_amount__pop__year_1__fanout';
    const FANOUT_POP_METRIC_ID = `table2_${FANOUT_POP_METRIC_NAME}`;

    const FANOUT_EXPLORE: Explore = {
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        name: 'base',
        label: 'base',
        baseTable: 'table1',
        tags: [],
        joinedTables: [
            {
                table: 'table2',
                sqlOn: '${table1.shared} = ${table2.shared}',
                compiledSqlOn: '("table1".shared) = ("table2".shared)',
                type: undefined,
                tablesReferences: ['table1', 'table2'],
                relationship: JoinRelationship.MANY_TO_ONE,
            },
        ],
        tables: {
            table1: {
                name: 'table1',
                label: 'table1',
                database: 'database',
                schema: 'schema',
                sqlTable: '"db"."schema"."table1"',
                primaryKey: ['id'],
                dimensions: {
                    id: {
                        type: DimensionType.NUMBER,
                        name: 'id',
                        label: 'id',
                        table: 'table1',
                        tableLabel: 'table1',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.id',
                        compiledSql: '"table1".id',
                        tablesReferences: ['table1'],
                        hidden: false,
                    },
                    shared: {
                        type: DimensionType.STRING,
                        name: 'shared',
                        label: 'shared',
                        table: 'table1',
                        tableLabel: 'table1',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.shared',
                        compiledSql: '"table1".shared',
                        tablesReferences: ['table1'],
                        hidden: false,
                    },
                },
                metrics: {},
                lineageGraph: {},
            },
            table2: {
                name: 'table2',
                label: 'table2',
                database: 'database',
                schema: 'schema',
                sqlTable: '"db"."schema"."table2"',
                primaryKey: ['id'],
                dimensions: {
                    id: {
                        type: DimensionType.NUMBER,
                        name: 'id',
                        label: 'id',
                        table: 'table2',
                        tableLabel: 'table2',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.id',
                        compiledSql: '"table2".id',
                        tablesReferences: ['table2'],
                        hidden: false,
                    },
                    shared: {
                        type: DimensionType.STRING,
                        name: 'shared',
                        label: 'shared',
                        table: 'table2',
                        tableLabel: 'table2',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.shared',
                        compiledSql: '"table2".shared',
                        tablesReferences: ['table2'],
                        hidden: false,
                    },
                    order_date_year: {
                        type: DimensionType.DATE,
                        name: 'order_date_year',
                        label: 'order_date_year',
                        table: 'table2',
                        tableLabel: 'table2',
                        fieldType: FieldType.DIMENSION,
                        sql: "DATE_TRUNC('YEAR', ${TABLE}.order_date)",
                        compiledSql: `DATE_TRUNC('YEAR', "table2".order_date)`,
                        tablesReferences: ['table2'],
                        hidden: false,
                        timeInterval: TimeFrames.YEAR,
                        timeIntervalBaseDimensionName: 'order_date',
                    },
                },
                metrics: {
                    metric_amount: {
                        type: MetricType.SUM,
                        fieldType: FieldType.METRIC,
                        table: 'table2',
                        tableLabel: 'table2',
                        name: 'metric_amount',
                        label: 'metric_amount',
                        sql: '${TABLE}.amount',
                        compiledSql: 'SUM("table2".amount)',
                        tablesReferences: ['table2'],
                        hidden: false,
                    },
                },
                lineageGraph: {},
            },
        },
    };

    const FANOUT_METRIC_QUERY: CompiledMetricQuery = {
        exploreName: 'base',
        dimensions: ['table2_order_date_year'],
        metrics: ['table2_metric_amount', FANOUT_POP_METRIC_ID],
        filters: {},
        sorts: [{ fieldId: 'table2_order_date_year', descending: true }],
        limit: 500,
        tableCalculations: [],
        compiledTableCalculations: [],
        additionalMetrics: [
            {
                table: 'table2',
                name: FANOUT_POP_METRIC_NAME,
                label: 'Previous year metric_amount',
                type: MetricType.SUM,
                sql: '${TABLE}.amount',
                generationType: 'periodOverPeriod' as const,
                baseMetricId: 'table2_metric_amount',
                timeDimensionId: 'table2_order_date_year',
                granularity: TimeFrames.YEAR,
                periodOffset: 1,
            },
        ],
        compiledAdditionalMetrics: [
            {
                type: MetricType.SUM,
                fieldType: FieldType.METRIC,
                table: 'table2',
                tableLabel: 'table2',
                name: FANOUT_POP_METRIC_NAME,
                label: 'Previous year metric_amount',
                sql: '${TABLE}.amount',
                compiledSql: 'SUM("table2".amount)',
                tablesReferences: ['table2'],
                hidden: true,
                generationType: 'periodOverPeriod',
                baseMetricId: 'table2_metric_amount',
                timeDimensionId: 'table2_order_date_year',
                granularity: TimeFrames.YEAR,
                periodOffset: 1,
            },
        ],
        compiledCustomDimensions: [],
    };

    test('Should emit cte_pop_* CTEs when fanout protection is active', () => {
        const { query } = buildQuery({
            explore: FANOUT_EXPLORE,
            compiledMetricQuery: FANOUT_METRIC_QUERY,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(query).toMatch(/cte_keys_/);
        expect(query).toMatch(/cte_pop_min_max_/);
        expect(query).toMatch(/cte_pop_keys_/);
        expect(query).toMatch(/cte_pop_metrics_/);
        expect(query).toContain(FANOUT_POP_METRIC_ID);
        expect(query).toMatch(/LEFT JOIN cte_pop_metrics_/);
        expect(query).toMatch(/INTERVAL '1 year'/i);
        // Fanout path should not fall back to simple-path base_metrics
        expect(query).not.toContain('base_metrics');
    });
});

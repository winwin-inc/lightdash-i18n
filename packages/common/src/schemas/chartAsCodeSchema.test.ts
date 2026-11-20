import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import chartAsCodeSchema from './json/chart-as-code-1.0.json';

const createValidator = () => {
    const ajv = new Ajv({
        allErrors: true,
        allowUnionTypes: true,
        strict: false,
    });
    addFormats(ajv);
    return ajv.compile(chartAsCodeSchema);
};

const baseChart = {
    name: 'Chart',
    slug: 'chart',
    spaceSlug: 'space',
    version: 1,
    tableName: 'orders',
    updatedAt: '2024-01-01T00:00:00.000Z',
    dashboardSlug: null,
    tableConfig: { columnOrder: ['orders_status', 'revenue'] },
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['revenue'],
        filters: {},
        sorts: [{ fieldId: 'revenue', descending: true }],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: 'table', config: {} },
};

describe('chartAsCodeSchema', () => {
    const validate = createValidator();

    test('accepts table grouping, pagination and column props', () => {
        expect(
            validate({
                ...baseChart,
                chartConfig: {
                    type: 'table',
                    config: {
                        showRowGrouping: true,
                        showSubtotals: false,
                        enablePagination: true,
                        pageSize: 25,
                        hideRowNumbers: true,
                        metricsAsRows: false,
                        showFieldDescriptionTooltip: false,
                        cellAlignment: 'center',
                        pivotRowDimensionAlignment: 'right',
                        pivotAutoFillWidth: true,
                        pivotDimensionColumnMaxWidth: 240,
                        pivotColumnMaxWidth: 180,
                        pivotMetricHeaderPosition: 'top',
                        columns: {
                            orders_status: {
                                visible: true,
                                name: '状态',
                                frozen: true,
                                displayStyle: 'text',
                                width: 120,
                            },
                        },
                    },
                },
            }),
        ).toBe(true);
    });

    test('accepts sorting keys, offset and pivot grouping', () => {
        expect(
            validate({
                ...baseChart,
                metricQuery: {
                    ...baseChart.metricQuery,
                    offset: 100,
                    sorts: [
                        {
                            fieldId: 'revenue',
                            descending: true,
                            nullsFirst: false,
                        },
                        {
                            fieldId: 'orders_status',
                            descending: false,
                            valueOrder: [],
                        },
                    ],
                },
                pivotConfig: { columns: ['orders_status'] },
            }),
        ).toBe(true);
    });

    test('accepts legacy null description from old downloads', () => {
        expect(
            validate({
                ...baseChart,
                description: null,
            }),
        ).toBe(true);
    });
});

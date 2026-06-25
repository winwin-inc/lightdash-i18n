import {
    CartesianSeriesType,
    ChartType,
    getChartRequiresPivotResults,
    type CartesianChartConfig,
} from './savedCharts';

const cartesianChartConfig: CartesianChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'payments_payment_method',
            yField: ['payments_total_revenue'],
        },
        eChartsConfig: {
            series: [
                {
                    type: CartesianSeriesType.BAR,
                    encode: {
                        xRef: { field: 'payments_payment_method' },
                        yRef: {
                            field: 'payments_total_revenue',
                            pivotValues: [
                                {
                                    field: 'orders_status',
                                    value: 'completed',
                                },
                            ],
                        },
                    },
                },
            ],
        },
    },
};

describe('getChartRequiresPivotResults', () => {
    test('returns true when series contain pivot values', () => {
        expect(
            getChartRequiresPivotResults(cartesianChartConfig, {
                columns: ['orders_status'],
            }),
        ).toBe(true);
    });

    test('returns true when series were stripped but pivotConfig.columns exists', () => {
        const strippedChartConfig: CartesianChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'payments_payment_method',
                    yField: ['payments_total_revenue'],
                },
                eChartsConfig: {},
            },
        };

        expect(
            getChartRequiresPivotResults(strippedChartConfig, {
                columns: ['orders_status'],
            }),
        ).toBe(true);
    });

    test('returns false when there is no pivot series and no pivotConfig', () => {
        const plainChartConfig: CartesianChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'payments_payment_method',
                    yField: ['payments_total_revenue'],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'payments_payment_method' },
                                yRef: {
                                    field: 'payments_total_revenue',
                                },
                            },
                        },
                    ],
                },
            },
        };

        expect(
            getChartRequiresPivotResults(plainChartConfig, undefined),
        ).toBe(false);
    });

    test('returns false for undefined saved chart', () => {
        expect(getChartRequiresPivotResults(undefined, undefined)).toBe(false);
    });
});

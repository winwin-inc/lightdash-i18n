import {
    CartesianSeriesType,
    type Field,
    type Series,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import GroupedSeriesConfiguration from './GroupedSeriesConfiguration';

vi.mock('./SingleSeriesConfiguration', () => ({
    default: () => <div data-testid="single-series-configuration" />,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: 'zh' },
        t: (key: string) => {
            const translations: Record<string, string> = {
                'components_visualization_configs_chart.series.axis': '轴',
                'components_visualization_configs_chart.series.value_labels':
                    '值标签',
                'components_visualization_configs_chart.series.total': '总计',
                'components_visualization_configs_chart.series.mixed': '混合',
                'components_visualization_configs_chart.series.tooltip_sort_by_value':
                    '堆叠系列排序',
                'components_visualization_configs_chart.series.tooltip_sort_direction':
                    '排序方向',
                'components_visualization_configs_chart.series.tooltip_sort_by_value_options.desc':
                    '降序',
                'components_visualization_configs_chart.series.tooltip_sort_by_value_options.asc':
                    '升序',
                'components_visualization_configs_chart.series.axis_options.left':
                    '左',
                'components_visualization_configs_chart.series.axis_options.right':
                    '右',
                'components_visualization_configs_chart.series.label_options.hidden':
                    '隐藏',
                'components_visualization_configs_chart.series.label_options.top':
                    '顶部',
                'components_visualization_configs_chart.series.label_options.bottom':
                    '底部',
                'components_visualization_configs_chart.series.label_options.left':
                    '左',
                'components_visualization_configs_chart.series.label_options.right':
                    '右',
                'components_visualization_configs_chart.series.label_options.inside':
                    '内部',
            };

            return translations[key] ?? key;
        },
    }),
}));

const item = {
    fieldType: 'metric',
    type: 'sum',
    name: 'revenue',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Revenue',
    hidden: false,
    sql: '${TABLE}.revenue',
} as Field;

const createSeries = (
    pivotValue: string,
    overrides: Partial<Series> = {},
): Series => ({
    encode: {
        xRef: { field: 'orders_status' },
        yRef: {
            field: 'orders_revenue',
            pivotValues: [{ field: 'orders_status', value: pivotValue }],
        },
    },
    type: CartesianSeriesType.BAR,
    ...overrides,
});

const defaultProps = {
    layout: { flipAxes: false },
    item,
    items: [item],
    getSingleSeries: vi.fn(),
    updateSingleSeries: vi.fn(),
    updateAllGroupedSeries: vi.fn(),
    updateSeries: vi.fn(),
};

describe('GroupedSeriesConfiguration stacked series sort visibility', () => {
    it('shows stacked series sort for stacked bar charts with multiple series', () => {
        renderWithProviders(
            <GroupedSeriesConfiguration
                {...defaultProps}
                series={[
                    createSeries('A', { stack: 'stack-1' }),
                    createSeries('B', { stack: 'stack-1' }),
                ]}
                seriesGroup={[
                    createSeries('A', { stack: 'stack-1' }),
                    createSeries('B', { stack: 'stack-1' }),
                ]}
            />,
        );

        expect(
            screen.getByRole('checkbox', { name: '堆叠系列排序' }),
        ).toBeInTheDocument();
    });

    it('does not show stacked series sort for non-stacked grouped bar charts', () => {
        renderWithProviders(
            <GroupedSeriesConfiguration
                {...defaultProps}
                series={[createSeries('A'), createSeries('B')]}
                seriesGroup={[createSeries('A'), createSeries('B')]}
            />,
        );

        expect(
            screen.queryByRole('checkbox', { name: '堆叠系列排序' }),
        ).not.toBeInTheDocument();
    });
});

import {
    type ItemsMap,
    type MetricQuery,
    type TableChart,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type InfiniteQueryResults } from '../useQueryResults';
import useTableConfig from './useTableConfig';

vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: vi.fn(() => ({ embedToken: undefined })),
}));

vi.mock('../useCalculateTotal', () => ({
    useCalculateTotal: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../useCalculateSubtotals', () => ({
    useCalculateSubtotals: vi.fn(() => ({ data: undefined })),
}));

vi.mock('./getDataAndColumns', () => ({
    default: vi.fn(() => []),
}));

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: vi.fn(() => vi.fn()),
    useWorker: vi.fn(() => ({
        pivotQueryResults: vi.fn(),
        convertSqlPivotedRowsToPivotData: vi.fn(),
    })),
}));

const columnOrder = ['orders_col_a', 'orders_col_b'];

const itemsMap = {
    orders_col_a: {
        fieldType: 'dimension',
        type: 'string',
        name: 'col_a',
        table: 'orders',
        tableLabel: 'Orders',
        label: 'Col A',
        hidden: false,
        sql: '${TABLE}.col_a',
    },
    orders_col_b: {
        fieldType: 'dimension',
        type: 'string',
        name: 'col_b',
        table: 'orders',
        tableLabel: 'Orders',
        label: 'Col B',
        hidden: false,
        sql: '${TABLE}.col_b',
    },
} as unknown as ItemsMap;

const metricQuery = {
    exploreName: 'orders',
    dimensions: columnOrder,
    metrics: [],
    tableCalculations: [],
    filters: {},
    sorts: [],
    limit: 500,
} as unknown as MetricQuery;

const resultsData = {
    metricQuery,
    fields: itemsMap,
    rows: [],
} as unknown as InfiniteQueryResults & {
    metricQuery?: MetricQuery;
    fields?: ItemsMap;
};

const renderTableConfigHook = (tableChartConfig?: TableChart) =>
    renderHook(() =>
        useTableConfig(
            tableChartConfig,
            resultsData,
            itemsMap,
            columnOrder,
            ['orders_col_a'],
            1000,
        ),
    );

describe('useTableConfig', () => {
    it('should keep previously updated column names when editing another column', () => {
        const { result } = renderTableConfigHook();

        act(() => {
            result.current.updateColumnProperty('orders_col_a', {
                name: 'Custom Column A',
            });
            result.current.updateColumnProperty('orders_col_b', {
                name: 'Custom Column B',
            });
        });

        expect(result.current.columnProperties).toEqual({
            orders_col_a: { name: 'Custom Column A' },
            orders_col_b: { name: 'Custom Column B' },
        });
    });

    it('should persist custom names after reopening table configuration', () => {
        const { result } = renderTableConfigHook();

        act(() => {
            result.current.updateColumnProperty('orders_col_a', {
                name: 'Custom Column A',
            });
            result.current.updateColumnProperty('orders_col_b', {
                name: 'Custom Column B',
            });
        });

        const persistedTableChartConfig = result.current.validConfig;
        const { result: reopenedResult } = renderTableConfigHook(
            persistedTableChartConfig,
        );

        expect(
            reopenedResult.current.getFieldLabelOverride('orders_col_a'),
        ).toBe('Custom Column A');
        expect(
            reopenedResult.current.getFieldLabelOverride('orders_col_b'),
        ).toBe('Custom Column B');
    });
});

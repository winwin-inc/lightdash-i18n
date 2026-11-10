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

    it('adopts externally replaced column properties (reset / history version)', () => {
        const { result, rerender } = renderHook(
            ({ config }: { config: TableChart | undefined }) =>
                useTableConfig(
                    config,
                    resultsData,
                    itemsMap,
                    columnOrder,
                    ['orders_col_a'],
                    1000,
                ),
            { initialProps: { config: undefined as TableChart | undefined } },
        );

        act(() => {
            result.current.updateColumnProperty('orders_col_a', { width: 300 });
        });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 300 },
        });

        // 自己改动的回流（父级把同一份配置传回来）不应覆盖 state
        rerender({ config: { columns: { orders_col_a: { width: 300 } } } });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 300 },
        });

        // 外部把配置换掉（Cancel / 切换历史版本）→ 采纳
        rerender({ config: { columns: {} } });
        expect(result.current.columnProperties).toEqual({});

        rerender({
            config: { columns: { orders_col_b: { width: 180 } } },
        });
        expect(result.current.columnProperties).toEqual({
            orders_col_b: { width: 180 },
        });
    });

    it('keeps saved column properties when the first metricQuery does not contain them (stale query)', () => {
        // 首帧结果的 metricQuery 可能是上一页残留 / 上一份查询，不能据此清空已保存的列配置
        const staleResultsData = {
            ...resultsData,
            metricQuery: {
                ...metricQuery,
                dimensions: ['orders_col_c'],
            },
        } as typeof resultsData;

        const { result } = renderHook(() =>
            useTableConfig(
                {
                    columns: {
                        orders_col_a: { name: 'Custom Column A' },
                        orders_col_b: { visible: false },
                    },
                },
                staleResultsData,
                itemsMap,
                columnOrder,
                ['orders_col_a'],
                1000,
            ),
        );

        expect(result.current.columnProperties).toEqual({
            orders_col_a: { name: 'Custom Column A' },
            orders_col_b: { visible: false },
        });
    });

    it('prunes column properties once a previously seen field leaves the query', () => {
        const resultsWithBothFields = {
            ...resultsData,
            metricQuery: {
                ...metricQuery,
                dimensions: [...columnOrder],
            },
        } as typeof resultsData;
        const resultsWithOneField = {
            ...resultsData,
            metricQuery: {
                ...metricQuery,
                dimensions: ['orders_col_b'],
            },
        } as typeof resultsData;

        const { result, rerender } = renderHook(
            ({ results }: { results: typeof resultsData }) =>
                useTableConfig(
                    undefined,
                    results,
                    itemsMap,
                    columnOrder,
                    ['orders_col_a'],
                    1000,
                ),
            { initialProps: { results: resultsWithBothFields } },
        );

        act(() => {
            result.current.updateColumnProperty('orders_col_a', { width: 300 });
            result.current.updateColumnProperty('orders_col_b', { width: 180 });
        });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 300 },
            orders_col_b: { width: 180 },
        });

        // orders_col_a 曾在本次会话的查询里出现过，现在被移除 → 清理它的列属性
        rerender({ results: resultsWithOneField });

        expect(result.current.columnProperties).toEqual({
            orders_col_b: { width: 180 },
        });
    });

    it('keeps column properties when the metricQuery has no fields', () => {
        // metricQuery 存在但字段为空（首帧 / 旧查询残留）→ 不能用空集合清空全部配置
        const emptyResultsData = {
            ...resultsData,
            metricQuery: {
                ...metricQuery,
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        } as typeof resultsData;

        const { result } = renderHook(() =>
            useTableConfig(
                {
                    columns: {
                        orders_col_a: { name: 'Custom Column A' },
                        orders_col_b: { visible: false },
                    },
                },
                emptyResultsData,
                itemsMap,
                columnOrder,
                ['orders_col_a'],
                1000,
            ),
        );

        expect(result.current.columnProperties).toEqual({
            orders_col_a: { name: 'Custom Column A' },
            orders_col_b: { visible: false },
        });
    });

    it('does not re-adopt pruned columns from an unchanged parent config', () => {
        const withBothColumns = {
            ...resultsData,
            metricQuery: { ...metricQuery, dimensions: [...columnOrder] },
        } as typeof resultsData;
        const withOneColumn = {
            ...resultsData,
            metricQuery: { ...metricQuery, dimensions: ['orders_col_b'] },
        } as typeof resultsData;

        const { result, rerender } = renderHook(
            ({
                config,
                results,
            }: {
                config: TableChart | undefined;
                results: typeof resultsData;
            }) =>
                useTableConfig(
                    config,
                    results,
                    itemsMap,
                    columnOrder,
                    ['orders_col_a'],
                    1000,
                ),
            {
                initialProps: {
                    config: undefined as TableChart | undefined,
                    results: withBothColumns,
                },
            },
        );

        act(() => {
            result.current.updateColumnProperty('orders_col_a', {
                width: 200,
            });
        });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 200 },
        });

        // 字段从查询里移出（曾经出现过）→ 该列属性被 prune
        rerender({ config: undefined, results: withOneColumn });
        expect(result.current.columnProperties).toEqual({});

        // 父级配置没变化 → 不能把被 prune 的列带回来（否则会无限循环）
        rerender({ config: {}, results: withOneColumn });
        expect(result.current.columnProperties).toEqual({});
    });

    it('pauses pruning on an empty query and resumes on the next non-empty frame', () => {
        // 空字段集（首帧 / 旧查询残留）只是「暂停」判断，不是永久豁免；
        // 但「一帧要删光全部列属性」会被当作结果来源变化而保留（防误删）。
        const withBothFields = {
            ...resultsData,
            metricQuery: { ...metricQuery, dimensions: [...columnOrder] },
        } as typeof resultsData;
        const withNoFields = {
            ...resultsData,
            metricQuery: {
                ...metricQuery,
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        } as typeof resultsData;
        const withOtherField = {
            ...resultsData,
            metricQuery: { ...metricQuery, dimensions: ['orders_col_c'] },
        } as typeof resultsData;
        const withOneField = {
            ...resultsData,
            metricQuery: { ...metricQuery, dimensions: ['orders_col_b'] },
        } as typeof resultsData;

        const { result, rerender } = renderHook(
            ({ results }: { results: typeof resultsData }) =>
                useTableConfig(
                    undefined,
                    results,
                    itemsMap,
                    columnOrder,
                    ['orders_col_a'],
                    1000,
                ),
            { initialProps: { results: withBothFields } },
        );

        act(() => {
            result.current.updateColumnProperty('orders_col_a', { width: 300 });
            result.current.updateColumnProperty('orders_col_b', { width: 180 });
        });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 300 },
            orders_col_b: { width: 180 },
        });

        // 字段集变空 → 不清理（暂停）
        rerender({ results: withNoFields });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 300 },
            orders_col_b: { width: 180 },
        });

        // 字段集被整体换成不相交的集合 → 不清空（视为结果来源变化，保守保留）
        rerender({ results: withOtherField });
        expect(result.current.columnProperties).toEqual({
            orders_col_a: { width: 300 },
            orders_col_b: { width: 180 },
        });

        // 部分移除（b 仍在查询里）→ 只清理 a，证明 prune 仍在工作
        rerender({ results: withOneField });
        expect(result.current.columnProperties).toEqual({
            orders_col_b: { width: 180 },
        });
    });

    it('keeps an orphan column property that never appeared in the session', () => {
        const onlyFirstField = {
            ...resultsData,
            metricQuery: { ...metricQuery, dimensions: ['orders_col_a'] },
        } as typeof resultsData;

        const { result } = renderHook(() =>
            useTableConfig(
                {
                    columns: { orders_col_b: { visible: false } },
                },
                onlyFirstField,
                itemsMap,
                columnOrder,
                ['orders_col_a'],
                1000,
            ),
        );

        // b 从未在本次会话的查询里出现过 → 视为孤儿属性，保留（可能是首帧残留/别的查询保存的）
        expect(result.current.columnProperties).toEqual({
            orders_col_b: { visible: false },
        });
        // 已知副作用：孤儿属性会经 validConfig 随保存一起落库
        expect(result.current.validConfig.columns).toEqual({
            orders_col_b: { visible: false },
        });
    });

    it('should keep showTableNames false after user toggles it off', () => {
        const multiTableItemsMap = {
            ...itemsMap,
            customers_col_c: {
                fieldType: 'dimension',
                type: 'string',
                name: 'col_c',
                table: 'customers',
                tableLabel: 'Customers',
                label: 'Col C',
                hidden: false,
                sql: '${TABLE}.col_c',
            },
        } as unknown as ItemsMap;

        const multiTableResultsData = {
            ...resultsData,
            fields: multiTableItemsMap,
            metricQuery: {
                ...metricQuery,
                dimensions: [...columnOrder, 'customers_col_c'],
            },
        } as typeof resultsData;

        const { result, rerender } = renderHook(
            ({ config, fields }) =>
                useTableConfig(
                    config,
                    multiTableResultsData,
                    fields,
                    [...columnOrder, 'customers_col_c'],
                    ['orders_col_a'],
                    1000,
                ),
            {
                initialProps: {
                    config: undefined as TableChart | undefined,
                    fields: multiTableItemsMap,
                },
            },
        );

        expect(result.current.showTableNames).toBe(true);

        act(() => {
            result.current.setShowTableNames(false);
        });

        expect(result.current.showTableNames).toBe(false);
        expect(result.current.validConfig.showTableNames).toBe(false);

        rerender({
            config: undefined,
            fields: { ...multiTableItemsMap },
        });

        expect(result.current.showTableNames).toBe(false);
    });

    it('should sync showTableNames from saved chart config', () => {
        const { result, rerender } = renderHook(
            ({ config }: { config: TableChart | undefined }) =>
                useTableConfig(
                    config,
                    resultsData,
                    itemsMap,
                    columnOrder,
                    ['orders_col_a'],
                    1000,
                ),
            { initialProps: { config: undefined as TableChart | undefined } },
        );

        rerender({ config: { showTableNames: false } });

        expect(result.current.showTableNames).toBe(false);
    });

    it('should include table names with custom column names when enabled', () => {
        const { result } = renderTableConfigHook();

        act(() => {
            result.current.updateColumnProperty('orders_col_a', {
                name: 'Custom Column A',
            });
        });

        expect(result.current.getFieldLabel('orders_col_a')).toBe(
            'Orders Custom Column A',
        );

        act(() => {
            result.current.setShowTableNames(false);
        });

        expect(result.current.getFieldLabel('orders_col_a')).toBe(
            'Custom Column A',
        );
    });

    it('should not duplicate table names in custom column names', () => {
        const { result } = renderTableConfigHook();

        act(() => {
            result.current.updateColumnProperty('orders_col_a', {
                name: 'Orders Custom Column A',
            });
        });

        expect(result.current.getFieldLabel('orders_col_a')).toBe(
            'Orders Custom Column A',
        );
    });

    it('should persist pivotRowDimensionAlignment after reopening table configuration', () => {
        const { result } = renderTableConfigHook({
            pivotRowDimensionAlignment: 'center',
        });

        expect(result.current.pivotRowDimensionAlignment).toBe('center');
        expect(result.current.validConfig.pivotRowDimensionAlignment).toBe(
            'center',
        );

        const persistedTableChartConfig = result.current.validConfig;
        const { result: reopenedResult } = renderTableConfigHook(
            persistedTableChartConfig,
        );

        expect(reopenedResult.current.pivotRowDimensionAlignment).toBe(
            'center',
        );
    });
});

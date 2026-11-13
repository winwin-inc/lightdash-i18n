import { DimensionType, FieldType } from '../types/field';
import {
    FilterOperator,
    UnitOfTime,
    type DashboardFilters,
} from '../types/filter';
import {
    formatDashboardFilterRuleValue,
    getDashboardFiltersForTab,
    getDashboardFiltersForTile,
    getExportFilterColumns,
    mergeDashboardFiltersForTab,
} from './dashboardExportFilters';

const makeRule = (overrides: Record<string, unknown> = {}) =>
    ({
        id: 'rule-1',
        target: { fieldId: 'orders_status', tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: ['completed'],
        label: undefined,
        ...overrides,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

describe('mergeDashboardFiltersForTab', () => {
    const globalFilters: DashboardFilters = {
        ...emptyFilters,
        dimensions: [makeRule({ id: 'global-1', values: ['2024-01-01'] })],
    };
    const tabFilters: DashboardFilters = {
        ...emptyFilters,
        dimensions: [makeRule({ id: 'tab-1', values: ['completed'] })],
    };

    it('merges global and tab filters when both layers are enabled', () => {
        const merged = mergeDashboardFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: true,
            isTabFilterEnabled: true,
        });
        expect(merged.dimensions.map((rule) => rule.id)).toEqual([
            'global-1',
            'tab-1',
        ]);
    });

    it('drops global filters when the global layer is disabled', () => {
        const merged = mergeDashboardFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: false,
            isTabFilterEnabled: true,
        });
        expect(merged.dimensions.map((rule) => rule.id)).toEqual(['tab-1']);
    });

    it('drops tab filters when the tab layer is disabled', () => {
        const merged = mergeDashboardFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: true,
            isTabFilterEnabled: false,
        });
        expect(merged.dimensions.map((rule) => rule.id)).toEqual(['global-1']);
    });

    it('returns an empty set when both layers are disabled', () => {
        const merged = mergeDashboardFiltersForTab({
            globalFilters,
            tabFilters,
            isGlobalFilterEnabled: false,
            isTabFilterEnabled: false,
        });
        expect(merged).toEqual(emptyFilters);
    });

    it('handles tabs without filters', () => {
        const merged = mergeDashboardFiltersForTab({
            globalFilters,
            tabFilters: undefined,
            isGlobalFilterEnabled: true,
            isTabFilterEnabled: true,
        });
        expect(merged.dimensions.map((rule) => rule.id)).toEqual(['global-1']);
    });
});

describe('getDashboardFiltersForTab', () => {
    const globalFilters: DashboardFilters = {
        ...emptyFilters,
        dimensions: [makeRule({ id: 'global-1', values: ['2024-01-01'] })],
    };
    const tabFilters: DashboardFilters = {
        ...emptyFilters,
        dimensions: [makeRule({ id: 'tab-1', values: ['completed'] })],
    };

    it('defaults both switches to enabled when the config is missing', () => {
        const filters = getDashboardFiltersForTab({
            dashboard: {
                filters: globalFilters,
                tabs: [{ uuid: 'tab-a', filters: tabFilters }],
            },
            tabUuid: 'tab-a',
        });
        expect(filters.dimensions.map((rule) => rule.id)).toEqual([
            'global-1',
            'tab-1',
        ]);
    });

    it('honours the per-tab enable switch', () => {
        const filters = getDashboardFiltersForTab({
            dashboard: {
                filters: globalFilters,
                tabs: [{ uuid: 'tab-a', filters: tabFilters }],
                config: { tabFilterEnabled: { 'tab-a': false } },
            },
            tabUuid: 'tab-a',
        });
        expect(filters.dimensions.map((rule) => rule.id)).toEqual(['global-1']);
    });

    it('accepts overridden global filters (one-off export values)', () => {
        const overridden: DashboardFilters = {
            ...emptyFilters,
            dimensions: [makeRule({ id: 'global-2', values: ['2024-06-01'] })],
        };
        const filters = getDashboardFiltersForTab({
            dashboard: {
                filters: globalFilters,
                tabs: [{ uuid: 'tab-a', filters: tabFilters }],
            },
            tabUuid: 'tab-a',
            globalFilters: overridden,
        });
        expect(filters.dimensions.map((rule) => rule.id)).toEqual([
            'global-2',
            'tab-1',
        ]);
    });
});

describe('getDashboardFiltersForTile', () => {
    it('keeps rules targeted at the tile and drops explicitly excluded ones', () => {
        const filters: DashboardFilters = {
            ...emptyFilters,
            dimensions: [
                makeRule({ id: 'targets-tile', tileTargets: {} }),
                makeRule({ id: 'excluded', tileTargets: { 'tile-a': false } }),
                makeRule({
                    id: 'other-tile',
                    tileTargets: { 'tile-b': { fieldId: 'x', tableName: 'y' } },
                }),
            ],
        };
        const tileFilters = getDashboardFiltersForTile({
            filters,
            tileUuid: 'tile-a',
        });
        expect(tileFilters.dimensions.map((rule) => rule.id)).toEqual([
            'targets-tile',
            'other-tile',
        ]);
    });
});

describe('formatDashboardFilterRuleValue', () => {
    it('joins multiple discrete values', () => {
        expect(
            formatDashboardFilterRuleValue(
                makeRule({ operator: FilterOperator.INCLUDE, values: ['a', 'b'] }),
            ),
        ).toBe('a, b');
    });

    it('renders a date range with the raw stored values', () => {
        expect(
            formatDashboardFilterRuleValue(
                makeRule({
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2024-01-01', '2024-06-30'],
                }),
            ),
        ).toBe('2024-01-01 ~ 2024-06-30');
    });

    it('returns null for disabled rules (any value)', () => {
        expect(
            formatDashboardFilterRuleValue(
                makeRule({ disabled: true, values: [] }),
            ),
        ).toBeNull();
    });

    it('renders a single-sided range without a dangling separator', () => {
        expect(
            formatDashboardFilterRuleValue(
                makeRule({
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2024-01-01', ''],
                }),
            ),
        ).toBe('2024-01-01');
    });

    it('prefixes comparison operators so the direction is not lost', () => {
        expect(
            formatDashboardFilterRuleValue(
                makeRule({
                    operator: FilterOperator.GREATER_THAN,
                    values: [100],
                }),
            ),
        ).toBe('> 100');
        expect(
            formatDashboardFilterRuleValue(
                makeRule({
                    operator: FilterOperator.NOT_EQUALS,
                    values: ['a'],
                }),
            ),
        ).toBe('!= a');
    });

    it('resolves "in the past" into a concrete window instead of a bare number', () => {
        const value = formatDashboardFilterRuleValue(
            makeRule({
                operator: FilterOperator.IN_THE_PAST,
                values: [3],
                settings: { unitOfTime: UnitOfTime.months },
            }),
        );
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2}$/);
    });

    it('keeps a column for "in the current" filters, which have no values', () => {
        const value = formatDashboardFilterRuleValue(
            makeRule({
                operator: FilterOperator.IN_THE_CURRENT,
                values: [],
                settings: { unitOfTime: UnitOfTime.months },
            }),
        );
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2}$/);
    });

    it('returns null for rules without values', () => {
        expect(formatDashboardFilterRuleValue(makeRule({ values: [] }))).toBeNull();
    });
});

describe('getExportFilterColumns', () => {
    const itemMap = {
        orders_status: {
            name: 'status',
            label: '订单状态',
            type: DimensionType.STRING,
            table: 'orders',
            fieldType: FieldType.DIMENSION,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    it('uses the custom label first and falls back to the field label', () => {
        const columns = getExportFilterColumns({
            filters: {
                ...emptyFilters,
                dimensions: [
                    makeRule({ id: 'labelled', label: '时间', values: ['2024-05'] }),
                    makeRule({ id: 'unlabelled', values: ['completed'] }),
                ],
            },
            itemMap,
        });
        expect(columns).toEqual([
            { header: '时间', value: '2024-05' },
            { header: '订单状态', value: 'completed' },
        ]);
    });

    it('falls back to the filter target fieldLabel before the raw id', () => {
        const columns = getExportFilterColumns({
            filters: {
                ...emptyFilters,
                dimensions: [
                    makeRule({
                        target: {
                            fieldId: 'spu_name',
                            tableName: 'orders',
                            fieldLabel: '商品名称',
                        },
                        values: ['可乐'],
                    }),
                ],
            },
        });
        expect(columns).toEqual([{ header: '商品名称', value: '可乐' }]);
    });

    it('falls back to the field id when the field is unknown', () => {
        const columns = getExportFilterColumns({
            filters: {
                ...emptyFilters,
                dimensions: [makeRule({ values: ['1'] })],
            },
        });
        expect(columns).toEqual([{ header: 'orders_status', value: '1' }]);
    });

    it('skips filters without a concrete value', () => {
        const columns = getExportFilterColumns({
            filters: {
                ...emptyFilters,
                dimensions: [
                    makeRule({ id: 'disabled', disabled: true, values: [] }),
                    makeRule({ id: 'set', label: '类目', values: ['饮料'] }),
                ],
            },
        });
        expect(columns).toEqual([{ header: '类目', value: '饮料' }]);
    });

    it('de-duplicates identical headers', () => {
        const columns = getExportFilterColumns({
            filters: {
                ...emptyFilters,
                dimensions: [
                    makeRule({ id: 'a', label: '类目', values: ['饮料'] }),
                    makeRule({ id: 'b', label: '类目', values: ['食品'] }),
                ],
            },
        });
        expect(columns.map((column) => column.header)).toEqual([
            '类目',
            '类目 (2)',
        ]);
    });

    it('returns no columns for undefined filters', () => {
        expect(getExportFilterColumns({ filters: undefined })).toEqual([]);
    });
});

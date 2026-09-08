import {
    applyMetricOverrides,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from './filter';

describe('applyMetricOverrides', () => {
    const createMetricFilter = (
        id: string,
        fieldId: string,
        values: string[] = ['value1'],
    ): DashboardFilterRule => ({
        id,
        label: `Label for ${fieldId}`,
        operator: FilterOperator.EQUALS,
        target: {
            fieldId,
            tableName: 'orders',
        },
        tileTargets: {},
        disabled: false,
        values,
    });

    const createDashboardFilters = (
        metrics: DashboardFilterRule[],
    ): DashboardFilters => ({
        dimensions: [],
        metrics,
        tableCalculations: [],
    });

    it('applies override values while keeping saved-dashboard tile targets', () => {
        const savedTileTargets = {
            'tile-1': { fieldId: 'orders_total', tableName: 'orders' },
        };
        const savedFilters = createDashboardFilters([
            {
                ...createMetricFilter('metric-1', 'orders_total'),
                tileTargets: savedTileTargets,
            },
            createMetricFilter('metric-2', 'orders_count'),
        ]);
        const overrides = [
            createMetricFilter('metric-1', 'orders_total', ['999']),
        ];

        const result = applyMetricOverrides(savedFilters, overrides);

        expect(result).toHaveLength(2);
        expect(result[0].values).toEqual(['999']);
        expect(result[0].tileTargets).toEqual(savedTileTargets);
        expect(result[1]).toEqual(savedFilters.metrics[1]);
    });

    it('accepts DashboardFilters as overrides and never appends unmatched rules', () => {
        const savedFilters = createDashboardFilters([
            createMetricFilter('metric-1', 'orders_total'),
        ]);
        const overrides = createDashboardFilters([
            createMetricFilter('metric-1', 'orders_total', ['999']),
            createMetricFilter('unmatched', 'orders_count'),
        ]);

        const result = applyMetricOverrides(savedFilters, overrides);

        expect(result).toHaveLength(1);
        expect(result[0].values).toEqual(['999']);
    });

    it('preserves lock metadata from the saved dashboard', () => {
        const savedFilters = createDashboardFilters([
            {
                ...createMetricFilter('metric-1', 'orders_total'),
                lockedTabUuids: ['tab-1'],
                requiredGroupId: 'group-1',
            },
        ]);
        const overrides = [
            createMetricFilter('metric-1', 'orders_total', ['999']),
        ];

        const result = applyMetricOverrides(savedFilters, overrides);

        expect(result[0].values).toEqual(['999']);
        expect(result[0].lockedTabUuids).toEqual(['tab-1']);
        expect(result[0].requiredGroupId).toEqual('group-1');
    });
});

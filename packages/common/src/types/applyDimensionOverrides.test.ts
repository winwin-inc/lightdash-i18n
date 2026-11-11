import cloneDeep from 'lodash/cloneDeep';
import { DimensionType } from './field';
import {
    applyDimensionOverrides,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTileTarget,
    FilterOperator,
    UnitOfTime,
} from './filter';
import { TimeFrames } from './timeFrames';

describe('applyDimensionOverrides', () => {
    // Test fixtures
    const createBaseDashboardFilter = (
        id: string,
        fieldId: string,
        tableName: string,
        values: string[] = ['value1'],
        tileTargets: Record<string, DashboardTileTarget> = {},
    ): DashboardFilterRule => ({
        id,
        label: `Label for ${fieldId}`,
        operator: FilterOperator.EQUALS,
        target: {
            fieldId,
            tableName,
        },
        tileTargets,
        disabled: false,
        values,
    });

    const createOverrideFilter = (
        id: string,
        fieldId: string,
        tableName: string,
        values: string[] = ['overrideValue'],
        operator: FilterOperator = FilterOperator.EQUALS,
    ): DashboardFilterRule => ({
        id,
        label: `Override for ${fieldId}`,
        operator,
        target: {
            fieldId,
            tableName,
        },
        disabled: false,
        values,
    });

    const baseDashboardFilters: DashboardFilters = {
        dimensions: [
            createBaseDashboardFilter(
                'filter-1',
                'customers_customer_id',
                'customers',
                ['123', '456'],
                {
                    'tile-1': {
                        fieldId: 'customers_customer_id',
                        tableName: 'customers',
                    },
                    'tile-2': false,
                },
            ),
            createBaseDashboardFilter(
                'filter-2',
                'orders_status',
                'orders',
                ['completed'],
                {
                    'tile-1': {
                        fieldId: 'orders_status',
                        tableName: 'orders',
                    },
                },
            ),
        ],
        metrics: [],
        tableCalculations: [],
    };

    describe('when overrides is an array of DashboardFilterRule[]', () => {
        it('should apply overrides to existing dimensions while preserving tileTargets', () => {
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-1',
                    'customers_customer_id',
                    'customers',
                    ['789'], // different values
                    FilterOperator.IN_BETWEEN, // different operator
                ),
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: 'filter-1',
                label: 'Override for customers_customer_id',
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldId: 'customers_customer_id',
                    tableName: 'customers',
                },
                disabled: false,
                values: ['789'],
                // tileTargets should be preserved from original
                tileTargets: {
                    'tile-1': {
                        fieldId: 'customers_customer_id',
                        tableName: 'customers',
                    },
                    'tile-2': false,
                },
            });
            // Second filter should remain unchanged
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);
        });

        it('should add new dimensions that do not exist in dashboard filters', () => {
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-3',
                    'products_category',
                    'products',
                    ['electronics'],
                ),
                createOverrideFilter(
                    'filter-4',
                    'users_age',
                    'users',
                    ['25'],
                    FilterOperator.GREATER_THAN,
                ),
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(4);
            // Original filters should remain
            expect(result.slice(0, 2)).toEqual(baseDashboardFilters.dimensions);
            // New filters should be added
            expect(result[2]).toEqual(overrides[0]);
            expect(result[3]).toEqual(overrides[1]);
        });

        it('should handle mixed scenario: override existing and add new', () => {
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-1',
                    'customers_customer_id',
                    'customers',
                    ['999'],
                    FilterOperator.NOT_EQUALS,
                ),
                createOverrideFilter('filter-3', 'new_field', 'new_table', [
                    'new_value',
                ]),
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(3);
            // First filter should be overridden
            expect(result[0].values).toEqual(['999']);
            expect(result[0].operator).toBe(FilterOperator.NOT_EQUALS);
            expect(result[0].tileTargets).toEqual(
                baseDashboardFilters.dimensions[0].tileTargets,
            );
            // Second filter should remain unchanged
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);
            // Third filter should be new
            expect(result[2]).toEqual(overrides[1]);
        });

        it('should handle empty overrides array', () => {
            const overrides: DashboardFilterRule[] = [];
            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );
            expect(result).toEqual(baseDashboardFilters.dimensions);
        });

        it('should handle overrides with complex tileTargets', () => {
            const complexTileTargets: Record<string, DashboardTileTarget> = {
                'tile-1': {
                    fieldId: 'mapped_field',
                    tableName: 'mapped_table',
                    isSqlColumn: true,
                },
                'tile-2': false,
                'tile-3': {
                    fieldId: 'another_field',
                    tableName: 'another_table',
                    fallbackType: DimensionType.STRING,
                },
            };

            const dashboardWithComplexTileTargets: DashboardFilters = {
                ...baseDashboardFilters,
                dimensions: [
                    createBaseDashboardFilter(
                        'complex-filter',
                        'complex_field',
                        'complex_table',
                        ['value'],
                        complexTileTargets,
                    ),
                ],
            };

            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'complex-filter',
                    'complex_field',
                    'complex_table',
                    ['override_value'],
                ),
            ];

            const result = applyDimensionOverrides(
                dashboardWithComplexTileTargets,
                overrides,
            );

            expect(result[0].tileTargets).toEqual(complexTileTargets);
            expect(result[0].values).toEqual(['override_value']);
        });
    });

    describe('when overrides is a DashboardFilters object', () => {
        it('should use dimensions array from DashboardFilters', () => {
            const overrides: DashboardFilters = {
                dimensions: [
                    createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                        ['override_from_object'],
                    ),
                ],
                metrics: [
                    // These should be ignored when applying dimension overrides
                    createOverrideFilter('metric-1', 'revenue', 'orders', [
                        '1000',
                    ]),
                ],
                tableCalculations: [],
            };

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(2);
            expect(result[0].values).toEqual(['override_from_object']);
            expect(result[0].tileTargets).toEqual(
                baseDashboardFilters.dimensions[0].tileTargets,
            );
            // Second filter should remain unchanged
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);
        });

        it('should work with empty dimensions array in DashboardFilters', () => {
            const overrides: DashboardFilters = {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );
            expect(result).toEqual(baseDashboardFilters.dimensions);
        });
    });

    describe('edge cases', () => {
        it('should handle empty dashboard dimensions', () => {
            const emptyDashboard: DashboardFilters = {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };

            const overrides: DashboardFilterRule[] = [
                createOverrideFilter('new-filter', 'field', 'table'),
            ];

            const result = applyDimensionOverrides(emptyDashboard, overrides);
            // New (unmatched) overrides cannot assert requirement metadata.
            expect(result).toEqual(
                overrides.map((o) => ({
                    ...o,
                    required: undefined,
                    requiredGroupId: undefined,
                })),
            );
        });

        it('should handle filters with same id but different field properties', () => {
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                    ),
                    label: 'Completely different label',
                    disabled: true,
                    required: true,
                    singleValue: true,
                    settings: { someCustomSetting: 'value' },
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result[0]).toEqual({
                ...overrides[0],
                tileTargets: baseDashboardFilters.dimensions[0].tileTargets,
                // Saved dashboard owns lock/requirement/category metadata.
                lockedTabUuids:
                    baseDashboardFilters.dimensions[0].lockedTabUuids,
                required: baseDashboardFilters.dimensions[0].required,
                requiredGroupId:
                    baseDashboardFilters.dimensions[0].requiredGroupId,
                categoryLevel: baseDashboardFilters.dimensions[0].categoryLevel,
                parentFieldId: baseDashboardFilters.dimensions[0].parentFieldId,
                excludedValues:
                    baseDashboardFilters.dimensions[0].excludedValues,
                allowedOperators:
                    baseDashboardFilters.dimensions[0].allowedOperators,
                minAllowedDate:
                    baseDashboardFilters.dimensions[0].minAllowedDate,
                maxAllowedDate:
                    baseDashboardFilters.dimensions[0].maxAllowedDate,
            });
        });

        it('should not modify original dashboard filters', () => {
            const originalFilters = cloneDeep(baseDashboardFilters);
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-1',
                    'customers_customer_id',
                    'customers',
                ),
            ];

            applyDimensionOverrides(baseDashboardFilters, overrides);

            expect(baseDashboardFilters).toEqual(originalFilters);
        });

        it('should handle filters with different operator types', () => {
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                    ),
                    operator: FilterOperator.NULL,
                    values: undefined, // NULL operator doesn't need values
                },
                {
                    ...createOverrideFilter('filter-5', 'date_field', 'events'),
                    operator: FilterOperator.IN_THE_PAST,
                    values: [7], // number value for date operations
                    settings: {
                        unitOfTime: 'days',
                        completed: true,
                    },
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result[0].operator).toBe(FilterOperator.NULL);
            expect(result[0].values).toBeUndefined();
            expect(result[2].operator).toBe(FilterOperator.IN_THE_PAST);
            expect(result[2].settings).toEqual({
                unitOfTime: 'days',
                completed: true,
            });
        });

        it('should preserve all properties from original tileTargets', () => {
            const complexDashboard: DashboardFilters = {
                dimensions: [
                    {
                        ...createBaseDashboardFilter(
                            'filter-1',
                            'field',
                            'table',
                        ),
                        tileTargets: {
                            'tile-1': {
                                fieldId: 'mapped_field',
                                tableName: 'mapped_table',
                                isSqlColumn: true,
                                fallbackType: DimensionType.NUMBER,
                            },
                        },
                    },
                ],
                metrics: [],
                tableCalculations: [],
            };

            const overrides: DashboardFilterRule[] = [
                createOverrideFilter('filter-1', 'field', 'table'),
            ];

            const result = applyDimensionOverrides(complexDashboard, overrides);

            expect(result[0].tileTargets).toEqual({
                'tile-1': {
                    fieldId: 'mapped_field',
                    tableName: 'mapped_table',
                    isSqlColumn: true,
                    fallbackType: 'number',
                },
            });
        });
    });

    describe('real-world scenarios', () => {
        it('should handle scheduler filter overrides scenario', () => {
            // Simulating a scenario where scheduled reports override dashboard filters
            const schedulerOverrides: DashboardFilterRule[] = [
                {
                    id: 'filter-1',
                    label: 'Scheduled Customer Filter',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'customers_customer_id',
                        tableName: 'customers',
                    },
                    disabled: false,
                    values: ['scheduled_customer_123'],
                },
                {
                    id: 'scheduler-date-filter',
                    label: 'Last 30 Days',
                    operator: FilterOperator.IN_THE_PAST,
                    target: {
                        fieldId: 'orders_created_date',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: [30],
                    settings: {
                        unitOfTime: 'days',
                        completed: true,
                    },
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                schedulerOverrides,
            );

            expect(result).toHaveLength(3);
            // Override should be applied
            expect(result[0].values).toEqual(['scheduled_customer_123']);
            expect(result[0].label).toBe('Scheduled Customer Filter');
            expect(result[0].tileTargets).toEqual(
                baseDashboardFilters.dimensions[0].tileTargets,
            );

            // Original filter should remain
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);

            // New scheduler filter should be added
            expect(result[2]).toEqual(schedulerOverrides[1]);
        });

        it('should handle URL parameter override scenario', () => {
            // Simulating URL parameters overriding dashboard filters
            const urlOverrides: DashboardFilterRule[] = [
                {
                    id: 'filter-2',
                    label: 'Orders Status (from URL)',
                    operator: FilterOperator.INCLUDE,
                    target: {
                        fieldId: 'orders_status',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: ['completed', 'shipped', 'delivered'],
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                urlOverrides,
            );

            expect(result).toHaveLength(2);
            expect(result[1].operator).toBe(FilterOperator.INCLUDE);
            expect(result[1].values).toEqual([
                'completed',
                'shipped',
                'delivered',
            ]);
            expect(result[1].tileTargets).toEqual(
                baseDashboardFilters.dimensions[1].tileTargets,
            );
        });
    });

    describe('saved-owned date constraint metadata (P0-2 backfill)', () => {
        const createSavedRollingDateFilter = (): DashboardFilterRule => ({
            id: 'filter-date',
            label: 'Order month',
            operator: FilterOperator.IN_BETWEEN,
            target: {
                fieldId: 'orders_created_month',
                tableName: 'orders',
            },
            disabled: false,
            values: ['2025-01-01', '2025-06-30'],
            dateRangeGranularity: TimeFrames.MONTH,
            minAllowedDate: '2024-01-01',
            maxAllowedDate: '2025-06-30',
            enableDynamicMaxAllowedDate: true,
            rollingMinAllowedMonths: 24,
            settings: {
                dateRange: {
                    mode: 'dynamic',
                    start: {
                        direction: 'ago',
                        count: 24,
                        unit: UnitOfTime.months,
                    },
                    end: {
                        direction: 'ago',
                        count: 1,
                        unit: UnitOfTime.months,
                    },
                },
            },
        });

        it('keeps saved settings/constraints/granularity/rolling when the override only carries values', () => {
            const saved: DashboardFilters = {
                dimensions: [createSavedRollingDateFilter()],
                metrics: [],
                tableCalculations: [],
            };
            const overrides: DashboardFilterRule[] = [
                {
                    id: 'filter-date',
                    label: 'Order month (from URL)',
                    operator: FilterOperator.IN_BETWEEN,
                    target: {
                        fieldId: 'orders_created_month',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: ['2025-02-01', '2025-05-31'],
                },
            ];

            const result = applyDimensionOverrides(saved, overrides);

            expect(result[0].values).toEqual(['2025-02-01', '2025-05-31']);
            expect(result[0].settings).toEqual(
                createSavedRollingDateFilter().settings,
            );
            expect(result[0].enableDynamicMaxAllowedDate).toBe(true);
            expect(result[0].dateRangeGranularity).toBe(TimeFrames.MONTH);
            expect(result[0].rollingMinAllowedMonths).toBe(24);
            expect(result[0].minAllowedDate).toBe('2024-01-01');
            expect(result[0].maxAllowedDate).toBe('2025-06-30');
        });

        it('restores saved metadata when a matched override tries to change it', () => {
            const savedFilter = createSavedRollingDateFilter();
            const saved: DashboardFilters = {
                dimensions: [savedFilter],
                metrics: [],
                tableCalculations: [],
            };
            const overrides: DashboardFilterRule[] = [
                {
                    id: 'filter-date',
                    label: 'Hostile override',
                    operator: FilterOperator.IN_BETWEEN,
                    target: {
                        fieldId: 'orders_created_month',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: ['2020-01-01', '2030-01-01'],
                    dateRangeGranularity: TimeFrames.DAY,
                    minAllowedDate: '2019-01-01',
                    maxAllowedDate: '2031-01-01',
                    enableDynamicMaxAllowedDate: false,
                    rollingMinAllowedMonths: 999,
                    settings: {
                        dateRange: { mode: 'fixed' },
                    },
                },
            ];

            const result = applyDimensionOverrides(saved, overrides);

            expect(result[0].values).toEqual(['2020-01-01', '2030-01-01']);
            expect(result[0].settings).toEqual(savedFilter.settings);
            expect(result[0].enableDynamicMaxAllowedDate).toBe(true);
            expect(result[0].dateRangeGranularity).toBe(TimeFrames.MONTH);
            expect(result[0].rollingMinAllowedMonths).toBe(24);
            expect(result[0].minAllowedDate).toBe('2024-01-01');
            expect(result[0].maxAllowedDate).toBe('2025-06-30');
        });

        it('lets the override keep value-carrying settings while saved dynamic defaults win', () => {
            const saved: DashboardFilters = {
                dimensions: [createSavedRollingDateFilter()],
                metrics: [],
                tableCalculations: [],
            };
            const overrides: DashboardFilterRule[] = [
                {
                    id: 'filter-date',
                    label: 'Mixed settings override',
                    operator: FilterOperator.IN_BETWEEN,
                    target: {
                        fieldId: 'orders_created_month',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: ['2025-02-01', '2025-05-31'],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        completed: true,
                        dateRange: { mode: 'fixed' },
                    },
                },
            ];

            const result = applyDimensionOverrides(saved, overrides);

            expect(result[0].settings).toEqual({
                unitOfTime: UnitOfTime.days,
                completed: true,
                dateRange: createSavedRollingDateFilter().settings?.dateRange,
            });
        });

        it('drops override dynamic defaults when the saved rule has none', () => {
            const saved: DashboardFilters = {
                dimensions: [
                    {
                        ...createBaseDashboardFilter(
                            'filter-1',
                            'customers_customer_id',
                            'customers',
                            ['123'],
                        ),
                    },
                ],
                metrics: [],
                tableCalculations: [],
            };
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                        ['789'],
                    ),
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        dateRange: { mode: 'dynamic' },
                        singleDate: { mode: 'dynamic' },
                    },
                },
            ];

            const result = applyDimensionOverrides(saved, overrides);

            // Value-carrying settings survive; injected dynamic defaults do not.
            expect(result[0].settings).toEqual({
                unitOfTime: UnitOfTime.days,
            });
        });

        it('strips constraint metadata from overrides that match no saved filter', () => {
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'injected-filter',
                        'orders_country',
                        'orders',
                    ),
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2020-01-01', '2030-01-01'],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        dateRange: { mode: 'dynamic' },
                    },
                    minAllowedDate: '2019-01-01',
                    maxAllowedDate: '2031-01-01',
                    enableDynamicMaxAllowedDate: true,
                    dateRangeGranularity: TimeFrames.MONTH,
                    rollingMinAllowedMonths: 24,
                    excludedValues: ['secret'],
                    allowedOperators: [FilterOperator.EQUALS],
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            const appended = result[result.length - 1];
            expect(appended.target.fieldId).toBe('orders_country');
            // Value-carrying settings survive; dynamic defaults are stripped.
            expect(appended.settings).toEqual({
                unitOfTime: UnitOfTime.days,
            });
            expect(appended.minAllowedDate).toBeUndefined();
            expect(appended.maxAllowedDate).toBeUndefined();
            expect(appended.enableDynamicMaxAllowedDate).toBeUndefined();
            expect(appended.dateRangeGranularity).toBeUndefined();
            expect(appended.rollingMinAllowedMonths).toBeUndefined();
            expect(appended.excludedValues).toBeUndefined();
            expect(appended.allowedOperators).toBeUndefined();
            expect(appended.required).toBeUndefined();
            expect(appended.requiredGroupId).toBeUndefined();
            expect(appended.clearable).toBeUndefined();
        });

        describe('settings merge (P2-1)', () => {
            it('keeps saved-only unitOfTime/completed for a values-only override', () => {
                const saved: DashboardFilters = {
                    dimensions: [
                        {
                            id: 'filter-relative',
                            label: 'Created at',
                            operator: FilterOperator.IN_THE_PAST,
                            target: {
                                fieldId: 'orders_created_at',
                                tableName: 'orders',
                            },
                            disabled: false,
                            values: [12],
                            settings: {
                                unitOfTime: UnitOfTime.months,
                                completed: false,
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                };
                // 文档 §4.4/D2 声明的合法 override 形态：只带 values/operator
                const overrides: DashboardFilterRule[] = [
                    {
                        id: 'filter-relative',
                        label: 'Created at (from URL)',
                        operator: FilterOperator.IN_THE_PAST,
                        target: {
                            fieldId: 'orders_created_at',
                            tableName: 'orders',
                        },
                        disabled: false,
                        values: [6],
                    },
                ];

                const result = applyDimensionOverrides(saved, overrides);

                // 修复前：override 为基底导致 settings=undefined，saved 的
                // 「近 6 个月」被 compiler 默认成「近 6 天」
                expect(result[0].settings).toEqual({
                    unitOfTime: UnitOfTime.months,
                    completed: false,
                });
                expect(result[0].values).toEqual([6]);
            });

            it('lets the override win on value-carrying settings conflicts', () => {
                const saved: DashboardFilters = {
                    dimensions: [
                        {
                            id: 'filter-relative',
                            label: 'Created at',
                            operator: FilterOperator.IN_THE_PAST,
                            target: {
                                fieldId: 'orders_created_at',
                                tableName: 'orders',
                            },
                            disabled: false,
                            values: [12],
                            settings: {
                                unitOfTime: UnitOfTime.months,
                                completed: false,
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                };
                const overrides: DashboardFilterRule[] = [
                    {
                        id: 'filter-relative',
                        label: 'Created at (scheduler)',
                        operator: FilterOperator.IN_THE_PAST,
                        target: {
                            fieldId: 'orders_created_at',
                            tableName: 'orders',
                        },
                        disabled: false,
                        values: [30],
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: true,
                        },
                    },
                ];

                const result = applyDimensionOverrides(saved, overrides);

                expect(result[0].settings).toEqual({
                    unitOfTime: UnitOfTime.days,
                    completed: true,
                });
            });

            it('drops the saved dynamic dateRange when the override changes the operator to EQUALS', () => {
                const saved: DashboardFilters = {
                    dimensions: [
                        {
                            ...createSavedRollingDateFilter(),
                            id: 'filter-date',
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                };
                const overrides: DashboardFilterRule[] = [
                    {
                        id: 'filter-date',
                        label: 'Exact day (from URL)',
                        operator: FilterOperator.EQUALS,
                        target: {
                            fieldId: 'orders_created_month',
                            tableName: 'orders',
                        },
                        disabled: false,
                        values: ['2026-01-01'],
                    },
                ];

                const result = applyDimensionOverrides(saved, overrides);

                // 修复前：operator 已改 EQUALS 仍回填动态 dateRange，prepare 会把
                // 默认值解析成 2 个日期，而 EQUALS 只要 1 个值
                expect(result[0].operator).toBe(FilterOperator.EQUALS);
                expect(result[0].settings).toBeUndefined();
            });

            it('keeps the saved dynamic dateRange when the override stays IN_BETWEEN', () => {
                const saved: DashboardFilters = {
                    dimensions: [createSavedRollingDateFilter()],
                    metrics: [],
                    tableCalculations: [],
                };
                const overrides: DashboardFilterRule[] = [
                    {
                        id: 'filter-date',
                        label: 'Narrower window (from URL)',
                        operator: FilterOperator.IN_BETWEEN,
                        target: {
                            fieldId: 'orders_created_month',
                            tableName: 'orders',
                        },
                        disabled: false,
                        values: ['2025-02-01', '2025-05-31'],
                    },
                ];

                const result = applyDimensionOverrides(saved, overrides);

                expect(result[0].settings).toEqual(
                    createSavedRollingDateFilter().settings,
                );
            });

            it('backfills the saved dynamic singleDate for an EQUALS override', () => {
                const saved: DashboardFilters = {
                    dimensions: [
                        {
                            id: 'filter-single',
                            label: 'Order month',
                            operator: FilterOperator.EQUALS,
                            target: {
                                fieldId: 'orders_created_month',
                                tableName: 'orders',
                            },
                            disabled: false,
                            values: ['2026-01'],
                            settings: {
                                singleDate: {
                                    mode: 'dynamic',
                                    preset: 'lastAvailableMonth',
                                },
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                };
                const overrides: DashboardFilterRule[] = [
                    {
                        id: 'filter-single',
                        label: 'Order month (from URL)',
                        operator: FilterOperator.EQUALS,
                        target: {
                            fieldId: 'orders_created_month',
                            tableName: 'orders',
                        },
                        disabled: false,
                        values: ['2026-02'],
                    },
                ];

                const result = applyDimensionOverrides(saved, overrides);

                expect(result[0].settings).toEqual({
                    singleDate: {
                        mode: 'dynamic',
                        preset: 'lastAvailableMonth',
                    },
                });
            });
        });
    });

    describe('viewer interaction policy (clearable)', () => {
        it('keeps the saved clearable policy when an override tries to change it', () => {
            const saved: DashboardFilters = {
                dimensions: [
                    {
                        ...createBaseDashboardFilter(
                            'filter-1',
                            'customers_customer_id',
                            'customers',
                            ['123'],
                        ),
                        clearable: false,
                    },
                ],
                metrics: [],
                tableCalculations: [],
            };
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                        ['789'],
                    ),
                    clearable: true,
                },
            ];

            const result = applyDimensionOverrides(saved, overrides);

            // The saved dashboard owns the interaction policy; the override
            // only carries value/operator.
            expect(result[0].clearable).toBe(false);
            expect(result[0].values).toEqual(['789']);
        });

        it('strips clearable from overrides that match no saved filter', () => {
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'new-filter',
                        'orders_country',
                        'orders',
                    ),
                    clearable: false,
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            const appended = result[result.length - 1];
            expect(appended.target.fieldId).toBe('orders_country');
            expect(appended.clearable).toBeUndefined();
            expect(appended.required).toBeUndefined();
            expect(appended.requiredGroupId).toBeUndefined();
        });
    });
});

// CoderService.test.ts
import {
    AnyType,
    DashboardDAO,
    DashboardFilterRule,
    DashboardTileTarget,
    DashboardTileTypes,
    FilterOperator,
} from '@lightdash/common';
import { CoderService } from './CoderService';
import {
    getFiltersWithLocalLockedTabs,
    resolveDashboardTabs,
} from './dashboardAsCodeReferences';

describe('CoderService', () => {
    describe('getFiltersWithTileSlugs', () => {
        it('should convert tile UUIDs to slugs in filters', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'uuid-1': {
                                    fieldId: 'field-1',
                                } as DashboardTileTarget,
                                'uuid-2': {
                                    fieldId: 'field-2',
                                } as DashboardTileTarget,
                            },
                        },
                    ],
                },
                tiles: [
                    {
                        uuid: 'uuid-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'slug-1' },
                    },
                    {
                        uuid: 'uuid-2',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'slug-2' },
                    },
                    {
                        uuid: 'uuid-3',
                        type: DashboardTileTypes.MARKDOWN,
                        properties: {},
                    },
                ],
            } as AnyType; // Use 'as any' to bypass type checks for simplicity

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule).tileTargets,
            ).toEqual({
                'slug-1': { fieldId: 'field-1' },
                'slug-2': { fieldId: 'field-2' },
            });
        });

        it('should handle filters with no tile targets', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {},
                        },
                    ],
                },
                tiles: [],
            } as AnyType;

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule).tileTargets,
            ).toEqual({});
        });

        it('should skip tile targets with no matching slug', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'uuid-1': {
                                    fieldId: 'field-1',
                                } as DashboardTileTarget,
                            },
                        },
                    ],
                },
                tiles: [],
            } as AnyType;

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule).tileTargets,
            ).toEqual({});
        });

        it('preserves hideTilesWhenEmpty when converting tile refs', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            hideTilesWhenEmpty: true,
                            tileTargets: {
                                'uuid-1': {
                                    fieldId: 'field-1',
                                } as DashboardTileTarget,
                            },
                        },
                    ],
                },
                tiles: [
                    {
                        uuid: 'uuid-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'slug-1' },
                    },
                ],
            } as AnyType;

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule)
                    .hideTilesWhenEmpty,
            ).toBe(true);
        });
    });

    describe('getFiltersWithTileUuids', () => {
        it('should convert tile slugs to UUIDs in filters', () => {
            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'chart-slug-1': {
                                    someTargetProperty: 'value1',
                                },
                                'chart-slug-2': {
                                    someTargetProperty: 'value2',
                                },
                            },
                        },
                    ],
                },
                // ... other properties
            };

            const tilesWithUuids = [
                {
                    uuid: 'uuid-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-1' },
                },
                {
                    uuid: 'uuid-2',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-2' },
                },
                {
                    uuid: 'uuid-3',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: {},
                },
            ];

            const result = CoderService.getFiltersWithTileUuids(
                dashboardAsCode as AnyType,
                tilesWithUuids as AnyType,
            );

            expect(result.dimensions[0].tileTargets).toEqual({
                'uuid-1': { someTargetProperty: 'value1' },
                'uuid-2': { someTargetProperty: 'value2' },
            });
            expect(typeof result.dimensions[0].id).toBe('string'); // uuid
            expect(result.dimensions[0].id.length).toBeGreaterThan(1);
        });

        it('should log an error if a tile slug does not match any UUID', () => {
            console.error = jest.fn();

            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'chart-slug-1': {
                                    someTargetProperty: 'value1',
                                },
                                'chart-slug-3': {
                                    someTargetProperty: 'value3',
                                },
                            },
                        },
                    ],
                },
                // ... other properties
            };

            const tilesWithUuids = [
                {
                    uuid: 'uuid-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-1' },
                },
                {
                    uuid: 'uuid-2',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-2' },
                },
                {
                    uuid: 'uuid-3',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: {},
                },
            ];

            const result = CoderService.getFiltersWithTileUuids(
                dashboardAsCode as AnyType,
                tilesWithUuids as AnyType,
            );

            // We show an error for chart-slug-2
            expect(console.error).toHaveBeenCalledWith(
                'Tile with slug chart-slug-3 not found in tilesWithUuids',
            );
            // but chart-slug-1 should be fine
            expect(result.dimensions[0].tileTargets).toEqual({
                'uuid-1': {
                    someTargetProperty: 'value1',
                },
            });
        });

        it('preserves hideTilesWhenEmpty when converting tile refs', () => {
            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            hideTilesWhenEmpty: true,
                            tileTargets: {
                                'chart-slug-1': {
                                    someTargetProperty: 'value1',
                                },
                            },
                        },
                    ],
                },
            };
            const tilesWithUuids = [
                {
                    uuid: 'uuid-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-1' },
                },
            ];

            const result = CoderService.getFiltersWithTileUuids(
                dashboardAsCode as AnyType,
                tilesWithUuids as AnyType,
            );

            expect(result.dimensions[0].hideTilesWhenEmpty).toBe(true);
        });
    });

    describe('transformChart / transformDashboard null normalization', () => {
        const spaces = [{ uuid: 'space-1', path: 'root.space_1' }];

        it('transformChart emits no description key for null descriptions', () => {
            const chart = {
                name: 'Chart',
                description: null,
                tableName: 'orders',
                updatedAt: new Date(),
                metricQuery: {},
                chartConfig: {},
                pivotConfig: undefined,
                dashboardUuid: null,
                slug: 'chart-slug',
                tableConfig: { columnOrder: [] },
                spaceUuid: 'space-1',
                parameters: undefined,
                merge: null,
            };

            const result = (CoderService as AnyType).transformChart(
                chart,
                spaces,
                {},
            );

            // undefined values are dropped by JSON.stringify / yaml.dump,
            // so the downloaded file contains no `description:` line
            expect(result.description).toBeUndefined();
        });

        it('transformDashboard emits no config/description keys for null values', () => {
            const dashboard = {
                name: 'Dashboard',
                description: null,
                updatedAt: new Date(),
                slug: 'dashboard-slug',
                spaceUuid: 'space-1',
                config: null,
                tiles: [],
                tabs: [{ uuid: 'tab-1', name: 'Overview', order: 0 }],
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                parameters: undefined,
                owner: null,
            };

            const result = (CoderService as AnyType).transformDashboard(
                dashboard,
                spaces,
            );

            // undefined values are dropped by JSON.stringify / yaml.dump,
            // so the downloaded file contains no `config:` / `description:` lines
            expect(result.config).toBeUndefined();
            expect(result.description).toBeUndefined();
        });
    });
});

describe('fork filter fields survive the as-code round-trip', () => {
    /* Every fork-specific dashboard filter capability in one rule: required
     * groups, dynamic/static range limits, operator allow-lists, cross-scope
     * tab cascade and the visibility flags. */
    const forkRule = {
        id: 'filter-1',
        label: '状态',
        operator: FilterOperator.EQUALS,
        target: { fieldId: 'orders_status', tableName: 'orders' },
        values: ['completed'],
        settings: { isCurrency: false },
        disabled: false,
        required: true,
        requiredGroupId: 'group-1',
        clearable: false,
        dataAvailableFromDay: 5,
        rollingMinAllowedMonths: 3,
        enableDynamicMaxAllowedDate: true,
        minAllowedDate: '2024-01-01',
        maxAllowedDate: '2025-12-31',
        allowedOperators: [FilterOperator.EQUALS],
        excludedValues: ['cancelled'],
        parentFieldId: 'orders_status',
        parentScope: 'tab',
        parentTabUuid: 'overview-uuid',
        categoryLevel: 2,
        singleValue: true,
        hideTilesWhenEmpty: true,
        hidden: false,
        readOnly: true,
        lockedTabUuids: ['overview-uuid'],
        tileTargets: { 'tile-1': { fieldId: 'orders_status' } },
    };

    const forkFieldNames = [
        'label',
        'settings',
        'disabled',
        'required',
        'requiredGroupId',
        'clearable',
        'dataAvailableFromDay',
        'rollingMinAllowedMonths',
        'enableDynamicMaxAllowedDate',
        'minAllowedDate',
        'maxAllowedDate',
        'allowedOperators',
        'excludedValues',
        'parentFieldId',
        'parentScope',
        'categoryLevel',
        'singleValue',
        'hideTilesWhenEmpty',
        'hidden',
        'readOnly',
        'operator',
        'target',
        'values',
    ] as const;

    const dashboard = {
        tabs: [
            { uuid: 'overview-uuid', name: 'Overview', order: 0 },
            { uuid: 'revenue-uuid', name: 'Revenue', order: 1 },
        ],
        tiles: [
            {
                uuid: 'tile-1',
                type: DashboardTileTypes.SAVED_CHART,
                properties: { chartSlug: 'chart-a' },
            },
        ],
        filters: {
            dimensions: [forkRule],
            metrics: [],
            tableCalculations: [],
        },
    } as AnyType;

    const expectForkFields = (rule: AnyType) => {
        forkFieldNames.forEach((field) => {
            expect([field, rule[field]]).toEqual([field, forkRule[field]]);
        });
    };

    it('keeps every fork field on download and exports refs as slugs', () => {
        const exported = CoderService.getFiltersWithTileSlugs(dashboard);
        const rule = exported.dimensions[0] as AnyType;

        expectForkFields(rule);
        expect(rule.id).toBeUndefined();
        expect(rule.lockedTabUuids).toEqual(['overview']);
        expect(rule.parentTabUuid).toBe('overview');
        expect(rule.tileTargets).toEqual({
            'chart-a': { fieldId: 'orders_status' },
        });
    });

    it('restores every fork field on upload and rebuilds local refs', () => {
        const exported = CoderService.getFiltersWithTileSlugs(dashboard);
        const tilesWithUuids = [
            {
                uuid: 'tile-uuid-1',
                tileSlug: 'chart-a',
                type: DashboardTileTypes.SAVED_CHART,
                properties: { chartSlug: 'chart-a' },
            },
        ];
        const resolvedTabs = resolveDashboardTabs(
            [
                { slug: 'overview', name: 'Overview', order: 0 },
                { slug: 'revenue', name: 'Revenue', order: 1 },
            ],
            dashboard.tabs,
        );

        // Same composition as CoderService.upsertDashboard
        const imported = getFiltersWithLocalLockedTabs(
            CoderService.getFiltersWithTileUuids(
                { filters: exported } as AnyType,
                tilesWithUuids as AnyType,
            ),
            resolvedTabs,
            [],
        );
        const rule = imported.dimensions[0] as AnyType;

        expectForkFields(rule);
        expect(rule.id).toBeTruthy();
        expect(rule.lockedTabUuids).toEqual(['overview-uuid']);
        expect(rule.parentTabUuid).toBe('overview-uuid');
        expect(rule.tileTargets).toEqual({
            'tile-uuid-1': { fieldId: 'orders_status' },
        });
    });

    it('keeps every fork field on tab-level filters in both directions', () => {
        const tabsWithFilters = [
            {
                uuid: 'overview-uuid',
                name: 'Overview',
                order: 0,
                filters: {
                    dimensions: [forkRule],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        ];
        const tabDashboard = { ...dashboard, tabs: tabsWithFilters } as AnyType;

        const exportedTabs = CoderService.getTabFiltersWithTileSlugs(
            tabDashboard,
            tabsWithFilters as AnyType,
        );
        const exportedRule = (exportedTabs[0] as AnyType).filters.dimensions[0];
        expectForkFields(exportedRule);
        expect(exportedRule.parentTabUuid).toBe('overview');
        expect(exportedRule.lockedTabUuids).toEqual(['overview']);

        const importedTabs = CoderService.getTabFiltersWithTileUuids(
            {
                tabs: exportedTabs,
            } as AnyType,
            [
                {
                    uuid: 'tile-uuid-1',
                    tileSlug: 'chart-a',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-a' },
                },
            ] as AnyType,
            tabsWithFilters as AnyType,
        );
        const importedRule = (importedTabs[0] as AnyType).filters.dimensions[0];
        expectForkFields(importedRule);
        expect(importedRule.parentTabUuid).toBe('overview-uuid');
        expect(importedRule.lockedTabUuids).toEqual(['overview-uuid']);
        expect(importedRule.tileTargets).toEqual({
            'tile-uuid-1': { fieldId: 'orders_status' },
        });
    });
});

describe('table chart grouping, pagination and sorting survive as-code', () => {
    /* One chart carrying every fork table capability: row grouping,
     * warehouse pagination, per-column props, conditional formatting,
     * pivot grouping and multi-key sorting. */
    const tableChartConfig = {
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
                revenue: { visible: false },
            },
            conditionalFormattings: [
                {
                    target: { fieldId: 'revenue' },
                    color: '#ff0000',
                    rules: [],
                },
            ],
        },
    };

    const metricQuery = {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['revenue'],
        filters: {},
        sorts: [
            { fieldId: 'revenue', descending: true, nullsFirst: false },
            { fieldId: 'orders_status', descending: false, valueOrder: [] },
        ],
        limit: 500,
        offset: 100,
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
        timezone: 'Asia/Shanghai',
    };

    const chart = {
        name: 'Chart',
        description: null,
        tableName: 'orders',
        updatedAt: new Date(),
        metricQuery,
        chartConfig: tableChartConfig,
        tableConfig: { columnOrder: ['orders_status', 'revenue'] },
        pivotConfig: { columns: ['orders_status'] },
        parameters: { param1: { parameterName: 'p1', value: 'x' } },
        merge: null,
        dashboardUuid: null,
        slug: 'chart-slug',
        spaceUuid: 'space-1',
        colorPalette: [],
        isPrivate: false,
        access: [],
    };

    const spaces = [{ uuid: 'space-1', path: 'root.space_1' }];

    it('downloads every grouping/pagination/sorting field verbatim', () => {
        const result = (CoderService as AnyType).transformChart(
            chart,
            spaces,
            {},
        );

        expect(result.chartConfig).toEqual(tableChartConfig);
        expect(result.chartConfig.config.enablePagination).toBe(true);
        expect(result.chartConfig.config.pageSize).toBe(25);
        expect(result.chartConfig.config.showRowGrouping).toBe(true);
        expect(result.chartConfig.config.columns.orders_status.frozen).toBe(
            true,
        );
        expect(result.chartConfig.config.columns.orders_status.width).toBe(120);
        expect(result.chartConfig.config.conditionalFormattings).toHaveLength(
            1,
        );
        expect(result.metricQuery.sorts).toEqual(metricQuery.sorts);
        expect(result.metricQuery.limit).toBe(500);
        expect(result.metricQuery.offset).toBe(100);
        expect(result.pivotConfig).toEqual({ columns: ['orders_status'] });
        expect(result.parameters).toEqual(chart.parameters);
        expect(result.tableConfig).toEqual(chart.tableConfig);
    });
});

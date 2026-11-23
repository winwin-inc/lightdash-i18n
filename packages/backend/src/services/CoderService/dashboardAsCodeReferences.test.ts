import {
    AnyType,
    DashboardTileTypes,
    FilterOperator,
    type DashboardDAO,
} from '@lightdash/common';
import {
    applyResolvedTabUuidsToTiles,
    getConfigWithLocalRefs,
    getConfigWithPortableRefs,
    getDashboardTabBaseSlug,
    getDashboardTabSlug,
    getFiltersWithLocalLockedTabs,
    getFiltersWithPortableLockedTabs,
    resolveDashboardTabs,
    resolveTabUuid,
    toAsCodeTabs,
} from './dashboardAsCodeReferences';

const dashboard: Pick<DashboardDAO, 'tabs'> = {
    tabs: [
        { uuid: 'overview-uuid', name: 'Overview', order: 0 },
        { uuid: 'revenue-costs-uuid', name: 'Revenue / Costs', order: 1 },
        {
            uuid: 'revenue-costs-duplicate-uuid',
            name: 'Revenue - Costs',
            order: 2,
        },
        { uuid: 'chinese-uuid', name: '销售分析', order: 3 },
    ],
};

describe('dashboardAsCodeReferences', () => {
    describe('getDashboardTabSlug', () => {
        it('derives a slug from the tab name', () => {
            expect(
                getDashboardTabBaseSlug({ name: 'Overview', order: 0 }),
            ).toBe('overview');
            expect(getDashboardTabSlug(dashboard, 'overview-uuid')).toBe(
                'overview',
            );
        });

        it('suffixes duplicate names starting at -1', () => {
            expect(getDashboardTabSlug(dashboard, 'revenue-costs-uuid')).toBe(
                'revenue-costs-1',
            );
            expect(
                getDashboardTabSlug(dashboard, 'revenue-costs-duplicate-uuid'),
            ).toBe('revenue-costs-2');
        });

        it('falls back to tab-n for non-latin names', () => {
            expect(
                getDashboardTabBaseSlug({ name: '销售分析', order: 3 }),
            ).toBe('tab-4');
            expect(getDashboardTabSlug(dashboard, 'chinese-uuid')).toBe(
                'tab-4',
            );
        });
    });

    describe('resolveDashboardTabs', () => {
        it('reuses existing tabs by uuid then slug', () => {
            const resolved = resolveDashboardTabs(
                [
                    { uuid: 'overview-uuid', name: 'Overview', order: 0 },
                    {
                        slug: 'revenue-costs-1',
                        name: 'Revenue / Costs',
                        order: 1,
                    },
                    { name: 'New tab', order: 2 },
                ],
                dashboard.tabs,
            );

            expect(resolved[0].uuid).toBe('overview-uuid');
            expect(resolved[0].slug).toBe('overview');
            expect(resolved[1].uuid).toBe('revenue-costs-uuid');
            expect(resolved[1].slug).toBe('revenue-costs-1');
            expect(resolved[2].slug).toBe('new-tab');
            expect(resolved[2].uuid).not.toBe('overview-uuid');
        });

        it('never resolves two incoming tabs to the same uuid when slugs drifted between environments', () => {
            // Real-world scenario: a new tab was inserted in the source
            // environment, shifting every following slug. The target still
            // has 类目范围 on slug tab-10 while the incoming yaml has it on
            // tab-11 (keeping its original uuid tab-10-uuid).
            const drifted: Pick<DashboardDAO, 'tabs'> = {
                tabs: [
                    { uuid: 'overview-uuid', name: 'Overview', order: 0 },
                    { uuid: 'scope-uuid', name: '类目范围', order: 9 },
                ],
            };
            // 类目范围 (order 9) derives slug tab-10
            expect(getDashboardTabSlug(drifted, 'scope-uuid')).toBe('tab-10');

            const warnings: string[] = [];
            const resolved = resolveDashboardTabs(
                [
                    // new tab took over slug tab-10, unknown uuid
                    { slug: 'tab-10', name: '指标说明', order: 9 },
                    // 类目范围 moved to tab-11 but keeps its uuid
                    {
                        slug: 'tab-11',
                        uuid: 'scope-uuid',
                        name: '类目范围',
                        order: 10,
                    },
                ],
                drifted.tabs,
                warnings,
            );

            const uuids = resolved.map((tab) => tab.uuid);
            expect(new Set(uuids).size).toBe(uuids.length);
            // the strong uuid match keeps the existing tab identity
            expect(resolved[1].uuid).toBe('scope-uuid');
            // the slug fallback must not steal the same uuid
            expect(resolved[0].uuid).not.toBe('scope-uuid');
            expect(resolved[0].slug).toBe('tab-10');
            expect(resolved[1].slug).toBe('tab-11');
            expect(warnings.some((warning) => warning.includes('指标说明'))).toBe(
                true,
            );
        });

        it('keeps plain slug fallback working without warnings', () => {
            const warnings: string[] = [];
            const resolved = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview renamed', order: 0 }],
                dashboard.tabs,
                warnings,
            );

            expect(resolved[0].uuid).toBe('overview-uuid');
            expect(warnings).toEqual([]);
        });

        it('degrades duplicate incoming uuids to a new tab', () => {
            const warnings: string[] = [];
            const resolved = resolveDashboardTabs(
                [
                    {
                        slug: 'overview',
                        uuid: 'overview-uuid',
                        name: 'Overview',
                        order: 0,
                    },
                    {
                        slug: 'elsewhere',
                        uuid: 'overview-uuid',
                        name: 'Duplicate',
                        order: 1,
                    },
                ],
                dashboard.tabs,
                warnings,
            );

            const uuids = resolved.map((tab) => tab.uuid);
            expect(new Set(uuids).size).toBe(uuids.length);
            expect(resolved[0].uuid).toBe('overview-uuid');
            expect(resolved[1].uuid).not.toBe('overview-uuid');
            expect(warnings.some((warning) => warning.includes('Duplicate'))).toBe(
                true,
            );
        });
    });

    describe('config and locked tab refs', () => {
        const fullDashboard = {
            ...dashboard,
            tiles: [
                {
                    uuid: 'tile-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'revenue-chart' },
                },
            ],
            config: {
                isDateZoomDisabled: false,
                syncChartColors: true,
                tabFilterEnabled: { 'overview-uuid': true },
                showTabAddFilterButton: { 'overview-uuid': false },
                syncChartTileUuids: ['tile-1'],
            },
            filters: {
                dimensions: [
                    {
                        id: 'filter-1',
                        label: undefined,
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        lockedTabUuids: ['overview-uuid'],
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
        } as unknown as DashboardDAO;

        it('exports tab and tile uuids as slugs', () => {
            const config = getConfigWithPortableRefs(
                fullDashboard,
                (tileUuid) =>
                    tileUuid === 'tile-1' ? 'revenue-chart' : undefined,
            );
            expect(config?.tabFilterEnabled).toEqual({ overview: true });
            expect(config?.showTabAddFilterButton).toEqual({ overview: false });
            expect(config?.syncChartTileUuids).toEqual(['revenue-chart']);

            const filters = getFiltersWithPortableLockedTabs(
                fullDashboard,
                fullDashboard.filters,
            );
            expect(filters.dimensions[0].lockedTabUuids).toEqual(['overview']);
        });

        it('exports null config as undefined so YAML omits the field', () => {
            const nullConfigDashboard = {
                ...fullDashboard,
                config: null,
            } as unknown as DashboardDAO;

            expect(
                getConfigWithPortableRefs(nullConfigDashboard, () => undefined),
            ).toBeUndefined();
        });

        it('remaps parentTabUuid as a portable slug and back', () => {
            const exported = getFiltersWithPortableLockedTabs(fullDashboard, {
                dimensions: [
                    {
                        id: 'cascade-1',
                        label: undefined,
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        parentScope: 'tab',
                        parentTabUuid: 'overview-uuid',
                    },
                ],
                metrics: [],
                tableCalculations: [],
            });
            expect(exported.dimensions[0].parentTabUuid).toBe('overview');

            const tabs = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview', order: 0 }],
                dashboard.tabs,
            );
            const warnings: string[] = [];
            const imported = getFiltersWithLocalLockedTabs(
                {
                    dimensions: [
                        {
                            ...(exported.dimensions[0] as AnyType),
                            id: 'cascade-1',
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs,
                warnings,
            );
            expect(imported.dimensions[0].parentTabUuid).toBe('overview-uuid');
            expect(warnings).toEqual([]);
        });

        it('keeps parentTabUuid untouched for global scope or unknown refs', () => {
            const exported = getFiltersWithPortableLockedTabs(fullDashboard, {
                dimensions: [
                    {
                        id: 'global-1',
                        label: undefined,
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        parentScope: 'global',
                        parentTabUuid: 'overview-uuid',
                    },
                    {
                        id: 'stale-1',
                        label: undefined,
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        parentScope: 'tab',
                        parentTabUuid: 'ghost-uuid',
                    },
                ],
                metrics: [],
                tableCalculations: [],
            });
            expect(exported.dimensions[0].parentTabUuid).toBe('overview-uuid');
            expect(exported.dimensions[1].parentTabUuid).toBe('ghost-uuid');
        });

        it('imports slugs back to uuids and warns on unknown refs', () => {
            const warnings: string[] = [];
            const tabs = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview', order: 0 }],
                dashboard.tabs,
            );
            const tiles = [
                {
                    uuid: 'new-tile-uuid',
                    tileSlug: 'revenue-chart',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'revenue-chart' },
                },
            ];
            const config = getConfigWithLocalRefs(
                {
                    isDateZoomDisabled: false,
                    tabFilterEnabled: {
                        overview: true,
                        'missing-tab': true,
                    },
                    showTabAddFilterButton: { overview: false },
                    syncChartTileUuids: ['revenue-chart', 'missing-tile'],
                },
                tabs,
                tiles as never,
                warnings,
            );
            expect(config?.tabFilterEnabled).toEqual({
                'overview-uuid': true,
            });
            expect(config?.showTabAddFilterButton).toEqual({
                'overview-uuid': false,
            });
            expect(config?.syncChartTileUuids).toEqual(['new-tile-uuid']);
            expect(warnings).toEqual(
                expect.arrayContaining([
                    'Skipped tabFilterEnabled entry "missing-tab"',
                    'Skipped syncChartTileUuids entry "missing-tile"',
                ]),
            );

            const filterWarnings: string[] = [];
            const filters = getFiltersWithLocalLockedTabs(
                {
                    dimensions: [
                        {
                            id: 'filter-1',
                            label: undefined,
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                            lockedTabUuids: ['overview', 'ghost-tab'],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs,
                filterWarnings,
            );
            expect(filters.dimensions[0].lockedTabUuids).toEqual([
                'overview-uuid',
            ]);
            expect(filterWarnings).toContain(
                'Skipped lockedTabUuids entry "ghost-tab"',
            );
        });

        it('resolves the parentTabSlug alias to a local tab uuid', () => {
            const warnings: string[] = [];
            const tabs = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview', order: 0 }],
                dashboard.tabs,
            );
            const baseRule = {
                id: 'cascade-1',
                label: undefined,
                target: {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
                parentScope: 'tab',
            };

            const filters = getFiltersWithLocalLockedTabs(
                {
                    dimensions: [
                        {
                            ...baseRule,
                            parentTabSlug: 'overview',
                        } as AnyType,
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs,
                warnings,
            );

            expect(filters.dimensions[0].parentTabUuid).toBe('overview-uuid');
            // The alias is consumed on import and never persisted on the rule.
            expect(
                (filters.dimensions[0] as AnyType).parentTabSlug,
            ).toBeUndefined();
            expect(warnings).toEqual([]);
        });

        it('prefers parentTabUuid over parentTabSlug when both are set', () => {
            const warnings: string[] = [];
            const tabs = resolveDashboardTabs(
                [
                    { slug: 'overview', name: 'Overview', order: 0 },
                    {
                        slug: 'revenue-costs-1',
                        name: 'Revenue / Costs',
                        order: 1,
                    },
                ],
                dashboard.tabs,
            );

            const filters = getFiltersWithLocalLockedTabs(
                {
                    dimensions: [
                        {
                            id: 'cascade-1',
                            label: undefined,
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                            parentScope: 'tab',
                            parentTabUuid: 'revenue-costs-1',
                            parentTabSlug: 'overview',
                        } as AnyType,
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs,
                warnings,
            );

            expect(filters.dimensions[0].parentTabUuid).toBe(
                'revenue-costs-uuid',
            );
            expect(warnings).toEqual([]);
        });

        it('does not resolve the parentTabSlug alias outside tab scope', () => {
            const warnings: string[] = [];
            const tabs = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview', order: 0 }],
                dashboard.tabs,
            );

            const filters = getFiltersWithLocalLockedTabs(
                {
                    dimensions: [
                        {
                            id: 'cascade-1',
                            label: undefined,
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                            parentScope: 'global',
                            parentTabSlug: 'overview',
                        } as AnyType,
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs,
                warnings,
            );

            expect(filters.dimensions[0].parentTabUuid).toBeUndefined();
            expect(warnings).toEqual([]);
        });

        it('keeps an unresolvable parentTabSlug value as-is', () => {
            const warnings: string[] = [];
            const tabs = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview', order: 0 }],
                dashboard.tabs,
            );

            const filters = getFiltersWithLocalLockedTabs(
                {
                    dimensions: [
                        {
                            id: 'cascade-1',
                            label: undefined,
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                            parentScope: 'tab',
                            parentTabSlug: 'ghost-tab',
                        } as AnyType,
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs,
                warnings,
            );

            expect(filters.dimensions[0].parentTabUuid).toBe('ghost-tab');
            expect(warnings).toEqual([]);
        });
    });

    describe('applyResolvedTabUuidsToTiles', () => {
        it('prefers tabSlug over a stale tabUuid', () => {
            const tabs = resolveDashboardTabs(
                [{ slug: 'overview', name: 'Overview', order: 0 }],
                dashboard.tabs,
            );
            const [tile] = applyResolvedTabUuidsToTiles(
                [
                    {
                        uuid: 'tile-1',
                        tileSlug: 'revenue-chart',
                        tabSlug: 'overview',
                        tabUuid: 'stale-uuid',
                    } as never,
                ],
                tabs,
            );
            expect(tile.tabUuid).toBe('overview-uuid');
            expect(resolveTabUuid(tabs, 'overview')).toBe('overview-uuid');
        });
    });

    describe('toAsCodeTabs', () => {
        it('omits empty tab filters so official lint can pass', () => {
            const tabs = toAsCodeTabs(
                { tabs: dashboard.tabs } as DashboardDAO,
                [
                    {
                        uuid: 'overview-uuid',
                        name: 'Overview',
                        order: 0,
                        filters: {
                            dimensions: [],
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                    {
                        uuid: 'revenue-costs-uuid',
                        name: 'Revenue / Costs',
                        order: 1,
                        filters: {
                            dimensions: [
                                {
                                    id: 'keep',
                                    label: undefined,
                                    operator: FilterOperator.EQUALS,
                                    target: {
                                        fieldId: 'orders_status',
                                        tableName: 'orders',
                                    },
                                    values: ['complete'],
                                },
                            ],
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                ],
            );

            expect(tabs[0]).not.toHaveProperty('filters');
            expect(tabs[1]).toHaveProperty('filters');
        });
    });
});

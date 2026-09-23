import {
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

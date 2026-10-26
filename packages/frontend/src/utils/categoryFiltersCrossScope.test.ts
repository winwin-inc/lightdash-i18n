import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import {
    buildCategoryChain,
    clearFieldSearchCacheForTests,
    findParentCategoryEntry,
    getCategoryFiltersSignature,
    initializeCategoryFiltersAsync,
    updateCrossScopeCategoryCascadeAsync,
    type CategoryChain,
} from './categoryFilters';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'dash-slug',
    dashboardName: 'Dash Name',
};

const TAB_UUID = 'tab-1';

const categoryFilter = (
    overrides: Partial<DashboardFilterRule> & {
        id: string;
        fieldId: string;
        categoryLevel: 1 | 2 | 3 | 4;
        values?: string[];
        parentFieldId?: string;
        parentScope?: 'global' | 'tab';
        parentTabUuid?: string;
        disabled?: boolean;
    },
): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: 'dim_categories',
    },
    operator: FilterOperator.EQUALS,
    values: overrides.values,
    label: undefined,
    categoryLevel: overrides.categoryLevel,
    parentFieldId: overrides.parentFieldId,
    parentScope: overrides.parentScope,
    parentTabUuid: overrides.parentTabUuid,
    disabled: overrides.disabled,
});

const asFilters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const mockSearchResults = (results: string[]) => {
    api.mockResolvedValueOnce({
        search: '',
        results,
        cached: false,
        refreshedAt: new Date(),
    } as never);
};

const getRequestBody = (callIndex: number) =>
    JSON.parse(String(api.mock.calls[callIndex][0].body));

describe('categoryFilters cross scope', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
    });

    describe('buildCategoryChain', () => {
        it('puts global filters before tab filters', () => {
            const global = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const tab = categoryFilter({
                id: 't3',
                fieldId: 'cls_3',
                categoryLevel: 3,
                values: ['C1'],
            });

            const chain = buildCategoryChain(
                {
                    globalFilters: asFilters([global]),
                    tabFilters: { [TAB_UUID]: asFilters([tab]) },
                },
                TAB_UUID,
            );

            expect(chain.map((entry) => entry.rule.id)).toEqual(['g1', 't3']);
            expect(chain[0].location).toEqual({
                scope: 'global',
                tabUuid: null,
            });
            expect(chain[1].location).toEqual({
                scope: 'tab',
                tabUuid: TAB_UUID,
            });
        });
    });

    describe('findParentCategoryEntry', () => {
        const globalParent = categoryFilter({
            id: 'g1',
            fieldId: 'cls_1',
            categoryLevel: 1,
            values: ['P1'],
        });
        const tabParent = categoryFilter({
            id: 't1',
            fieldId: 'cls_1',
            categoryLevel: 1,
            values: ['P1'],
        });

        const buildChain = (): CategoryChain =>
            buildCategoryChain(
                {
                    globalFilters: asFilters([globalParent]),
                    tabFilters: { [TAB_UUID]: asFilters([tabParent]) },
                },
                TAB_UUID,
            );

        it('resolves an explicit global parent even when the tab has the same field', () => {
            const child = categoryFilter({
                id: 't2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });

            const parent = findParentCategoryEntry(buildChain(), {
                rule: child,
                location: { scope: 'tab', tabUuid: TAB_UUID },
            });

            expect(parent?.rule.id).toBe('g1');
            expect(parent?.location.scope).toBe('global');
        });

        it('resolves an explicit tab parent in another tab', () => {
            const otherTabParent = categoryFilter({
                id: 't2-other',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const chain: CategoryChain = [
                {
                    rule: globalParent,
                    location: { scope: 'global', tabUuid: null },
                },
                {
                    rule: otherTabParent,
                    location: { scope: 'tab', tabUuid: 'tab-2' },
                },
            ];
            const child = categoryFilter({
                id: 't2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                parentFieldId: 'cls_1',
                parentScope: 'tab',
                parentTabUuid: 'tab-2',
            });

            const parent = findParentCategoryEntry(chain, {
                rule: child,
                location: { scope: 'tab', tabUuid: TAB_UUID },
            });

            expect(parent?.rule.id).toBe('t2-other');
        });

        it('falls back to the same scope and then to global for legacy data', () => {
            const legacyTabChild = categoryFilter({
                id: 't3',
                fieldId: 'cls_2',
                categoryLevel: 2,
                parentFieldId: 'cls_1',
            });

            const sameScope = findParentCategoryEntry(buildChain(), {
                rule: legacyTabChild,
                location: { scope: 'tab', tabUuid: TAB_UUID },
            });
            expect(sameScope?.rule.id).toBe('t1');

            const globalChild = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                parentFieldId: 'cls_1',
            });
            const globalScope = findParentCategoryEntry(buildChain(), {
                rule: globalChild,
                location: { scope: 'global', tabUuid: null },
            });
            expect(globalScope?.rule.id).toBe('g1');
        });

        it('does not allow a parent with an equal or higher level (cycle protection)', () => {
            const child = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 1,
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });

            const parent = findParentCategoryEntry(buildChain(), {
                rule: child,
                location: { scope: 'global', tabUuid: null },
            });

            expect(parent).toBeNull();
        });
    });

    describe('updateCrossScopeCategoryCascadeAsync', () => {
        it('cascades a global level 1 change into the global level 2 filter', async () => {
            mockSearchResults(['C1', 'C2']);

            const g1 = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const g2 = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['OLD'],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });

            const result = await updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([g1, g2]),
                    tabFilters: {},
                },
                g1,
                'P2',
                projectUuid,
                dashboardContext,
            );

            expect(api).toHaveBeenCalledTimes(1);
            expect(result.globalFilters.dimensions[1].values).toEqual(['C1']);
            const body = getRequestBody(0);
            expect(body.filters.and).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        target: expect.objectContaining({ fieldId: 'cls_1' }),
                        values: ['P2'],
                    }),
                ]),
            );
        });

        it('cascades a global level 2 change into the tab level 3 filter', async () => {
            mockSearchResults(['T1', 'T2']);

            const g1 = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const g2 = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['C1'],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });
            const t3 = categoryFilter({
                id: 't3',
                fieldId: 'cls_3',
                categoryLevel: 3,
                values: ['OLD'],
                parentFieldId: 'cls_2',
                parentScope: 'global',
            });

            const result = await updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([g1, g2]),
                    tabFilters: { [TAB_UUID]: asFilters([t3]) },
                },
                g2,
                'C2',
                projectUuid,
                dashboardContext,
            );

            expect(api).toHaveBeenCalledTimes(1);
            expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual([
                'T1',
            ]);
            // 全局父级与祖先条件一起参与查询
            const body = getRequestBody(0);
            expect(body.filters.and).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        target: expect.objectContaining({ fieldId: 'cls_2' }),
                        values: ['C2'],
                    }),
                ]),
            );
        });

        it('cascades inside a tab from level 3 to level 4', async () => {
            mockSearchResults(['L4']);

            const t3 = categoryFilter({
                id: 't3',
                fieldId: 'cls_3',
                categoryLevel: 3,
                values: ['T1'],
            });
            const t4 = categoryFilter({
                id: 't4',
                fieldId: 'cls_4',
                categoryLevel: 4,
                values: ['OLD'],
                parentFieldId: 'cls_3',
                parentScope: 'tab',
                parentTabUuid: TAB_UUID,
            });

            const result = await updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([]),
                    tabFilters: { [TAB_UUID]: asFilters([t3, t4]) },
                },
                t3,
                'T2',
                projectUuid,
                dashboardContext,
            );

            expect(result.tabFilters[TAB_UUID].dimensions[1].values).toEqual([
                'L4',
            ]);
        });

        it('clears the tab descendants when the global parent has no value', async () => {
            const g1 = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const g2 = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: [],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });
            const t3 = categoryFilter({
                id: 't3',
                fieldId: 'cls_3',
                categoryLevel: 3,
                values: ['T1'],
                parentFieldId: 'cls_2',
                parentScope: 'global',
            });
            const t4 = categoryFilter({
                id: 't4',
                fieldId: 'cls_4',
                categoryLevel: 4,
                values: ['L4'],
                parentFieldId: 'cls_3',
                parentScope: 'tab',
                parentTabUuid: TAB_UUID,
            });

            const result = await updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([g1, g2]),
                    tabFilters: { [TAB_UUID]: asFilters([t3, t4]) },
                },
                g2,
                null,
                projectUuid,
                dashboardContext,
            );

            expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual(
                [],
            );
            expect(result.tabFilters[TAB_UUID].dimensions[1].values).toEqual(
                [],
            );
            expect(api).not.toHaveBeenCalled();
        });
    });

    describe('initializeCategoryFiltersAsync with a cross scope chain', () => {
        it('clears the tab level 3 filter when the global level 2 has no value', async () => {
            const g1 = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const g2 = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: [],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });
            const t3 = categoryFilter({
                id: 't3',
                fieldId: 'cls_3',
                categoryLevel: 3,
                values: ['T1'],
                parentFieldId: 'cls_2',
                parentScope: 'global',
            });
            const t4 = categoryFilter({
                id: 't4',
                fieldId: 'cls_4',
                categoryLevel: 4,
                values: ['L4'],
                parentFieldId: 'cls_3',
                parentScope: 'tab',
                parentTabUuid: TAB_UUID,
            });

            const globalFilters = asFilters([g1, g2]);
            const tabFilters = asFilters([t3, t4]);
            const chain = buildCategoryChain(
                { globalFilters, tabFilters: { [TAB_UUID]: tabFilters } },
                TAB_UUID,
            );

            const result = await initializeCategoryFiltersAsync(
                tabFilters,
                projectUuid,
                dashboardContext,
                {
                    scope: {
                        location: { scope: 'tab', tabUuid: TAB_UUID },
                        chain,
                    },
                },
            );

            expect(result.dimensions[0].values).toEqual([]);
            expect(result.dimensions[1].values).toEqual([]);
            expect(api).not.toHaveBeenCalled();
        });

        it('resolves the tab level 3 filter with the global parent value', async () => {
            mockSearchResults(['T1', 'T2']);

            const g1 = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['P1'],
            });
            const g2 = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['C1'],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });
            const t3 = categoryFilter({
                id: 't3',
                fieldId: 'cls_3',
                categoryLevel: 3,
                values: ['OLD'],
                parentFieldId: 'cls_2',
                parentScope: 'global',
            });

            const globalFilters = asFilters([g1, g2]);
            const tabFilters = asFilters([t3]);
            const chain = buildCategoryChain(
                { globalFilters, tabFilters: { [TAB_UUID]: tabFilters } },
                TAB_UUID,
            );

            const result = await initializeCategoryFiltersAsync(
                tabFilters,
                projectUuid,
                dashboardContext,
                {
                    scope: {
                        location: { scope: 'tab', tabUuid: TAB_UUID },
                        chain,
                    },
                },
            );

            expect(result.dimensions[0].values).toEqual(['T1']);
            const body = getRequestBody(0);
            expect(body.filters.and).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        target: expect.objectContaining({ fieldId: 'cls_2' }),
                        values: ['C1'],
                    }),
                ]),
            );
        });
    });

    describe('getCategoryFiltersSignature', () => {
        it('changes when the parent scope or tab changes', () => {
            const base = asFilters([
                categoryFilter({
                    id: 't3',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    values: ['T1'],
                    parentFieldId: 'cls_2',
                    parentScope: 'global',
                }),
            ]);
            const withTab = asFilters([
                categoryFilter({
                    id: 't3',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    values: ['T1'],
                    parentFieldId: 'cls_2',
                    parentScope: 'tab',
                    parentTabUuid: TAB_UUID,
                }),
            ]);

            const a = getCategoryFiltersSignature(
                base,
                projectUuid,
                dashboardContext,
            );
            const b = getCategoryFiltersSignature(
                withTab,
                projectUuid,
                dashboardContext,
            );

            expect(a).not.toBe(b);
        });
    });
});

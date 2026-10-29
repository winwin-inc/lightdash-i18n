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
    createCategoryRequestSession,
    findParentCategoryEntry,
    getCategoryFilterUpdateValue,
    getCategoryFiltersSignature,
    initializeCategoryFiltersAsync,
    shouldCascadeCategoryFilterUpdate,
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

        it('keeps the tab value when the cross scope cascade is cancelled', async () => {
            const session = createCategoryRequestSession();
            let resolveSearch: ((value: unknown) => void) | undefined;
            api.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveSearch = resolve;
                    }) as never,
            );

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

            const promise = updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([g1, g2]),
                    tabFilters: { [TAB_UUID]: asFilters([t3]) },
                },
                g2,
                'C2',
                projectUuid,
                dashboardContext,
                { session },
            );

            // 等请求真的发出去
            await vi.waitFor(() => {
                expect(api).toHaveBeenCalledTimes(1);
            });

            // 用户又改了一次：作废本次联动
            session.cancel();
            resolveSearch?.({
                search: '',
                results: ['T1'],
                cached: false,
                refreshedAt: new Date(),
            });

            const result = await promise;

            // 在途的请求被 abort（释放仓库引擎的查询内存）
            expect(api.mock.calls[0][0].signal?.aborted).toBe(true);
            // 取消的联动不写回：Tab 的值保持原样
            expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual([
                'OLD',
            ]);
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

        it('clears the cross scope tab child when the global parent is cleared', async () => {
            // 回归：全局一级类目被清空（「任何值」）时，
            // 跨作用域的 Tab 子级必须一起清空，
            // 否则会出现「父级是任何值、子级还留着旧类目」。
            const g1 = categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: [],
            });
            const g2 = categoryFilter({
                id: 'g2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['C1'],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });
            const t2 = categoryFilter({
                id: 't2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['TAB-C1'],
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

            const result = await updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([g1, g2]),
                    tabFilters: { [TAB_UUID]: asFilters([t2, t3]) },
                },
                g1,
                null,
                projectUuid,
                dashboardContext,
            );

            // 全局二级（绑定全局一级）被清空
            expect(result.globalFilters.dimensions[1].values).toEqual([]);
            // 跨作用域的 Tab 二级（绑定全局一级）被清空
            expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual(
                [],
            );
            // Tab 三级（绑定全局二级）跟着清空
            expect(result.tabFilters[TAB_UUID].dimensions[1].values).toEqual(
                [],
            );
            // 链路断裂 → 不需要请求仓库
            expect(api).not.toHaveBeenCalled();

            // 用户显式的「清空」优先：后续的自动解析不能把父级重新赋值
            const refined = await initializeCategoryFiltersAsync(
                result.globalFilters,
                projectUuid,
                dashboardContext,
                { skipFilterIds: ['g1'] },
            );
            expect(refined.dimensions[0].values).toEqual([]);
            expect(refined.dimensions[1].values).toEqual([]);
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

describe('shouldCascadeCategoryFilterUpdate', () => {
    const clearedCategory = categoryFilter({
        id: 'g1',
        fieldId: 'cls_1',
        categoryLevel: 1,
        values: [],
    });

    it('still cascades when a global category filter is cleared', () => {
        // 回归：清空全局类目筛选器（「任何值」）时必须继续级联，
        // 否则后代类目（全局 + 跨作用域 Tab）会保留旧值。
        expect(
            shouldCascadeCategoryFilterUpdate({
                filter: clearedCategory,
                isEdit: false,
                isTemporary: false,
                canApplyCategoryFilters: true,
            }),
        ).toBe(true);
    });

    it('treats a cleared category filter as no value', () => {
        expect(getCategoryFilterUpdateValue(clearedCategory)).toBeNull();
        expect(
            getCategoryFilterUpdateValue(
                categoryFilter({
                    id: 'g1',
                    fieldId: 'cls_1',
                    categoryLevel: 1,
                    values: ['P1'],
                }),
            ),
        ).toBe('P1');
    });

    it('does not cascade for non category filters, temporary filters or edit mode', () => {
        const normalFilter: DashboardFilterRule = {
            id: 'd1',
            target: { fieldId: 'orders_status', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: [],
            label: undefined,
        };
        expect(
            shouldCascadeCategoryFilterUpdate({
                filter: normalFilter,
                isEdit: false,
                isTemporary: false,
                canApplyCategoryFilters: true,
            }),
        ).toBe(false);
        expect(
            shouldCascadeCategoryFilterUpdate({
                filter: clearedCategory,
                isEdit: false,
                isTemporary: true,
                canApplyCategoryFilters: true,
            }),
        ).toBe(false);
        expect(
            shouldCascadeCategoryFilterUpdate({
                filter: clearedCategory,
                isEdit: true,
                isTemporary: false,
                canApplyCategoryFilters: true,
            }),
        ).toBe(false);
        expect(
            shouldCascadeCategoryFilterUpdate({
                filter: clearedCategory,
                isEdit: false,
                isTemporary: false,
                canApplyCategoryFilters: false,
            }),
        ).toBe(false);
    });
});

describe('categoryFilters screenshot scenario', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
    });

    // 场景：全局「一级类目」；Tab 内「二级类目」绑定全局一级类目，
    // 「三级类目」「四级类目」依次绑定（与截图一致）
    const buildLayers = () => ({
        globalFilters: asFilters([
            categoryFilter({
                id: 'g1',
                fieldId: 'cls_1',
                categoryLevel: 1,
                values: ['饮料和酒'],
            }),
        ]),
        tabFilters: {
            [TAB_UUID]: asFilters([
                categoryFilter({
                    id: 't2',
                    fieldId: 'cls_2',
                    categoryLevel: 2,
                    values: ['饮料'],
                    parentFieldId: 'cls_1',
                    parentScope: 'global',
                }),
                categoryFilter({
                    id: 't3',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    values: [],
                    parentFieldId: 'cls_2',
                    parentScope: 'tab',
                    parentTabUuid: TAB_UUID,
                }),
                categoryFilter({
                    id: 't4',
                    fieldId: 'cls_4',
                    categoryLevel: 4,
                    values: [],
                    parentFieldId: 'cls_3',
                    parentScope: 'tab',
                    parentTabUuid: TAB_UUID,
                }),
            ]),
        },
    });

    it('updates the tab level 2 filter when the global level 1 filter changes', async () => {
        // 二级类目的候选（受全局一级类目条件约束）
        mockSearchResults(['乳饮料']);
        // 三级类目的候选
        mockSearchResults(['乳饮料A']);
        // 四级类目的候选
        mockSearchResults(['乳饮料A1']);

        const layers = buildLayers();
        const result = await updateCrossScopeCategoryCascadeAsync(
            layers,
            layers.globalFilters.dimensions[0],
            '乳制品',
            projectUuid,
            dashboardContext,
        );

        const tabFilters = result.tabFilters[TAB_UUID].dimensions;
        expect(tabFilters[0].values).toEqual(['乳饮料']);
        expect(tabFilters[1].values).toEqual(['乳饮料A']);
        expect(tabFilters[2].values).toEqual(['乳饮料A1']);
    });

    it('cascades to tab level 3 and 4 that are bound and have a confirmed value', async () => {
        // 已绑定父级筛选器、且已经筛过值 → 父级变化时必须联动
        mockSearchResults(['乳饮料']);
        mockSearchResults(['乳饮料A']);
        mockSearchResults(['乳饮料A1']);

        const layers = {
            globalFilters: asFilters([
                categoryFilter({
                    id: 'g1',
                    fieldId: 'cls_1',
                    categoryLevel: 1,
                    values: ['饮料和酒'],
                }),
            ]),
            tabFilters: {
                [TAB_UUID]: asFilters([
                    categoryFilter({
                        id: 't2',
                        fieldId: 'cls_2',
                        categoryLevel: 2,
                        values: ['饮料'],
                        parentFieldId: 'cls_1',
                        parentScope: 'global',
                    }),
                    categoryFilter({
                        id: 't3',
                        fieldId: 'cls_3',
                        categoryLevel: 3,
                        values: ['旧三级'],
                        parentFieldId: 'cls_2',
                        parentScope: 'tab',
                        parentTabUuid: TAB_UUID,
                        disabled: true,
                    }),
                    categoryFilter({
                        id: 't4',
                        fieldId: 'cls_4',
                        categoryLevel: 4,
                        values: ['旧四级'],
                        parentFieldId: 'cls_3',
                        parentScope: 'tab',
                        parentTabUuid: TAB_UUID,
                        disabled: true,
                    }),
                ]),
            },
        };

        const result = await updateCrossScopeCategoryCascadeAsync(
            layers,
            layers.globalFilters.dimensions[0],
            '乳制品',
            projectUuid,
            dashboardContext,
        );

        const tabFilters = result.tabFilters[TAB_UUID].dimensions;
        expect(tabFilters[0].values).toEqual(['乳饮料']);
        expect(tabFilters[1].values).toEqual(['乳饮料A']);
        expect(tabFilters[2].values).toEqual(['乳饮料A1']);
        // 补齐后恢复成可用状态，筛选器才会真正生效
        expect(tabFilters[1].disabled).toBe(false);
        expect(tabFilters[2].disabled).toBe(false);
    });

    it('does not cascade to tab levels that are bound but have no value', async () => {
        // 绑定了父级、但自己没有任何值 → 不联动，保持「任何值」
        mockSearchResults(['乳饮料']);

        const layers = {
            globalFilters: asFilters([
                categoryFilter({
                    id: 'g1',
                    fieldId: 'cls_1',
                    categoryLevel: 1,
                    values: ['饮料和酒'],
                }),
            ]),
            tabFilters: {
                [TAB_UUID]: asFilters([
                    categoryFilter({
                        id: 't2',
                        fieldId: 'cls_2',
                        categoryLevel: 2,
                        values: ['饮料'],
                        parentFieldId: 'cls_1',
                        parentScope: 'global',
                    }),
                    categoryFilter({
                        id: 't3',
                        fieldId: 'cls_3',
                        categoryLevel: 3,
                        values: [],
                        parentFieldId: 'cls_2',
                        parentScope: 'tab',
                        parentTabUuid: TAB_UUID,
                        disabled: true,
                    }),
                ]),
            },
        };

        const result = await updateCrossScopeCategoryCascadeAsync(
            layers,
            layers.globalFilters.dimensions[0],
            '乳制品',
            projectUuid,
            dashboardContext,
        );

        const tabFilters = result.tabFilters[TAB_UUID].dimensions;
        expect(tabFilters[0].values).toEqual(['乳饮料']);
        // 没有值 → 不联动
        expect(tabFilters[1].values).toEqual([]);
    });

    it('does not cascade to tab levels that are not bound to a parent', async () => {
        // 没有绑定父级筛选器 → 不参与联动（绑定关系是联动的必要条件）
        mockSearchResults(['乳饮料']);

        const layers = {
            globalFilters: asFilters([
                categoryFilter({
                    id: 'g1',
                    fieldId: 'cls_1',
                    categoryLevel: 1,
                    values: ['饮料和酒'],
                }),
            ]),
            tabFilters: {
                [TAB_UUID]: asFilters([
                    categoryFilter({
                        id: 't2',
                        fieldId: 'cls_2',
                        categoryLevel: 2,
                        values: ['饮料'],
                        parentFieldId: 'cls_1',
                        parentScope: 'global',
                    }),
                    categoryFilter({
                        id: 't3',
                        fieldId: 'cls_3',
                        categoryLevel: 3,
                        values: [],
                        disabled: true,
                    }),
                ]),
            },
        };

        const result = await updateCrossScopeCategoryCascadeAsync(
            layers,
            layers.globalFilters.dimensions[0],
            '乳制品',
            projectUuid,
            dashboardContext,
        );

        const tabFilters = result.tabFilters[TAB_UUID].dimensions;
        expect(tabFilters[0].values).toEqual(['乳饮料']);
        // 未绑定父级 → 保持原值
        expect(tabFilters[1].values).toEqual([]);
    });

    it('reports an issue and keeps the old value when the cross scope request fails', async () => {
        const warehouseError = {
            status: 'error',
            error: {
                name: 'ApiError',
                statusCode: 500,
                message: 'HGERR_code 53200 memory limitation',
            },
        } as never;
        // 一级失败后，级联会继续请求三级类目，这里同样返回仓库错误
        api.mockRejectedValueOnce(warehouseError);
        api.mockRejectedValueOnce(warehouseError);

        const layers = buildLayers();
        const onResolutionIssue = vi.fn();

        const result = await updateCrossScopeCategoryCascadeAsync(
            layers,
            layers.globalFilters.dimensions[0],
            '乳制品',
            projectUuid,
            dashboardContext,
            { onResolutionIssue },
        );

        // 失败时保留 Tab 里的旧值
        expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual([
            '饮料',
        ]);
        expect(onResolutionIssue).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'error',
                filterId: 't2',
                phase: 'cascade',
                scope: TAB_UUID,
            }),
        );
    });
});

describe('category cascade parent scope fallback', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
        vi.restoreAllMocks();
    });

    it('falls back to the global parent when parentScope is tab without parentTabUuid', async () => {
        // parentScope='tab' 但没有 parentTabUuid：绑定不完整，
        // 必须按 fieldId 兜底到全局父级，否则子级永远保留旧值。
        mockSearchResults(['乳饮料']);

        const g1 = categoryFilter({
            id: 'g1',
            fieldId: 'cls_1',
            categoryLevel: 1,
            values: ['饮料和酒'],
        });
        const t2 = categoryFilter({
            id: 't2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: ['饮料'],
            parentFieldId: 'cls_1',
            parentScope: 'tab',
        });

        const result = await updateCrossScopeCategoryCascadeAsync(
            {
                globalFilters: asFilters([g1]),
                tabFilters: { [TAB_UUID]: asFilters([t2]) },
            },
            g1,
            '乳制品',
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(1);
        expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual([
            '乳饮料',
        ]);
    });

    it('falls back to another scope and warns when parentTabUuid points to another tab', async () => {
        // parentTabUuid 指向了别的 Tab：显式作用域匹配不到，
        // 按 fieldId 兜底（全局父级）并记录一条 warning。
        mockSearchResults(['乳饮料']);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const g1 = categoryFilter({
            id: 'g1',
            fieldId: 'cls_1',
            categoryLevel: 1,
            values: ['饮料和酒'],
        });
        const t2 = categoryFilter({
            id: 't2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: ['饮料'],
            parentFieldId: 'cls_1',
            parentScope: 'tab',
            parentTabUuid: 'tab-2',
        });

        const result = await updateCrossScopeCategoryCascadeAsync(
            {
                globalFilters: asFilters([g1]),
                tabFilters: { [TAB_UUID]: asFilters([t2]) },
            },
            g1,
            '乳制品',
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(1);
        expect(result.tabFilters[TAB_UUID].dimensions[0].values).toEqual([
            '乳饮料',
        ]);
        expect(
            warnSpy.mock.calls.some(
                (call) =>
                    call[0] === '[category-cascade]' &&
                    typeof call[1] === 'string' &&
                    call[1].includes('explicit parent scope not matched'),
            ),
        ).toBe(true);
    });
});


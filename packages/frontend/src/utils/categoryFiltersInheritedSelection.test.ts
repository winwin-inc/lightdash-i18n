import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import {
    applyInheritedCategorySelectionsAsync,
    clearFieldSearchCacheForTests,
    createCategoryRequestSession,
    type CategoryFilterLayers,
    type CategoryResolutionIssue,
    type InheritedCategorySelection,
} from './categoryFilters';
import { resetFieldSearchQueueForTests } from './fieldSearchQueue';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'dash-slug',
    dashboardName: 'Dash Name',
};

const TAB_A = 'tab-a';
const TAB_B = 'tab-b';
const TAB_C = 'tab-c';

/* -------------------------------------------------------------------------- */
/*                                  测试夹具                                  */
/* -------------------------------------------------------------------------- */

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

const plainFilter = (
    overrides: Partial<DashboardFilterRule> & {
        id: string;
        fieldId: string;
        values?: string[];
    },
): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: 'orders',
    },
    operator: FilterOperator.EQUALS,
    values: overrides.values,
    label: undefined,
});

const asFilters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const getRule = (
    filters: DashboardFilters | undefined,
    ruleId: string,
): DashboardFilterRule | undefined =>
    filters?.dimensions.find((dimension) => dimension.id === ruleId);

const getValues = (
    filters: DashboardFilters | undefined,
    ruleId: string,
): string[] | undefined => getRule(filters, ruleId)?.values;

/* -------------------------------------------------------------------------- */
/*                              field/search 请求桩                            */
/* -------------------------------------------------------------------------- */

type FieldSearchCondition = {
    fieldId: string;
    values: string[];
};

type FieldSearchRequest = {
    fieldId: string;
    tableName: string;
    conditions: FieldSearchCondition[];
};

type FieldSearchResponder = (request: FieldSearchRequest) => string[] | Error;

let fieldSearchRequests: FieldSearchRequest[] = [];

/**
 * 按「请求内容」返回候选值，而不是按调用顺序：
 * 同一模块里一次用户操作会发多个 field/search（校验 → 级联 → 重新初始化），
 * 顺序式 mock 会非常脆弱。
 */
const mockFieldSearch = (responder: FieldSearchResponder) => {
    api.mockImplementation((async (request: {
        url: string;
        body?: unknown;
    }) => {
        const url = String(request.url);
        const fieldId = url.split('/field/')[1]?.split('/')[0] ?? '';
        const body = JSON.parse(String(request.body ?? '{}')) as {
            table?: string;
            filters?: {
                and?: {
                    target: { fieldId: string };
                    values?: unknown[];
                }[];
            };
        };
        const conditions = (body.filters?.and ?? []).map((rule) => ({
            fieldId: rule.target.fieldId,
            values: (rule.values ?? []).map(String),
        }));
        const fieldSearchRequest: FieldSearchRequest = {
            fieldId,
            tableName: body.table ?? '',
            conditions,
        };
        fieldSearchRequests.push(fieldSearchRequest);

        const result = responder(fieldSearchRequest);
        if (result instanceof Error) {
            throw result;
        }
        return {
            search: '',
            results: result,
            cached: false,
            refreshedAt: new Date(),
        };
    }) as never);
};

const requestedFieldIds = () =>
    fieldSearchRequests.map((request) => request.fieldId);

const selection = (
    tabUuid: string,
    rule: DashboardFilterRule,
    previousRule: DashboardFilterRule | null = null,
): InheritedCategorySelection => ({
    tabUuid,
    rule,
    previousRule,
});

/* -------------------------------------------------------------------------- */
/*                                  用例                                      */
/* -------------------------------------------------------------------------- */

describe('categoryFilters inherited selection', () => {
    beforeEach(() => {
        api.mockReset();
        fieldSearchRequests = [];
        clearFieldSearchCacheForTests();
        resetFieldSearchQueueForTests();
        // 类目解析在开发模式会打印大量诊断日志，测试里静音
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearFieldSearchCacheForTests();
        resetFieldSearchQueueForTests();
    });

    describe('keeps the inherited value when it is available in the receiving tab', () => {
        const buildLayers = (): CategoryFilterLayers => ({
            globalFilters: asFilters([]),
            tabFilters: {
                [TAB_A]: asFilters([
                    categoryFilter({
                        id: 'a2',
                        fieldId: 'cls_2',
                        categoryLevel: 2,
                        values: ['inherited'],
                    }),
                ]),
                [TAB_B]: asFilters([
                    categoryFilter({
                        id: 'b2',
                        fieldId: 'cls_2',
                        categoryLevel: 2,
                        values: ['inherited'],
                    }),
                    categoryFilter({
                        id: 'b3',
                        fieldId: 'cls_3',
                        categoryLevel: 3,
                        values: ['old3'],
                        parentFieldId: 'cls_2',
                        parentScope: 'tab',
                        parentTabUuid: TAB_B,
                    }),
                ]),
            },
        });

        it('keeps the inherited value and re-cascades the receiving tab children', async () => {
            mockFieldSearch((request) => {
                if (request.fieldId === 'cls_2') return ['inherited', 'other'];
                if (request.fieldId === 'cls_3') return ['new3'];
                return [];
            });

            const layers = buildLayers();
            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!)],
                projectUuid,
                dashboardContext,
            );

            expect(result.rejectedTabUuids).toEqual([]);
            expect(result.changedTabUuids).toEqual([TAB_B]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'inherited',
            ]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual([
                'new3',
            ]);
            // 来源 Tab 不受影响
            expect(result.layers.tabFilters[TAB_A]).toBe(
                layers.tabFilters[TAB_A],
            );
        });

        it('does not report a changed tab when nothing changed', async () => {
            mockFieldSearch((request) =>
                request.fieldId === 'cls_2' ? ['inherited'] : [],
            );

            const layers = buildLayers();
            const withoutChildren = {
                ...layers,
                tabFilters: {
                    ...layers.tabFilters,
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                withoutChildren,
                [
                    selection(
                        TAB_B,
                        getRule(withoutChildren.tabFilters[TAB_B], 'b2')!,
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(result.changedTabUuids).toEqual([]);
            expect(result.rejectedTabUuids).toEqual([]);
            // 叶子级（没有后代）：只发 1 次校验请求，不再做额外的初始化查询
            expect(requestedFieldIds()).toEqual(['cls_2']);
        });

        it('does not re-query the ancestors of the inherited level', async () => {
            // 接收方有 一级 → 二级（被继承） → 三级。
            // 只应查「二级校验 + 三级联动/初始化」，不能再查一次一级。
            mockFieldSearch((request) => {
                if (request.fieldId === 'cls_1') return ['parent'];
                if (request.fieldId === 'cls_2') return ['inherited'];
                if (request.fieldId === 'cls_3') return ['new3'];
                return [];
            });

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b1',
                            fieldId: 'cls_1',
                            categoryLevel: 1,
                            values: ['parent'],
                        }),
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                            parentFieldId: 'cls_1',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                        categoryFilter({
                            id: 'b3',
                            fieldId: 'cls_3',
                            categoryLevel: 3,
                            values: ['old3'],
                            parentFieldId: 'cls_2',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                    ]),
                },
            };

            await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!)],
                projectUuid,
                dashboardContext,
            );

            expect(requestedFieldIds()).not.toContain('cls_1');
            expect(requestedFieldIds()).toContain('cls_2');
        });
    });

    describe('rejects the inherited value when it is not available in the receiving tab', () => {
        const buildLayers = (): CategoryFilterLayers => ({
            globalFilters: asFilters([]),
            tabFilters: {
                [TAB_B]: asFilters([
                    categoryFilter({
                        id: 'b2',
                        fieldId: 'cls_2',
                        categoryLevel: 2,
                        values: ['inherited'],
                    }),
                    categoryFilter({
                        id: 'b3',
                        fieldId: 'cls_3',
                        categoryLevel: 3,
                        values: ['old3'],
                        parentFieldId: 'cls_2',
                        parentScope: 'tab',
                        parentTabUuid: TAB_B,
                    }),
                ]),
            },
        });

        it('reverts to the previous rule and does not cascade the children', async () => {
            mockFieldSearch((request) => {
                // 接收方没有这个类目（无权限 / 数据范围没有）
                if (request.fieldId === 'cls_2') return ['other'];
                if (request.fieldId === 'cls_3') return ['new3'];
                return [];
            });

            const layers = buildLayers();
            const previousRule = categoryFilter({
                id: 'b2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['old2'],
            });

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(
                        TAB_B,
                        getRule(layers.tabFilters[TAB_B], 'b2')!,
                        previousRule,
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(result.rejectedTabUuids).toEqual([TAB_B]);
            expect(result.changedTabUuids).toEqual([TAB_B]);
            // 回退到继承前的取值
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'old2',
            ]);
            // 不可用的取值不参与联动：子级保持原值
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual([
                'old3',
            ]);
            expect(requestedFieldIds()).not.toContain('cls_3');
        });

        it('keeps the inherited value when there is no previous rule to revert to', async () => {
            mockFieldSearch((request) =>
                request.fieldId === 'cls_2' ? ['other'] : [],
            );

            const layers = buildLayers();

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(
                        TAB_B,
                        getRule(layers.tabFilters[TAB_B], 'b2')!,
                        null,
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(result.rejectedTabUuids).toEqual([TAB_B]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'inherited',
            ]);
        });

        it('reverts the inherited value when the receiving parent chain is broken', async () => {
            mockFieldSearch((request) =>
                request.fieldId === 'cls_2' ? ['inherited'] : [],
            );

            const layers: CategoryFilterLayers = {
                // 全局父级没有值 → 接收方的链断在这里
                globalFilters: asFilters([
                    categoryFilter({
                        id: 'g1',
                        fieldId: 'cls_1',
                        categoryLevel: 1,
                        values: [],
                    }),
                ]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                            parentFieldId: 'cls_1',
                            parentScope: 'global',
                        }),
                    ]),
                },
            };

            const previousRule = categoryFilter({
                id: 'b2',
                fieldId: 'cls_2',
                categoryLevel: 2,
                values: ['old2'],
                parentFieldId: 'cls_1',
                parentScope: 'global',
            });

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(
                        TAB_B,
                        getRule(layers.tabFilters[TAB_B], 'b2')!,
                        previousRule,
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(result.rejectedTabUuids).toEqual([TAB_B]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'old2',
            ]);
        });
    });

    describe('resolves the inherited value against the receiving tab own chain', () => {
        it('sends the global parent condition of the receiving tab', async () => {
            mockFieldSearch((request) =>
                request.fieldId === 'cls_2' ? ['inherited'] : [],
            );

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([
                    categoryFilter({
                        id: 'g1',
                        fieldId: 'cls_1',
                        categoryLevel: 1,
                        values: ['P1'],
                    }),
                ]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                            parentFieldId: 'cls_1',
                            parentScope: 'global',
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!)],
                projectUuid,
                dashboardContext,
            );

            expect(result.rejectedTabUuids).toEqual([]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'inherited',
            ]);

            const request = fieldSearchRequests.find(
                (item) => item.fieldId === 'cls_2',
            );
            expect(request).toBeDefined();
            expect(request!.conditions).toEqual([
                { fieldId: 'cls_1', values: ['P1'] },
            ]);
        });

        it('keeps the inherited value when the receiving tab has no candidates', async () => {
            mockFieldSearch(() => []);

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                        categoryFilter({
                            id: 'b3',
                            fieldId: 'cls_3',
                            categoryLevel: 3,
                            values: ['old3'],
                            parentFieldId: 'cls_2',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!)],
                projectUuid,
                dashboardContext,
            );

            // 没有候选值 → 无法判定 → 保留继承值（不当作不可用）
            expect(result.rejectedTabUuids).toEqual([]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'inherited',
            ]);
            // 子级同样没有候选值 → 保留原值
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual([
                'old3',
            ]);
            expect(requestedFieldIds()).toContain('cls_2');
            expect(requestedFieldIds()).toContain('cls_3');
        });
    });

    describe('handles failures and cancellations', () => {
        it('keeps the inherited value and reports the failure', async () => {
            mockFieldSearch((request) => {
                if (request.fieldId === 'cls_2') {
                    return new Error('warehouse exploded');
                }
                if (request.fieldId === 'cls_3') return ['new3'];
                return [];
            });

            const issues: CategoryResolutionIssue[] = [];

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                        categoryFilter({
                            id: 'b3',
                            fieldId: 'cls_3',
                            categoryLevel: 3,
                            values: ['old3'],
                            parentFieldId: 'cls_2',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!)],
                projectUuid,
                dashboardContext,
                {
                    onResolutionIssue: (issue) => issues.push(issue),
                },
            );

            // 请求失败 → 无法判定 → 保留继承值，不当作不可用
            expect(result.rejectedTabUuids).toEqual([]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual([
                'inherited',
            ]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual([
                'new3',
            ]);
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0]).toMatchObject({
                kind: 'error',
                filterId: 'b2',
                fieldId: 'cls_2',
                phase: 'cascade',
                scope: TAB_B,
            });
        });

        it('aborts without writing back when the request session is cancelled', async () => {
            mockFieldSearch(() => ['inherited']);

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                    ]),
                },
            };

            const session = createCategoryRequestSession();
            session.cancel();

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!)],
                projectUuid,
                dashboardContext,
                { session },
            );

            expect(result.layers).toBe(layers);
            expect(result.changedTabUuids).toEqual([]);
            expect(result.rejectedTabUuids).toEqual([]);
            expect(requestedFieldIds()).toEqual([]);
        });
    });

    describe('cleared inherited value', () => {
        it('keeps the empty value and clears the receiving tab children', async () => {
            mockFieldSearch((request) =>
                request.fieldId === 'cls_3' ? ['new3'] : [],
            );

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        // 「任何值」：没有取值，且被禁用（作者没配默认值）
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: [],
                            disabled: true,
                        }),
                        categoryFilter({
                            id: 'b3',
                            fieldId: 'cls_3',
                            categoryLevel: 3,
                            values: ['old3'],
                            parentFieldId: 'cls_2',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(
                        TAB_B,
                        getRule(layers.tabFilters[TAB_B], 'b2')!,
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['old2'],
                        }),
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            // 空值不做权限校验，也不算被拒绝
            expect(result.rejectedTabUuids).toEqual([]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual(
                [],
            );
            // 父级没有值 → 子级断链清空
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual(
                [],
            );
            expect(result.changedTabUuids).toEqual([TAB_B]);
        });

        it('does not re-invent a value on an enabled but empty receiver', async () => {
            // 「是任何值」的另一种表示：没有取值但未被禁用（作者配了控件、没配默认值）。
            // 重新初始化不得把接收方改成"第一个合法类目"，否则用户的清空意图被反掉。
            mockFieldSearch((request) =>
                request.fieldId === 'cls_2' ? ['first2', 'second2'] : [],
            );

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: [],
                            disabled: false,
                        }),
                        categoryFilter({
                            id: 'b3',
                            fieldId: 'cls_3',
                            categoryLevel: 3,
                            values: ['old3'],
                            parentFieldId: 'cls_2',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(
                        TAB_B,
                        getRule(layers.tabFilters[TAB_B], 'b2')!,
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['old2'],
                            disabled: false,
                        }),
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(getValues(result.layers.tabFilters[TAB_B], 'b2')).toEqual(
                [],
            );
            // 父级没有值 → 子级断链清空
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual(
                [],
            );
        });
    });

    describe('ignores selections that do not apply', () => {
        it('skips filters that are not category filters', async () => {
            mockFieldSearch(() => ['value']);

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        plainFilter({
                            id: 'b1',
                            fieldId: 'orders_status',
                            values: ['inherited'],
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b1')!)],
                projectUuid,
                dashboardContext,
            );

            expect(requestedFieldIds()).toEqual([]);
            expect(result.changedTabUuids).toEqual([]);
            expect(result.rejectedTabUuids).toEqual([]);
            expect(result.layers.tabFilters[TAB_B]).toBe(
                layers.tabFilters[TAB_B],
            );
        });

        it('skips unknown tabs and unknown rules', async () => {
            mockFieldSearch(() => ['value']);

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(
                        'tab-unknown',
                        getRule(layers.tabFilters[TAB_B], 'b2')!,
                    ),
                    selection(
                        TAB_B,
                        categoryFilter({
                            id: 'not-in-this-tab',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                    ),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(requestedFieldIds()).toEqual([]);
            expect(result.changedTabUuids).toEqual([]);
            expect(result.rejectedTabUuids).toEqual([]);
            expect(result.layers.tabFilters[TAB_B]).toBe(
                layers.tabFilters[TAB_B],
            );
        });
    });

    describe('multiple receiving tabs', () => {
        it('processes each receiving tab independently', async () => {
            mockFieldSearch((request) => {
                if (request.fieldId === 'cls_2') return ['inherited'];
                if (request.fieldId === 'cls_3') return ['new3'];
                return [];
            });

            const layers: CategoryFilterLayers = {
                globalFilters: asFilters([]),
                tabFilters: {
                    [TAB_B]: asFilters([
                        categoryFilter({
                            id: 'b2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                        categoryFilter({
                            id: 'b3',
                            fieldId: 'cls_3',
                            categoryLevel: 3,
                            values: ['old3'],
                            parentFieldId: 'cls_2',
                            parentScope: 'tab',
                            parentTabUuid: TAB_B,
                        }),
                    ]),
                    [TAB_C]: asFilters([
                        categoryFilter({
                            id: 'c2',
                            fieldId: 'cls_2',
                            categoryLevel: 2,
                            values: ['inherited'],
                        }),
                    ]),
                },
            };

            const result = await applyInheritedCategorySelectionsAsync(
                layers,
                [
                    selection(TAB_B, getRule(layers.tabFilters[TAB_B], 'b2')!),
                    selection(TAB_C, getRule(layers.tabFilters[TAB_C], 'c2')!),
                ],
                projectUuid,
                dashboardContext,
            );

            expect(result.changedTabUuids).toEqual([TAB_B]);
            expect(result.rejectedTabUuids).toEqual([]);
            expect(getValues(result.layers.tabFilters[TAB_B], 'b3')).toEqual([
                'new3',
            ]);
            // C 没有子级 → 没有变化
            expect(getValues(result.layers.tabFilters[TAB_C], 'c2')).toEqual([
                'inherited',
            ]);
        });
    });
});

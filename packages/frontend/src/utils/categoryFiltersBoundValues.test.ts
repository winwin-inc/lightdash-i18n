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
    getCategoryFiltersSignature,
    initializeCategoryFiltersAsync,
    isBoundValueFilter,
    updateCrossScopeCategoryCascadeAsync,
} from './categoryFilters';
import { isRuleSelectionCompatible } from './userFilterSelections';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'dash-slug',
    dashboardName: 'Dash Name',
};

const TAB_UUID = 'tab-1';

/**
 * 类目筛选器（父级）
 */
const categoryRule = (
    overrides: Partial<DashboardFilterRule> & {
        id: string;
        fieldId: string;
        categoryLevel: 1 | 2 | 3 | 4;
        values?: string[];
    },
): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: 'group_cls4_insight_list',
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

/**
 * 绑定父级类目的普通维度（集团 / 品牌 / 包装类型 / 商品名称…）
 */
const boundRule = (
    overrides: Partial<DashboardFilterRule> & {
        id: string;
        fieldId: string;
        values?: string[];
    },
): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: 'group_cls4_insight_list',
        ...(overrides.target ?? {}),
    },
    operator: overrides.operator ?? FilterOperator.EQUALS,
    values: overrides.values,
    label: undefined,
    categoryLevel: undefined,
    parentFieldId: overrides.parentFieldId ?? 'group_cls4_insight_list_cls_4',
    parentScope: overrides.parentScope ?? 'tab',
    parentTabUuid: overrides.parentTabUuid ?? TAB_UUID,
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

/** 四级类目「醋」+ 绑定的集团 */
const chainFor = (
    categoryValues: string[],
    boundRules: DashboardFilterRule[],
    options?: { categoryDisabled?: boolean },
) => {
    const category = categoryRule({
        id: 'l4',
        fieldId: 'group_cls4_insight_list_cls_4',
        categoryLevel: 4,
        values: categoryValues,
        disabled: options?.categoryDisabled,
    });
    return buildCategoryChain(
        {
            globalFilters: asFilters([]),
            tabFilters: { [TAB_UUID]: asFilters([category, ...boundRules]) },
        },
        TAB_UUID,
    );
};

/** 父级类目（四级=醋）；测试里绑定字段都挂在它下面 */
const parentCategory = () =>
    categoryRule({
        id: 'l4',
        fieldId: 'group_cls4_insight_list_cls_4',
        categoryLevel: 4,
        values: ['醋'],
    });

const initTab = (
    boundFilters: DashboardFilters,
    options?: Parameters<typeof initializeCategoryFiltersAsync>[3],
) => {
    const filters = asFilters([parentCategory(), ...boundFilters.dimensions]);
    const chain = buildCategoryChain(
        {
            globalFilters: asFilters([]),
            tabFilters: { [TAB_UUID]: filters },
        },
        TAB_UUID,
    );
    return initializeCategoryFiltersAsync(
        filters,
        projectUuid,
        dashboardContext,
        {
            scope: { location: { scope: 'tab', tabUuid: TAB_UUID }, chain },
            // 父级类目本身不需要重新解析（测试只关心绑定字段），避免多消耗一次 mock
            skipFilterIds: ['l4'],
            ...options,
        },
    );
};

describe('bound value filters (非类目字段绑定父级类目)', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearFieldSearchCacheForTests();
    });

    describe('isBoundValueFilter', () => {
        it('accepts plain dimensions bound to a parent', () => {
            expect(
                isBoundValueFilter(boundRule({ id: 'g', fieldId: 'group' })),
            ).toBe(true);
        });

        it('rejects categories, sql columns and unbound fields', () => {
            expect(
                isBoundValueFilter(
                    categoryRule({
                        id: 'l4',
                        fieldId: 'cls_4',
                        categoryLevel: 4,
                    }),
                ),
            ).toBe(false);
            expect(
                isBoundValueFilter(
                    boundRule({
                        id: 'sql',
                        fieldId: 'group',
                        target: {
                            fieldId: 'group',
                            tableName: 'group_cls4_insight_list',
                            isSqlColumn: true,
                        },
                    }),
                ),
            ).toBe(false);
            expect(
                isBoundValueFilter({
                    ...boundRule({ id: 'free', fieldId: 'group' }),
                    parentFieldId: undefined,
                }),
            ).toBe(false);
        });
    });

    describe('initializeCategoryFiltersAsync', () => {
        it('keeps a value that is still a candidate of the current category', async () => {
            mockSearchResults(['海天', '李锦记']);
            const filters = asFilters([
                boundRule({ id: 'group', fieldId: 'group', values: ['海天'] }),
            ]);
            const chain = chainFor(
                ['醋'],
                [
                    boundRule({
                        id: 'group',
                        fieldId: 'group',
                        values: ['海天'],
                    }),
                ],
            );
            expect(chain).toHaveLength(2);

            const refined = await initTab(filters);
            expect(refined.dimensions[1]).toEqual(filters.dimensions[0]);
        });

        it('replaces an invalid single value with the first candidate', async () => {
            mockSearchResults(['李锦记', '恒顺']);
            const filters = asFilters([
                boundRule({
                    id: 'group',
                    fieldId: 'group',
                    values: ['海天'],
                }),
            ]);
            const onValuesAutoAdjusted = vi.fn();

            const refined = await initTab(filters, { onValuesAutoAdjusted });

            expect(refined.dimensions[1].values).toEqual(['李锦记']);
            expect(refined.dimensions[1].disabled).toBe(false);
            expect(onValuesAutoAdjusted).toHaveBeenCalledWith({
                filterId: 'group',
                fieldId: 'group',
                previousValues: ['海天'],
                nextValues: ['李锦记'],
            });
        });

        it('keeps valid multi values and tops the list up to N (商品 5 个)', async () => {
            mockSearchResults(['sku-1', 'sku-3', 'sku-5', 'sku-6', 'sku-7']);
            const filters = asFilters([
                boundRule({
                    id: 'sku',
                    fieldId: 'sku_name',
                    values: ['sku-1', 'sku-2', 'sku-3', 'sku-4', 'sku-5'],
                }),
            ]);

            const refined = await initTab(filters);
            // 保留 3 个有效 + 补足到 5 个
            expect(refined.dimensions[1].values).toEqual([
                'sku-1',
                'sku-3',
                'sku-5',
                'sku-6',
                'sku-7',
            ]);
        });

        it('takes the first N candidates when every value is invalid', async () => {
            mockSearchResults(['单包装', '多包装', '礼盒装']);
            const filters = asFilters([
                boundRule({
                    id: 'pack',
                    fieldId: 'pack_type',
                    values: ['x', 'y'],
                }),
            ]);

            const refined = await initTab(filters);
            expect(refined.dimensions[1].values).toEqual(['单包装', '多包装']);
        });

        it('does not touch a filter without a confirmed value (任何值)', async () => {
            const filters = asFilters([
                boundRule({
                    id: 'brand',
                    fieldId: 'brand',
                    values: [],
                    disabled: true,
                }),
            ]);

            const refined = await initTab(filters);
            expect(refined.dimensions[1]).toEqual(filters.dimensions[0]);
            expect(api).not.toHaveBeenCalled();
        });

        it('keeps the current value when there are no candidates', async () => {
            mockSearchResults([]);
            const filters = asFilters([
                boundRule({
                    id: 'group',
                    fieldId: 'group',
                    values: ['海天'],
                }),
            ]);

            const refined = await initTab(filters);
            expect(refined.dimensions[1]).toEqual(filters.dimensions[0]);
        });

        it('keeps the current value when the request fails', async () => {
            api.mockRejectedValueOnce(new Error('warehouse down'));
            const onResolutionIssue = vi.fn();
            const filters = asFilters([
                boundRule({
                    id: 'group',
                    fieldId: 'group',
                    values: ['海天'],
                }),
            ]);

            const refined = await initTab(filters, { onResolutionIssue });
            expect(refined.dimensions[1]).toEqual(filters.dimensions[0]);
            expect(onResolutionIssue).toHaveBeenCalledWith(
                expect.objectContaining({ kind: 'error', filterId: 'group' }),
            );
        });

        it('does not report an adjustment when nothing changes', async () => {
            mockSearchResults(['海天']);
            const onValuesAutoAdjusted = vi.fn();
            const filters = asFilters([
                boundRule({
                    id: 'group',
                    fieldId: 'group',
                    values: ['海天'],
                }),
            ]);

            await initTab(filters, { onValuesAutoAdjusted });
            expect(onValuesAutoAdjusted).not.toHaveBeenCalled();
        });

        it('skips filters without a parent binding', async () => {
            const freeRule: DashboardFilterRule = {
                ...boundRule({ id: 'free', fieldId: 'free_dim' }),
                parentFieldId: undefined,
                parentScope: undefined,
                parentTabUuid: undefined,
                values: ['x'],
            };
            const filters = asFilters([freeRule]);

            const refined = await initTab(filters);
            expect(refined.dimensions[1]).toEqual(filters.dimensions[0]);
            expect(api).not.toHaveBeenCalled();
        });
    });

    describe('cascade (父类目变化)', () => {
        it('re-resolves bound values when the category changes', async () => {
            mockSearchResults(['李锦记']);
            const filters = asFilters([
                categoryRule({
                    id: 'l4',
                    fieldId: 'group_cls4_insight_list_cls_4',
                    categoryLevel: 4,
                    values: ['醋'],
                }),
                boundRule({
                    id: 'group',
                    fieldId: 'group',
                    values: ['海天'],
                }),
            ]);
            const chain = chainFor(
                ['醋'],
                [
                    boundRule({
                        id: 'group',
                        fieldId: 'group',
                        values: ['海天'],
                    }),
                ],
            );

            const cascaded = await updateCrossScopeCategoryCascadeAsync(
                {
                    globalFilters: asFilters([]),
                    tabFilters: { [TAB_UUID]: filters },
                },
                filters.dimensions[0],
                '醋',
                projectUuid,
                dashboardContext,
                {
                    activeTabUuid: TAB_UUID,
                },
            );

            expect(chain).toHaveLength(2);
            expect(cascaded.tabFilters[TAB_UUID].dimensions[1].values).toEqual([
                '李锦记',
            ]);
        });
    });

    describe('signature', () => {
        it('changes when a bound filter value changes', () => {
            const before = getCategoryFiltersSignature(
                asFilters([
                    categoryRule({
                        id: 'l4',
                        fieldId: 'cls_4',
                        categoryLevel: 4,
                        values: ['醋'],
                    }),
                    boundRule({
                        id: 'group',
                        fieldId: 'group',
                        values: ['海天'],
                    }),
                ]),
                projectUuid,
                dashboardContext,
            );
            const after = getCategoryFiltersSignature(
                asFilters([
                    categoryRule({
                        id: 'l4',
                        fieldId: 'cls_4',
                        categoryLevel: 4,
                        values: ['醋'],
                    }),
                    boundRule({
                        id: 'group',
                        fieldId: 'group',
                        values: ['李锦记'],
                    }),
                ]),
                projectUuid,
                dashboardContext,
            );

            expect(before).not.toEqual(after);
        });

        it('ignores plain filters that are not bound', () => {
            const build = (values: string[]) =>
                getCategoryFiltersSignature(
                    asFilters([
                        categoryRule({
                            id: 'l4',
                            fieldId: 'cls_4',
                            categoryLevel: 4,
                            values: ['醋'],
                        }),
                        {
                            ...boundRule({ id: 'time', fieldId: 'period' }),
                            parentFieldId: undefined,
                            parentScope: undefined,
                            parentTabUuid: undefined,
                            values,
                        },
                    ]),
                    projectUuid,
                    dashboardContext,
                );

            // 「时间」未绑定父级：改动它不应改变签名里的绑定字段部分
            expect(build(['近3个月'])).toEqual(build(['YTD2609']));
        });
    });

    describe('跨 Tab 继承的兼容闸门', () => {
        it('treats bound filters of different marts as compatible when the parent level matches', () => {
            const source = boundRule({
                id: 'a',
                fieldId: 'group_cls4_insight_list_group',
                values: ['海天'],
                parentFieldId: 'group_cls4_insight_list_cls_4',
            });
            const target = boundRule({
                id: 'b',
                fieldId: 'brand_cls3_insight_list_group',
                values: ['李锦记'],
                parentFieldId: 'brand_cls3_insight_list_cls_4',
            });

            expect(isRuleSelectionCompatible(source, target)).toBe(true);
        });

        it('rejects bound filters whose parent category level differs', () => {
            const source = boundRule({
                id: 'a',
                fieldId: 'group',
                parentFieldId: 'group_cls4_insight_list_cls_4',
            });
            const target = boundRule({
                id: 'b',
                fieldId: 'group',
                parentFieldId: 'brand_cls3_insight_list_cls_3',
            });

            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });
    });
});

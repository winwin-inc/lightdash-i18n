import {
    FilterOperator,
    UnitOfTime,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import {
    clearFieldSearchCacheForTests,
    createCategoryRequestSession,
    getCategoryFiltersSignature,
    getCategoryLevel,
    getParentFieldId,
    hasCategoryFilters,
    initializeCategoryFiltersAsync,
    isCategoryField,
    updateCategoryFilterCascadeAsync,
} from './categoryFilters';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'dash-slug',
    dashboardName: 'Dash Name',
};

const categoryFilter = (
    overrides: Partial<DashboardFilterRule> & {
        id: string;
        fieldId: string;
        categoryLevel: 1 | 2 | 3 | 4;
        values?: string[];
        parentFieldId?: string;
        disabled?: boolean;
        operator?: FilterOperator;
    },
): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: 'dim_categories',
    },
    operator: overrides.operator ?? FilterOperator.EQUALS,
    values: overrides.values,
    label: undefined,
    categoryLevel: overrides.categoryLevel,
    parentFieldId: overrides.parentFieldId,
    disabled: overrides.disabled,
});

const timeFilter = (): DashboardFilterRule => ({
    id: 'time',
    target: { fieldId: 'orders_order_date', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['2024-01'],
    label: undefined,
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

describe('categoryFilters helpers', () => {
    it('detects category fields and levels', () => {
        const filter = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['A'],
        });
        expect(isCategoryField(filter)).toBe(true);
        expect(getCategoryLevel(filter)).toBe(1);
        expect(getParentFieldId(filter)).toBeNull();
        expect(hasCategoryFilters(asFilters([filter]))).toBe(true);
        expect(hasCategoryFilters(asFilters([timeFilter()]))).toBe(false);
    });

    it('builds stable signatures from filter values and context', () => {
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);
        const a = getCategoryFiltersSignature(
            filters,
            projectUuid,
            dashboardContext,
        );
        const b = getCategoryFiltersSignature(
            filters,
            projectUuid,
            dashboardContext,
        );
        expect(a).toBe(b);

        const changed = getCategoryFiltersSignature(
            asFilters([
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['B'],
                }),
            ]),
            projectUuid,
            dashboardContext,
        );
        expect(changed).not.toBe(a);
    });

    it('ignores filters after the last category in the signature', () => {
        const categoryOnly = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);
        const withTrailingTime = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
            timeFilter(),
        ]);

        expect(
            getCategoryFiltersSignature(
                categoryOnly,
                projectUuid,
                dashboardContext,
            ),
        ).toBe(
            getCategoryFiltersSignature(
                withTrailingTime,
                projectUuid,
                dashboardContext,
            ),
        );
    });

    it('includes filters before the last category in the signature', () => {
        const categoryOnly = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);
        const withLeadingTime = asFilters([
            timeFilter(),
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);

        expect(
            getCategoryFiltersSignature(
                categoryOnly,
                projectUuid,
                dashboardContext,
            ),
        ).not.toBe(
            getCategoryFiltersSignature(
                withLeadingTime,
                projectUuid,
                dashboardContext,
            ),
        );
    });
});

describe('initializeCategoryFiltersAsync', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
    });

    it('keeps the current value when it exists in field/search results', async () => {
        mockSearchResults(['A', 'B']);
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['B'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual(['B']);
        expect(api).toHaveBeenCalledTimes(1);
        expect(JSON.parse(String(api.mock.calls[0][0].body))).toMatchObject({
            search: '',
            limit: 1000,
            dashboardSlug: 'dash-slug',
            dashboardName: 'Dash Name',
        });
    });

    it('switches to the first result when current value is invalid', async () => {
        mockSearchResults(['A', 'B']);
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['Z'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result).not.toBe(filters);
        expect(result.dimensions[0].values).toEqual(['A']);
    });

    it('keeps filter settings in the search request (date unit / completed)', async () => {
        mockSearchResults(['C1']);
        const dateFilter: DashboardFilterRule = {
            id: 'time',
            target: { fieldId: 'orders_order_date', tableName: 'orders' },
            operator: FilterOperator.IN_THE_PAST,
            values: [13],
            label: undefined,
            settings: { unitOfTime: UnitOfTime.months, completed: false },
        };
        const filters = asFilters([
            dateFilter,
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);

        await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        // 丢掉 settings 会让后端按「天」编译时间条件（13 个月 → 13 天），
        // 查询被收窄到没有数据
        const body = JSON.parse(String(api.mock.calls[0][0].body));
        const timeCondition = body.filters.and.find(
            (condition: { target: { fieldId: string } }) =>
                condition.target.fieldId === 'orders_order_date',
        );
        expect(timeCondition.settings).toEqual({
            unitOfTime: 'months',
            completed: false,
        });
    });

    it('keeps the confirmed parent value as condition even when the parent is disabled', async () => {
        mockSearchResults(['A']);
        mockSearchResults(['B', 'C']);
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
                disabled: true,
            }),
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['B'],
                parentFieldId: 'dim_categories_cls_1',
            }),
        ]);

        await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        // 父级被禁用 → 父级自身不发起请求，只有子级发一次
        expect(api).toHaveBeenCalledTimes(1);
        const childBody = JSON.parse(String(api.mock.calls[0][0].body));
        expect(childBody.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'dim_categories_cls_1',
                    }),
                    values: ['A'],
                    // 编译器遇到 disabled 会渲染 1=1，父级条件必须以生效状态发送
                    disabled: false,
                }),
            ]),
        );
    });

    it('keeps the current value when the category has no candidates', async () => {
        mockSearchResults([]);
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['Z'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        // 底层表确实没有该类目 vs 行级过滤把候选值都过滤掉，接口层面无法区分：
        // 保留原值，不能清空并禁用（否则看板里保存的类目会被直接抹掉）
        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual(['Z']);
        expect(result.dimensions[0].disabled).toBeUndefined();
    });

    it('keeps the child filter when the parent category has no candidates', async () => {
        mockSearchResults([]);
        mockSearchResults([]);
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['Z'],
            }),
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['Y'],
                parentFieldId: 'dim_categories_cls_1',
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result.dimensions[0].values).toEqual(['Z']);
        expect(result.dimensions[0].disabled).toBeUndefined();
        expect(result.dimensions[1].values).toEqual(['Y']);
        expect(result.dimensions[1].disabled).toBeUndefined();
    });

    it('does not query again when the cascaded query is empty', async () => {
        // 空结果不再额外发起「不带级联」的兜底查询，避免初始化请求翻倍
        mockSearchResults([]);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['饮料'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual(['饮料']);
        expect(api).toHaveBeenCalledTimes(1);
    });

    it('never assigns a default value to a disabled filter', async () => {
        // 被禁用的筛选器 = 没有配置默认值：不能给它套默认值，也不能发请求
        mockSearchResults(['方便速食']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: [],
                disabled: true,
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual([]);
        expect(api).not.toHaveBeenCalled();
    });

    it('restores a filter that was wrongly cleared when the server still has a value', async () => {
        mockSearchResults(['方便速食']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: [],
                disabled: true,
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            { recoverableFilterIds: ['l1'] },
        );

        expect(result).not.toBe(filters);
        expect(result.dimensions[0].values).toEqual(['方便速食']);
        expect(result.dimensions[0].disabled).toBe(false);
    });

    it('restores a cleared and disabled filter with the unfiltered query when the cascaded query is empty', async () => {
        // 带级联（父级）条件的查询没有候选值
        mockSearchResults([]);
        // 不带级联条件的查询有候选值 → 用于恢复被清空的筛选器
        mockSearchResults(['碳酸饮料']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['饮料'],
            }),
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: [],
                disabled: true,
                parentFieldId: 'dim_categories_cls_1',
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            { recoverableFilterIds: ['l2'] },
        );

        expect(result.dimensions[1].values).toEqual(['碳酸饮料']);
        expect(result.dimensions[1].disabled).toBe(false);
    });

    it('keeps the value the user just selected by skipping the filter', async () => {
        mockSearchResults(['方便速食']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['饮料'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            { skipFilterIds: ['l1'] },
        );

        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual(['饮料']);
        expect(api).not.toHaveBeenCalled();
    });

    it('resets the default to the first permitted category and cascades to the child levels', async () => {
        // level 1: default 饮料 is not permitted -> reset to 方便速食
        mockSearchResults(['方便速食']);
        // level 2: default value is not valid for the new parent -> reset to the first child
        mockSearchResults(['方便面']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['饮料'],
            }),
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['奶茶'],
                parentFieldId: 'dim_categories_cls_1',
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result.dimensions[0].values).toEqual(['方便速食']);
        expect(result.dimensions[1].values).toEqual(['方便面']);
        // The child request must use the reset parent value
        const childRequest = JSON.parse(String(api.mock.calls[1][0].body)) as {
            filters: { and: { values: string[] }[] };
        };
        expect(childRequest.filters.and).toContainEqual(
            expect.objectContaining({ values: ['方便速食'] }),
        );
    });

    it('resets the invalid default and cascades with the new value in an effective condition', async () => {
        // 一级：默认值 饮料 不可用 → 自动选中第一个可用值 方便速食
        mockSearchResults(['方便速食']);
        // 二级：在新父级下默认值 奶茶 不可用 → 自动选中第一个可用值 方便面
        mockSearchResults(['方便面']);

        const dateFilter: DashboardFilterRule = {
            id: 'time',
            target: { fieldId: 'orders_order_date', tableName: 'orders' },
            operator: FilterOperator.IN_THE_PAST,
            values: [13],
            label: undefined,
            settings: { unitOfTime: UnitOfTime.months, completed: false },
        };
        const filters = asFilters([
            dateFilter,
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['饮料'],
            }),
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['奶茶'],
                parentFieldId: 'dim_categories_cls_1',
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        // 默认值不可用时自动选中第一个可用值
        expect(result.dimensions[1].values).toEqual(['方便速食']);
        expect(result.dimensions[2].values).toEqual(['方便面']);

        // 子级的查询条件：父级用的是重置后的值，且必须以生效状态发送
        // （disabled 会被编译器渲染成 1=1，父级条件就整个失效了）
        const childBody = JSON.parse(String(api.mock.calls[1][0].body));
        expect(childBody.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'dim_categories_cls_1',
                    }),
                    values: ['方便速食'],
                    disabled: false,
                }),
                // 日期条件的单位不能丢，否则「13 个月」会退化成「13 天」
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_order_date',
                    }),
                    values: [13],
                    settings: { unitOfTime: 'months', completed: false },
                    disabled: false,
                }),
            ]),
        );
    });

    it('resolves the parent before the child even when the dimensions are not ordered by level', async () => {
        mockSearchResults(['方便速食']);
        mockSearchResults(['方便面']);

        const filters = asFilters([
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['奶茶'],
                parentFieldId: 'dim_categories_cls_1',
            }),
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['饮料'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result.dimensions[0].values).toEqual(['方便面']);
        expect(result.dimensions[1].values).toEqual(['方便速食']);
        const parentRequestUrl = String(api.mock.calls[0][0].url);
        expect(parentRequestUrl).toContain('dim_categories_cls_1');
    });

    it('does not change values when field/search fails', async () => {
        api.mockRejectedValueOnce(new Error('network'));
        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['Z'],
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual(['Z']);
    });

    it('skips disabled and non-EQUALS category filters without requesting', async () => {
        const filters = asFilters([
            categoryFilter({
                id: 'disabled',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
                disabled: true,
            }),
            categoryFilter({
                id: 'not-equals',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['B'],
                operator: FilterOperator.NOT_NULL,
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(api).not.toHaveBeenCalled();
    });

    it('initializes parent then child serially with left filters and parent override', async () => {
        mockSearchResults(['P1']);
        mockSearchResults(['C2']);

        const filters = asFilters([
            timeFilter(),
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['P0'],
            }),
            categoryFilter({
                id: 'l2',
                fieldId: 'dim_categories_cls_2',
                categoryLevel: 2,
                values: ['C0'],
                parentFieldId: 'dim_categories_cls_1',
            }),
        ]);

        const result = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(2);
        const firstBody = JSON.parse(String(api.mock.calls[0][0].body));
        const secondBody = JSON.parse(String(api.mock.calls[1][0].body));

        expect(firstBody.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_order_date',
                    }),
                    values: ['2024-01'],
                }),
            ]),
        );
        expect(secondBody.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_order_date',
                    }),
                    values: ['2024-01'],
                }),
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'dim_categories_cls_1',
                    }),
                    values: ['P1'],
                }),
            ]),
        );
        expect(result.dimensions[1].values).toEqual(['P1']);
        expect(result.dimensions[2].values).toEqual(['C2']);
    });

    it('dedupes concurrent field/search requests with the same cache key', async () => {
        let resolveRequest: ((value: unknown) => void) | undefined;
        api.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveRequest = resolve;
                }) as never,
        );

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);

        const p1 = initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );
        const p2 = initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(1);
        resolveRequest?.({
            search: '',
            results: ['A'],
            cached: false,
            refreshedAt: new Date(),
        });

        await expect(p1).resolves.toBe(filters);
        await expect(p2).resolves.toBe(filters);
    });

    it('serializes concurrent field/search requests to protect warehouse memory', async () => {
        let resolveFirst: ((value: unknown) => void) | undefined;
        api.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }) as never,
        );
        mockSearchResults(['B']);

        const p1 = initializeCategoryFiltersAsync(
            asFilters([
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['A'],
                }),
            ]),
            projectUuid,
            dashboardContext,
        );
        const p2 = initializeCategoryFiltersAsync(
            asFilters([
                categoryFilter({
                    id: 'l2',
                    fieldId: 'dim_categories_cls_2',
                    categoryLevel: 2,
                    values: ['B'],
                }),
            ]),
            projectUuid,
            dashboardContext,
        );

        // 并发 1：第二个请求必须等第一个结束才发出
        expect(api).toHaveBeenCalledTimes(1);

        resolveFirst?.({
            search: '',
            results: ['A'],
            cached: false,
            refreshedAt: new Date(),
        });

        await p1;
        await p2;

        expect(api).toHaveBeenCalledTimes(2);
    });

    it('drops queued requests when the session is cancelled', async () => {
        const session = createCategoryRequestSession();
        let resolveFirst: ((value: unknown) => void) | undefined;
        api.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }) as never,
        );
        mockSearchResults(['B']);

        const p1 = initializeCategoryFiltersAsync(
            asFilters([
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['A'],
                }),
            ]),
            projectUuid,
            dashboardContext,
            { session },
        );
        const p2 = initializeCategoryFiltersAsync(
            asFilters([
                categoryFilter({
                    id: 'l2',
                    fieldId: 'dim_categories_cls_2',
                    categoryLevel: 2,
                    values: ['B'],
                }),
            ]),
            projectUuid,
            dashboardContext,
            { session },
        );

        expect(api).toHaveBeenCalledTimes(1);

        // 用户又改了一次：旧会话作废
        session.cancel();

        resolveFirst?.({
            search: '',
            results: ['A'],
            cached: false,
            refreshedAt: new Date(),
        });

        const result1 = await p1;
        const result2 = await p2;

        // 排队中的第二个请求被丢弃：不会再发出去
        expect(api).toHaveBeenCalledTimes(1);
        // 取消的操作不写回：值保持原样
        expect(result1).toEqual(
            asFilters([
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['A'],
                }),
            ]),
        );
        expect(result2).toEqual(
            asFilters([
                categoryFilter({
                    id: 'l2',
                    fieldId: 'dim_categories_cls_2',
                    categoryLevel: 2,
                    values: ['B'],
                }),
            ]),
        );
    });

    it('does not send a request when the session is already cancelled', async () => {
        const session = createCategoryRequestSession();
        session.cancel();

        await initializeCategoryFiltersAsync(
            asFilters([
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['A'],
                }),
            ]),
            projectUuid,
            dashboardContext,
            { session },
        );

        expect(api).not.toHaveBeenCalled();
    });

    it('does not reuse a cancelled request result in the cache', async () => {
        const session = createCategoryRequestSession();
        let resolveFirst: ((value: unknown) => void) | undefined;
        api.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }) as never,
        );
        mockSearchResults(['A']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);

        const p1 = initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            { session },
        );

        // 取消会话：缓存作废、请求 abort
        session.cancel();
        resolveFirst?.({
            search: '',
            results: ['A'],
            cached: false,
            refreshedAt: new Date(),
        });
        await p1;

        // 新会话重新请求（不复用被取消的那次）
        const p2 = initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            { session: createCategoryRequestSession() },
        );
        await p2;

        expect(api).toHaveBeenCalledTimes(2);
    });

    it('can be cancelled repeatedly without side effects', () => {
        const session = createCategoryRequestSession();
        expect(session.isCancelled()).toBe(false);
        session.cancel();
        session.cancel();
        expect(session.isCancelled()).toBe(true);
    });

    it('does not share cache across different filter contexts', async () => {
        mockSearchResults(['A']);
        mockSearchResults(['B']);

        await initializeCategoryFiltersAsync(
            asFilters([
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['A'],
                }),
            ]),
            projectUuid,
            dashboardContext,
        );

        await initializeCategoryFiltersAsync(
            asFilters([
                timeFilter(),
                categoryFilter({
                    id: 'l1',
                    fieldId: 'dim_categories_cls_1',
                    categoryLevel: 1,
                    values: ['A'],
                }),
            ]),
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(2);
    });

    it('re-requests after the 5s cache TTL expires', async () => {
        vi.useFakeTimers();
        mockSearchResults(['A']);
        mockSearchResults(['A']);

        const filters = asFilters([
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['A'],
            }),
        ]);

        await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );
        expect(api).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5001);

        await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );
        expect(api).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });
});

describe('updateCategoryFilterCascadeAsync', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
    });

    it('cascades parent change into child values', async () => {
        mockSearchResults(['C1', 'C2']);

        const parent = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['P2'],
        });
        const child = categoryFilter({
            id: 'l2',
            fieldId: 'dim_categories_cls_2',
            categoryLevel: 2,
            values: ['OLD'],
            parentFieldId: 'dim_categories_cls_1',
        });
        const filters = asFilters([parent, child]);

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            parent,
            'P2',
            projectUuid,
            dashboardContext,
        );

        expect(result.dimensions[1].values).toEqual(['C1']);
        const body = JSON.parse(String(api.mock.calls[0][0].body));
        expect(body.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'dim_categories_cls_1',
                    }),
                    values: ['P2'],
                }),
            ]),
        );
    });

    it('cascades into a child that has a confirmed value but no default', async () => {
        mockSearchResults(['C1', 'C2']);

        const parent = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['P2'],
        });
        // 下级类目没有配置默认值（disabled），但当前有确认选中的值
        const child = categoryFilter({
            id: 'l2',
            fieldId: 'dim_categories_cls_2',
            categoryLevel: 2,
            values: ['OLD'],
            parentFieldId: 'dim_categories_cls_1',
            disabled: true,
        });
        const filters = asFilters([parent, child]);

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            parent,
            'P2',
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(1);
        expect(result.dimensions[1].values).toEqual(['C1']);
        // 有确认选中的值 → 筛选器恢复成可用状态
        expect(result.dimensions[1].disabled).toBe(false);
    });

    it('does not cascade into a child without a confirmed value', async () => {
        mockSearchResults(['C1', 'C2']);

        const parent = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['P2'],
        });
        // 下级类目既没有默认值也没有确认选中的值 → 保持为空，不发请求
        const child = categoryFilter({
            id: 'l2',
            fieldId: 'dim_categories_cls_2',
            categoryLevel: 2,
            parentFieldId: 'dim_categories_cls_1',
            disabled: true,
        });
        const filters = asFilters([parent, child]);

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            parent,
            'P2',
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(api).not.toHaveBeenCalled();
    });

    it('cascades the whole chain when the middle level has a confirmed value', async () => {
        mockSearchResults(['C1', 'C2']);
        mockSearchResults(['G1']);

        const parent = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['P2'],
        });
        const child = categoryFilter({
            id: 'l2',
            fieldId: 'dim_categories_cls_2',
            categoryLevel: 2,
            values: ['OLD'],
            parentFieldId: 'dim_categories_cls_1',
            disabled: true,
        });
        const grandChild = categoryFilter({
            id: 'l3',
            fieldId: 'dim_categories_cls_3',
            categoryLevel: 3,
            values: ['OLD_G'],
            parentFieldId: 'dim_categories_cls_2',
            disabled: true,
        });
        const filters = asFilters([parent, child, grandChild]);

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            parent,
            'P2',
            projectUuid,
            dashboardContext,
        );

        expect(result.dimensions[1].values).toEqual(['C1']);
        expect(result.dimensions[2].values).toEqual(['G1']);
        // 孙级的查询条件带上父级（一级）联动后的值
        const grandChildBody = JSON.parse(String(api.mock.calls[1][0].body));
        expect(grandChildBody.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'dim_categories_cls_2',
                    }),
                    values: ['C1'],
                }),
            ]),
        );
    });

    it('preserves non-EQUALS child operators during cascade', async () => {
        const parent = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['P2'],
        });
        const child = categoryFilter({
            id: 'l2',
            fieldId: 'dim_categories_cls_2',
            categoryLevel: 2,
            values: ['OLD'],
            parentFieldId: 'dim_categories_cls_1',
            operator: FilterOperator.NOT_NULL,
        });
        const filters = asFilters([parent, child]);

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            parent,
            'P2',
            projectUuid,
            dashboardContext,
        );

        expect(result).toBe(filters);
        expect(api).not.toHaveBeenCalled();
    });
});

describe('category filter leftover values', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
    });

    it('keeps child default values when parent changes and no replacement exists', async () => {
        mockSearchResults([]);

        const parent = categoryFilter({
            id: 'l1',
            fieldId: 'dim_categories_cls_1',
            categoryLevel: 1,
            values: ['P2'],
        });
        const child = categoryFilter({
            id: 'l2',
            fieldId: 'dim_categories_cls_2',
            categoryLevel: 2,
            values: ['尹佬'],
            parentFieldId: 'dim_categories_cls_1',
        });
        const filters = asFilters([parent, child]);

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            parent,
            'P2',
            projectUuid,
            dashboardContext,
        );

        // 无法区分「子类目在新父级下不存在」与「行级过滤把候选值都过滤了」：
        // 保留原值，不清空也不禁用
        expect(result.dimensions[1].disabled).toBeUndefined();
        expect(result.dimensions[1].values).toEqual(['尹佬']);
    });

    it('does not send disabled leftover values to field/search', async () => {
        mockSearchResults(['P1']);

        const filters = asFilters([
            {
                ...timeFilter(),
                disabled: true,
            },
            categoryFilter({
                id: 'l1',
                fieldId: 'dim_categories_cls_1',
                categoryLevel: 1,
                values: ['P0'],
            }),
        ]);

        await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(api).toHaveBeenCalledTimes(1);
        const body = JSON.parse(String(api.mock.calls[0][0].body));
        expect(body.filters).toBeUndefined();
    });
});

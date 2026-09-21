import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import {
    clearFieldSearchCacheForTests,
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

const asFilters = (
    dimensions: DashboardFilterRule[],
): DashboardFilters => ({
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

    it('does not change values when field/search returns empty', async () => {
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

        expect(result).toBe(filters);
        expect(result.dimensions[0].values).toEqual(['Z']);
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
                    target: { fieldId: 'orders_order_date' },
                    values: ['2024-01'],
                }),
            ]),
        );
        expect(secondBody.filters.and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: { fieldId: 'orders_order_date' },
                    values: ['2024-01'],
                }),
                expect.objectContaining({
                    target: { fieldId: 'dim_categories_cls_1' },
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
                    target: { fieldId: 'dim_categories_cls_1' },
                    values: ['P2'],
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

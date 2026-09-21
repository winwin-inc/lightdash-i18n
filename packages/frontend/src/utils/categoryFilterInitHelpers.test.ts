import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildOptimisticCategoryDisplayState,
    decideCategoryInit,
    getDescendantCategoryFilterIds,
    mergeDimensionIntoDisplayState,
    resolveActiveTabCategoryInit,
    shouldApplyCategoryInitResult,
    shouldStartCategoryInitTask,
} from './categoryFilterInitHelpers';
import { getCategoryFiltersSignature } from './categoryFilters';

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'slug',
    dashboardName: 'name',
};

const category = (values: string[]): DashboardFilterRule => ({
    id: 'l1',
    target: { fieldId: 'dim_categories_cls_1', tableName: 'dim_categories' },
    operator: FilterOperator.EQUALS,
    values,
    label: undefined,
    categoryLevel: 1,
});

const filtersOf = (values: string[]): DashboardFilters => ({
    dimensions: [category(values)],
    metrics: [],
    tableCalculations: [],
});

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

describe('decideCategoryInit', () => {
    it('skips when category filters cannot be applied', () => {
        expect(
            decideCategoryInit({
                canApplyCategoryFilters: false,
                filters: filtersOf(['A']),
                projectUuid,
                dashboardContext,
                processedSignature: null,
            }),
        ).toEqual({ action: 'skip-ready' });
    });

    it('skips when there is no project uuid or no category filters', () => {
        expect(
            decideCategoryInit({
                canApplyCategoryFilters: true,
                filters: filtersOf(['A']),
                projectUuid: undefined,
                dashboardContext,
                processedSignature: null,
            }),
        ).toEqual({ action: 'skip-ready' });

        expect(
            decideCategoryInit({
                canApplyCategoryFilters: true,
                filters: emptyFilters,
                projectUuid,
                dashboardContext,
                processedSignature: null,
            }),
        ).toEqual({ action: 'skip-ready' });
    });

    it('skips when signature was already processed', () => {
        const filters = filtersOf(['A']);
        const signature = getCategoryFiltersSignature(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(
            decideCategoryInit({
                canApplyCategoryFilters: true,
                filters,
                projectUuid,
                dashboardContext,
                processedSignature: signature,
            }),
        ).toEqual({ action: 'skip-already-processed' });
    });

    it('starts when signature changed', () => {
        const filters = filtersOf(['B']);
        const decision = decideCategoryInit({
            canApplyCategoryFilters: true,
            filters,
            projectUuid,
            dashboardContext,
            processedSignature: 'old',
        });

        expect(decision).toEqual({
            action: 'start',
            signature: getCategoryFiltersSignature(
                filters,
                projectUuid,
                dashboardContext,
            ),
        });
    });
});

describe('shouldApplyCategoryInitResult', () => {
    it('rejects stale generations', () => {
        const filters = filtersOf(['A']);
        const signature = getCategoryFiltersSignature(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(
            shouldApplyCategoryInitResult({
                requestGeneration: 1,
                currentGeneration: 2,
                requestSignature: signature,
                currentFilters: filters,
                projectUuid,
                dashboardContext,
            }),
        ).toBe(false);
    });

    it('rejects when current filters no longer match the request signature', () => {
        const requestFilters = filtersOf(['A']);
        const requestSignature = getCategoryFiltersSignature(
            requestFilters,
            projectUuid,
            dashboardContext,
        );

        expect(
            shouldApplyCategoryInitResult({
                requestGeneration: 3,
                currentGeneration: 3,
                requestSignature,
                currentFilters: filtersOf(['B']),
                projectUuid,
                dashboardContext,
            }),
        ).toBe(false);
    });

    it('accepts matching generation and signature', () => {
        const filters = filtersOf(['A']);
        const signature = getCategoryFiltersSignature(
            filters,
            projectUuid,
            dashboardContext,
        );

        expect(
            shouldApplyCategoryInitResult({
                requestGeneration: 3,
                currentGeneration: 3,
                requestSignature: signature,
                currentFilters: filters,
                projectUuid,
                dashboardContext,
            }),
        ).toBe(true);
    });
});

describe('resolveActiveTabCategoryInit', () => {
    const tabA = filtersOf(['A']);
    const tabB = filtersOf(['B']);

    it('starts only the active tab on first visit', () => {
        const decision = resolveActiveTabCategoryInit({
            tabFilters: { 'tab-a': tabA, 'tab-b': tabB },
            activeTabUuid: 'tab-a',
            canApplyCategoryFilters: true,
            projectUuid,
            dashboardContext,
            processedSignatures: {},
        });

        expect(decision).toEqual({
            action: 'start',
            signature: getCategoryFiltersSignature(
                tabA,
                projectUuid,
                dashboardContext,
            ),
        });
    });

    it('does not restart a processed tab when another tab changes', () => {
        const signature = getCategoryFiltersSignature(
            tabA,
            projectUuid,
            dashboardContext,
        );

        expect(
            resolveActiveTabCategoryInit({
                tabFilters: { 'tab-a': tabA, 'tab-b': filtersOf(['C']) },
                activeTabUuid: 'tab-a',
                canApplyCategoryFilters: true,
                projectUuid,
                dashboardContext,
                processedSignatures: { 'tab-a': signature },
            }),
        ).toEqual({ action: 'skip-already-processed' });
    });

    it('does not initialize when category filters are disabled', () => {
        expect(
            resolveActiveTabCategoryInit({
                tabFilters: { 'tab-a': tabA },
                activeTabUuid: 'tab-a',
                canApplyCategoryFilters: false,
                projectUuid,
                dashboardContext,
                processedSignatures: {},
            }),
        ).toEqual({ action: 'skip-ready' });
    });

    it('does not initialize without an active tab', () => {
        expect(
            resolveActiveTabCategoryInit({
                tabFilters: { 'tab-a': tabA },
                activeTabUuid: undefined,
                canApplyCategoryFilters: true,
                projectUuid,
                dashboardContext,
                processedSignatures: {},
            }),
        ).toEqual({ action: 'none' });
    });
});

describe('shouldStartCategoryInitTask', () => {
    it('starts when decision is start and no pending signature', () => {
        expect(
            shouldStartCategoryInitTask({
                decision: { action: 'start', signature: 'sig-a' },
                pendingSignature: null,
            }),
        ).toBe(true);
    });

    it('does not start a second task for the same pending signature', () => {
        expect(
            shouldStartCategoryInitTask({
                decision: { action: 'start', signature: 'sig-a' },
                pendingSignature: 'sig-a',
            }),
        ).toBe(false);
    });

    it('starts when the pending signature differs', () => {
        expect(
            shouldStartCategoryInitTask({
                decision: { action: 'start', signature: 'sig-b' },
                pendingSignature: 'sig-a',
            }),
        ).toBe(true);
    });

    it('does not start for non-start decisions', () => {
        expect(
            shouldStartCategoryInitTask({
                decision: { action: 'skip-already-processed' },
                pendingSignature: null,
            }),
        ).toBe(false);
    });
});

describe('optimistic category display helpers', () => {
    const l1: DashboardFilterRule = {
        id: 'l1',
        target: { fieldId: 'dim_categories_cls_1', tableName: 'dim_categories' },
        operator: FilterOperator.EQUALS,
        values: ['食品'],
        label: undefined,
        categoryLevel: 1,
    };
    const l2: DashboardFilterRule = {
        id: 'l2',
        target: { fieldId: 'dim_categories_cls_2', tableName: 'dim_categories' },
        operator: FilterOperator.EQUALS,
        values: ['乳制品'],
        label: undefined,
        categoryLevel: 2,
        parentFieldId: 'dim_categories_cls_1',
    };
    const l3: DashboardFilterRule = {
        id: 'l3',
        target: { fieldId: 'dim_categories_cls_3', tableName: 'dim_categories' },
        operator: FilterOperator.EQUALS,
        values: ['冷饮冻食'],
        label: undefined,
        categoryLevel: 3,
        parentFieldId: 'dim_categories_cls_2',
    };
    const timeFilter: DashboardFilterRule = {
        id: 'time',
        target: { fieldId: 'orders_order_date', tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: ['近3个月'],
        label: undefined,
    };

    const hierarchyFilters: DashboardFilters = {
        dimensions: [l1, l2, l3],
        metrics: [],
        tableCalculations: [],
    };

    it('collects all descendant category filter ids', () => {
        expect(
            getDescendantCategoryFilterIds(
                hierarchyFilters,
                'dim_categories_cls_1',
            ),
        ).toEqual(['l2', 'l3']);
        expect(
            getDescendantCategoryFilterIds(
                hierarchyFilters,
                'dim_categories_cls_2',
            ),
        ).toEqual(['l3']);
    });

    it('builds optimistic display with new parent and updating children', () => {
        const nextL1 = { ...l1, values: ['饮料'] };
        const display = buildOptimisticCategoryDisplayState(
            hierarchyFilters,
            nextL1,
            0,
        );

        expect(display.filters.dimensions[0].values).toEqual(['饮料']);
        // 已提交筛选未改；展示态独立
        expect(hierarchyFilters.dimensions[0].values).toEqual(['食品']);
        // 子级仍显示旧值，但标记为更新中
        expect(display.filters.dimensions[1].values).toEqual(['乳制品']);
        expect(display.updatingFilterIds).toEqual(['l2', 'l3']);
    });

    it('merges a second category selection onto the latest display state', () => {
        const first = buildOptimisticCategoryDisplayState(
            hierarchyFilters,
            { ...l1, values: ['饮料'] },
            0,
        );
        const second = mergeDimensionIntoDisplayState(
            first.filters,
            { ...l1, values: ['休闲食品'] },
            0,
        );

        expect(second.filters.dimensions[0].values).toEqual(['休闲食品']);
        expect(second.updatingFilterIds).toEqual(['l2', 'l3']);
    });

    it('merges a non-category change into display without losing category selection', () => {
        const withCategories = buildOptimisticCategoryDisplayState(
            {
                dimensions: [timeFilter, l1, l2, l3],
                metrics: [],
                tableCalculations: [],
            },
            { ...l1, values: ['饮料'] },
            1,
        );
        const withTime = mergeDimensionIntoDisplayState(
            withCategories.filters,
            { ...timeFilter, values: ['近1个月'] },
            0,
        );

        expect(withTime.filters.dimensions[0].values).toEqual(['近1个月']);
        expect(withTime.filters.dimensions[1].values).toEqual(['饮料']);
    });
});

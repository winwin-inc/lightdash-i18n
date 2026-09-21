import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    decideCategoryInit,
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

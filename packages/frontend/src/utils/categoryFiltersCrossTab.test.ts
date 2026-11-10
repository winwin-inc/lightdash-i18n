import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import {
    clearFieldSearchCacheForTests,
    updateCategoryCascadeForLocationsAsync,
} from './categoryFilters';
import { applySelectionToTabFilters } from './userFilterSelections';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'dash-slug',
    dashboardName: 'Dash Name',
};

const TAB_A = 'tab-a';
const TAB_B = 'tab-b';

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

/**
 * 模拟「用户在 Tab A 修改 → 其他兼容 Tab 继承 → 接收方子类目重新级联」的全流程。
 *
 * 步骤与 DashboardProvider 中的实现一致：
 * 1. applySelectionToTabFilters：把来源 Tab 的选择同步到其他 Tab
 * 2. updateCategoryCascadeForLocationsAsync：对接收方 Tab 触发子类目级联
 */
const syncAndCascade = async (
    tabFilters: Record<string, DashboardFilters>,
    sourceRule: DashboardFilterRule,
    newValue: string,
) => {
    const synced = applySelectionToTabFilters(
        tabFilters,
        sourceRule,
        'dimension',
        TAB_A,
    );
    const receivedRule = synced.tabFilters[TAB_B]?.dimensions.find(
        (rule) => rule.target.fieldId === sourceRule.target.fieldId,
    );
    if (!receivedRule) {
        return { tabFilters: synced.tabFilters, cascaded: synced };
    }
    const cascaded = await updateCategoryCascadeForLocationsAsync(
        {
            globalFilters: asFilters([]),
            tabFilters: synced.tabFilters,
        },
        [
            {
                location: { scope: 'tab', tabUuid: TAB_B },
                rule: receivedRule,
                newValue,
            },
        ],
        projectUuid,
        dashboardContext,
    );
    return { tabFilters: cascaded.tabFilters, cascaded };
};

describe('categoryFilters cross tab inheritance', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
    });

    afterEach(() => {
        clearFieldSearchCacheForTests();
    });

    it('re-cascades the receiving tab children after inheriting a value', async () => {
        const sourceRule = categoryFilter({
            id: 'a2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: ['new'],
        });
        const tabFilters: Record<string, DashboardFilters> = {
            [TAB_A]: asFilters([sourceRule]),
            [TAB_B]: asFilters([
                categoryFilter({
                    id: 'b2',
                    fieldId: 'cls_2',
                    categoryLevel: 2,
                    values: ['old'],
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
                categoryFilter({
                    id: 'b4',
                    fieldId: 'cls_4',
                    categoryLevel: 4,
                    values: ['old4'],
                    parentFieldId: 'cls_3',
                    parentScope: 'tab',
                    parentTabUuid: TAB_B,
                }),
            ]),
        };

        // 三级、四级依次按新父级重新解析
        mockSearchResults(['new3']);
        mockSearchResults(['new4']);

        const { tabFilters: next } = await syncAndCascade(
            tabFilters,
            sourceRule,
            'new',
        );

        const tabB = next[TAB_B];
        expect(tabB.dimensions[0].values).toEqual(['new']);
        expect(tabB.dimensions[1].values).toEqual(['new3']);
        expect(tabB.dimensions[2].values).toEqual(['new4']);
    });

    it('keeps the receiving tab child empty when it has no confirmed value', async () => {
        const sourceRule = categoryFilter({
            id: 'a2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: ['new'],
        });
        const tabFilters: Record<string, DashboardFilters> = {
            [TAB_A]: asFilters([sourceRule]),
            [TAB_B]: asFilters([
                categoryFilter({
                    id: 'b2',
                    fieldId: 'cls_2',
                    categoryLevel: 2,
                    values: ['old'],
                }),
                categoryFilter({
                    id: 'b3',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    parentFieldId: 'cls_2',
                    parentScope: 'tab',
                    parentTabUuid: TAB_B,
                    disabled: true,
                }),
            ]),
        };

        const { tabFilters: next } = await syncAndCascade(
            tabFilters,
            sourceRule,
            'new',
        );

        // 没有确认值（作者没配默认值）→ 不请求仓库，保持「任何值」
        expect(api).not.toHaveBeenCalled();
        expect(next[TAB_B].dimensions[1].values).toBeUndefined();
    });

    it('does not cascade a receiving tab child without a parent binding', async () => {
        const sourceRule = categoryFilter({
            id: 'a2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: ['new'],
        });
        const tabFilters: Record<string, DashboardFilters> = {
            [TAB_A]: asFilters([sourceRule]),
            [TAB_B]: asFilters([
                categoryFilter({
                    id: 'b2',
                    fieldId: 'cls_2',
                    categoryLevel: 2,
                    values: ['old'],
                }),
                categoryFilter({
                    id: 'b3',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    values: ['old3'],
                }),
            ]),
        };

        const { tabFilters: next } = await syncAndCascade(
            tabFilters,
            sourceRule,
            'new',
        );

        expect(api).not.toHaveBeenCalled();
        expect(next[TAB_B].dimensions[1].values).toEqual(['old3']);
    });

    it('does not inherit into tabs with incompatible rules', async () => {
        const sourceRule = categoryFilter({
            id: 'a2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: ['new'],
        });
        const tabFilters: Record<string, DashboardFilters> = {
            [TAB_A]: asFilters([sourceRule]),
            [TAB_B]: asFilters([
                // 层级不一致 → 规则不兼容 → 不继承
                categoryFilter({
                    id: 'b2',
                    fieldId: 'cls_2',
                    categoryLevel: 3,
                    values: ['old'],
                }),
            ]),
        };

        const synced = applySelectionToTabFilters(
            tabFilters,
            sourceRule,
            'dimension',
            TAB_A,
        );

        expect(synced.changedTabUuids).toEqual([]);
        expect(synced.tabFilters[TAB_B].dimensions[0].values).toEqual(['old']);
    });

    it('clears the receiving tab children when the inherited value is cleared', async () => {
        const sourceRule = categoryFilter({
            id: 'a2',
            fieldId: 'cls_2',
            categoryLevel: 2,
            values: [],
        });
        const tabFilters: Record<string, DashboardFilters> = {
            [TAB_A]: asFilters([sourceRule]),
            [TAB_B]: asFilters([
                categoryFilter({
                    id: 'b2',
                    fieldId: 'cls_2',
                    categoryLevel: 2,
                    values: ['old'],
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
        };

        const { tabFilters: next } = await syncAndCascade(
            tabFilters,
            sourceRule,
            '',
        );

        // 父级没值 → 子级清空，避免「父级空、子级还留着旧值」
        expect(next[TAB_B].dimensions[0].values).toEqual([]);
        expect(next[TAB_B].dimensions[1].values).toEqual([]);
    });
});

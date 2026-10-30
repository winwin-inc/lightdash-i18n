import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import {
    buildCategoryChain,
    findParentCategoryEntry,
    isCategoryField,
} from '../../../utils/categoryFilters';
import {
    applyBatchCategoryBindingPlan,
    buildBatchCategoryBindingPlan,
    candidateToParentFilterRef,
    getCategoryLevelFromLabel,
    isSameParentBinding,
    type BatchCategoryBindingEntry,
    type BatchCategoryBindingPlan,
} from './batchCategoryBinding';

type RuleOverrides = Partial<DashboardFilterRule> & {
    id: string;
    fieldId: string;
    tableName?: string;
};

const rule = (overrides: RuleOverrides): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: overrides.tableName ?? 'mart_a',
        ...(overrides.target ?? {}),
    },
    operator: overrides.operator ?? FilterOperator.EQUALS,
    values: overrides.values,
    label: overrides.label,
    categoryLevel: overrides.categoryLevel,
    parentFieldId: overrides.parentFieldId,
    parentScope: overrides.parentScope,
    parentTabUuid: overrides.parentTabUuid,
});

/** 当前 Tab 的类目筛选器（列名约定 cls_1..cls_4） */
const tabRule = (
    level: 1 | 2 | 3 | 4,
    overrides: Partial<RuleOverrides> = {},
) =>
    rule({
        id: `tab-cls-${level}`,
        fieldId: `mart_a_cls_${level}`,
        categoryLevel: level,
        ...overrides,
    });

/** 全局类目筛选器（表名不同，模拟跨 mart） */
const globalRule = (
    level: 1 | 2 | 3 | 4,
    overrides: Partial<RuleOverrides> = {},
) =>
    rule({
        id: `global-cls-${level}`,
        fieldId: `mart_global_cls_${level}`,
        tableName: 'mart_global',
        categoryLevel: level,
        ...overrides,
    });

const TAB_UUID = 'tab-1';

const planFor = (
    filters: DashboardFilterRule[],
    globalFilters: DashboardFilterRule[] = [],
    tabUuid: string = TAB_UUID,
): BatchCategoryBindingPlan =>
    buildBatchCategoryBindingPlan({ filters, globalFilters, tabUuid });

const entryOf = (
    plan: BatchCategoryBindingPlan,
    filterId: string,
): BatchCategoryBindingEntry => {
    const entry = plan.find((item) => item.filter.id === filterId);
    if (!entry) throw new Error(`plan entry not found: ${filterId}`);
    return entry;
};

const allIds = (plan: BatchCategoryBindingPlan): Set<string> =>
    new Set(plan.map((entry) => entry.filter.id));

describe('getCategoryLevelFromLabel', () => {
    it('detects chinese category labels', () => {
        expect(
            getCategoryLevelFromLabel(
                rule({ id: 'a', fieldId: 'f', label: '一级类目' }),
            ),
        ).toBe(1);
        expect(
            getCategoryLevelFromLabel(
                rule({
                    id: 'b',
                    fieldId: 'f',
                    target: {
                        fieldId: 'f',
                        tableName: 't',
                        fieldLabel: '四级类目名称',
                    },
                }),
            ),
        ).toBe(4);
    });

    it('detects english category labels but ignores level-only wording', () => {
        expect(
            getCategoryLevelFromLabel(
                rule({ id: 'a', fieldId: 'f', label: 'Level 3 Category' }),
            ),
        ).toBe(3);
        expect(
            getCategoryLevelFromLabel(
                rule({ id: 'b', fieldId: 'f', label: 'Level 2 approval' }),
            ),
        ).toBeNull();
    });

    it('returns null when there is no label', () => {
        expect(
            getCategoryLevelFromLabel(rule({ id: 'a', fieldId: 'f' })),
        ).toBeNull();
    });
});

describe('isSameParentBinding', () => {
    it('treats legacy bindings without scope as the same parent', () => {
        expect(
            isSameParentBinding(
                { scope: null, tabUuid: null, fieldId: 'p' },
                { scope: 'tab', tabUuid: TAB_UUID, fieldId: 'p' },
            ),
        ).toBe(true);
    });

    it('distinguishes scope and tab', () => {
        expect(
            isSameParentBinding(
                { scope: 'global', tabUuid: null, fieldId: 'p' },
                { scope: 'tab', tabUuid: TAB_UUID, fieldId: 'p' },
            ),
        ).toBe(false);
        expect(
            isSameParentBinding(
                { scope: 'tab', tabUuid: 'tab-a', fieldId: 'p' },
                { scope: 'tab', tabUuid: 'tab-b', fieldId: 'p' },
            ),
        ).toBe(false);
    });
});

describe('buildBatchCategoryBindingPlan', () => {
    it('prefers the current tab parent over a global parent at the same level', () => {
        const plan = planFor(
            [tabRule(2), tabRule(3)],
            [globalRule(1), globalRule(2)],
        );

        const child = entryOf(plan, 'tab-cls-3');
        expect(child.categoryLevel).toBe(3);
        expect(child.resolvedParent?.rule.id).toBe('tab-cls-2');
        expect(child.resolvedParent?.scope).toBe('tab');
        expect(child.resolvedParent?.tabUuid).toBe(TAB_UUID);
        expect(child.parentChanged).toBe(true);
    });

    it('falls back to the global parent when the current tab has no parent level', () => {
        // 一级类目只配在全局：Tab 二级 → 全局一级；Tab 三级 → Tab 二级
        const plan = planFor([tabRule(2), tabRule(3)], [globalRule(1)]);

        const level2 = entryOf(plan, 'tab-cls-2');
        expect(level2.resolvedParent?.rule.id).toBe('global-cls-1');
        expect(level2.resolvedParent?.scope).toBe('global');

        const level3 = entryOf(plan, 'tab-cls-3');
        expect(level3.resolvedParent?.rule.id).toBe('tab-cls-2');
        expect(level3.resolvedParent?.scope).toBe('tab');
    });

    it('uses the nearest lower level when the exact parent level does not exist anywhere', () => {
        // Tab 只配了三级，全局只有一级（没有二级）→ 三级绑定全局一级
        const plan = planFor([tabRule(3)], [globalRule(1)]);

        const child = entryOf(plan, 'tab-cls-3');
        expect(child.resolvedParent?.rule.id).toBe('global-cls-1');
        expect(child.skipReason).toBeNull();
    });

    it('prefers the nearest level before scope (global level 2 beats tab level 1)', () => {
        // 四级：三级缺失 → 二级（全局）比一级（当前 Tab）更近
        const plan = planFor([tabRule(1), tabRule(4)], [globalRule(2)]);

        const child = entryOf(plan, 'tab-cls-4');
        expect(child.resolvedParent?.rule.id).toBe('global-cls-2');
    });

    it('re-prioritizes an existing binding to the nearest parent level', () => {
        // 作者手工把三级绑到一级，但当前 Tab 有二级 → 批量绑定按「上一级优先」重算
        const child = tabRule(3, {
            parentFieldId: 'mart_a_cls_1',
            parentScope: 'tab',
            parentTabUuid: TAB_UUID,
        });
        const plan = planFor([tabRule(1), tabRule(2), child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent?.rule.id).toBe('tab-cls-1');
        expect(entry.resolvedParent?.rule.id).toBe('tab-cls-2');
        expect(entry.parentChanged).toBe(true);
        expect(entry.preserveExistingParent).toBe(false);
    });

    it('prefers the current tab parent over an existing global parent at the same level', () => {
        const child = tabRule(3, {
            parentFieldId: 'mart_global_cls_2',
            parentScope: 'global',
        });
        const plan = planFor([tabRule(2), child], [globalRule(2)]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent?.rule.id).toBe('global-cls-2');
        expect(entry.resolvedParent?.rule.id).toBe('tab-cls-2');
        expect(entry.resolvedParent?.scope).toBe('tab');
        expect(entry.parentChanged).toBe(true);
    });

    it('does not rewrite legacy bindings that only store parentFieldId', () => {
        const child = tabRule(3, { parentFieldId: 'mart_a_cls_2' });
        const plan = planFor([tabRule(2), child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent?.rule.id).toBe('tab-cls-2');
        expect(entry.parentChanged).toBe(false);
    });

    it('repairs an explicit scope that no longer matches the candidate', () => {
        // 绑的是全局字段，但该字段其实在当前 Tab 里 → 作用域写错了
        const child = tabRule(3, {
            parentFieldId: 'mart_a_cls_2',
            parentScope: 'global',
        });
        const plan = planFor([tabRule(2), child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent?.rule.id).toBe('tab-cls-2');
        expect(entry.parentChanged).toBe(true);
        expect(entry.resolvedParent?.scope).toBe('tab');
    });

    it('preserves the existing binding when there is no candidate at all', () => {
        // 父级字段不在当前 Tab / 全局里（可能是别的 Tab 的字段或已删除）
        const child = tabRule(3, {
            parentFieldId: 'other_tab_cls_1',
            parentScope: 'tab',
            parentTabUuid: 'tab-2',
        });
        const plan = planFor([child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent).toBeNull();
        expect(entry.resolvedParent).toBeNull();
        expect(entry.parentChanged).toBe(false);
        expect(entry.preserveExistingParent).toBe(true);
        expect(entry.skipReason).toBe('orphan-parent');

        const next = applyBatchCategoryBindingPlan([child], plan, allIds(plan));
        // 没有可用的新父级：原绑定不动，不会被静默清空
        expect(next[0]).toBe(child);
    });

    it('clears a stale parent on a level-1 category filter', () => {
        const level1 = tabRule(1, {
            parentFieldId: 'mart_a_cls_1',
            parentScope: 'tab',
        });
        const plan = planFor([level1]);

        const entry = entryOf(plan, 'tab-cls-1');
        expect(entry.resolvedParent).toBeNull();
        expect(entry.parentChanged).toBe(true);

        const next = applyBatchCategoryBindingPlan(
            [level1],
            plan,
            allIds(plan),
        );
        expect(next[0].parentFieldId).toBeUndefined();
        expect(next[0].parentScope).toBeUndefined();
        expect(next[0].parentTabUuid).toBeUndefined();
    });

    it('infers missing categoryLevel from column name and label', () => {
        const fromColumn = rule({
            id: 'from-column',
            fieldId: 'mart_a_cls_2',
            tableName: 'mart_a',
        });
        const fromLabel = rule({
            id: 'from-label',
            fieldId: 'mart_a_custom_level',
            label: '三级类目',
        });
        const plan = planFor([tabRule(1), fromColumn, fromLabel]);

        const columnEntry = entryOf(plan, 'from-column');
        expect(columnEntry.categoryLevel).toBe(2);
        expect(columnEntry.categoryLevelChanged).toBe(true);
        expect(columnEntry.resolvedParent?.rule.id).toBe('tab-cls-1');

        const labelEntry = entryOf(plan, 'from-label');
        expect(labelEntry.categoryLevel).toBe(3);
        expect(labelEntry.categoryLevelChanged).toBe(true);
        expect(labelEntry.resolvedParent?.rule.id).toBe('from-column');
    });

    it('ignores non-category filters (including sql columns with cls names)', () => {
        const sqlColumn = rule({
            id: 'sql-column',
            fieldId: 'cls_2',
            target: {
                fieldId: 'cls_2',
                tableName: 'mart_a',
                isSqlColumn: true,
            },
        });
        const plan = planFor([tabRule(1), sqlColumn]);

        expect(plan.map((entry) => entry.filter.id)).toEqual(['tab-cls-1']);
    });

    it('flags ambiguous parent candidates at the same level and scope', () => {
        const otherLevel2 = tabRule(2, {
            id: 'tab-cls-2-other-mart',
            fieldId: 'mart_b_cls_2',
            tableName: 'mart_b',
        });
        const plan = planFor([tabRule(2), otherLevel2, tabRule(3)]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.ambiguousParentCandidates).toBe(true);
        expect(entry.resolvedParent?.rule.id).toBe('tab-cls-2');
    });

    it('does not bind to a global parent without a declared category level', () => {
        // 全局一级只有 cls 列名、没有显式 categoryLevel：运行时不会把它当成类目筛选器
        // （isCategoryField 只认显式层级），绑定上去子级会被清空 → 不绑定
        const inferredGlobal = rule({
            id: 'global-inferred-1',
            fieldId: 'mart_global_cls_1',
            tableName: 'mart_global',
        });
        const plan = planFor([tabRule(2)], [inferredGlobal]);

        const entry = entryOf(plan, 'tab-cls-2');
        expect(entry.resolvedParent).toBeNull();
        expect(entry.skipReason).toBe('parent-missing-level');
    });

    it('normalizes the level of an inferred tab parent used by a selected child', () => {
        // Tab 一级只有 cls 列名、没有显式层级；子级仍可绑定，但应用时要补写一级的层级
        const inferredLevel1 = rule({
            id: 'tab-inferred-1',
            fieldId: 'mart_a_cls_1',
            tableName: 'mart_a',
        });
        const child = tabRule(2);
        const filters = [inferredLevel1, child];
        const plan = planFor(filters);

        const parentEntry = entryOf(plan, 'tab-inferred-1');
        expect(parentEntry.categoryLevelChanged).toBe(true);
        expect(entryOf(plan, 'tab-cls-2').resolvedParent?.rule.id).toBe(
            'tab-inferred-1',
        );

        const next = applyBatchCategoryBindingPlan(
            filters,
            plan,
            new Set(['tab-cls-2']),
        );

        // 祖先层级被隐式补写（否则运行时父子链路会断）
        expect(next[0].categoryLevel).toBe(1);
        // 但不隐式改写祖先自己的父级绑定
        expect(next[0].parentFieldId).toBeUndefined();
        expect(next[1].parentFieldId).toBe('mart_a_cls_1');
        expect(next[1].parentScope).toBe('tab');
        expect(next[1].parentTabUuid).toBe(TAB_UUID);
    });

    it('never binds a filter to itself', () => {
        const plan = planFor([tabRule(2), tabRule(3)], []);

        const level2 = entryOf(plan, 'tab-cls-2');
        expect(level2.resolvedParent).toBeNull();
        // 没有更低层级 → 它本身就是最高层级，不算异常
        expect(level2.skipReason).toBeNull();
        expect(level2.preserveExistingParent).toBe(false);
    });

    it('treats the lowest configured level as the root without a warning', () => {
        // 只有二级 / 三级：二级是根，不应提示「找不到父级」
        const plan = planFor([tabRule(2), tabRule(3)]);

        const level2 = entryOf(plan, 'tab-cls-2');
        expect(level2.categoryLevel).toBe(2);
        expect(level2.resolvedParent).toBeNull();
        expect(level2.skipReason).toBeNull();
        expect(level2.preserveExistingParent).toBe(false);

        const level3 = entryOf(plan, 'tab-cls-3');
        expect(level3.resolvedParent?.rule.id).toBe('tab-cls-2');
        expect(level3.parentChanged).toBe(true);
    });
});

describe('applyBatchCategoryBindingPlan', () => {
    it('writes categoryLevel and scoped parent fields', () => {
        const plan = planFor([tabRule(2)], [globalRule(1)]);

        const next = applyBatchCategoryBindingPlan(
            [tabRule(2)],
            plan,
            new Set(['tab-cls-2']),
        );

        expect(next[0].categoryLevel).toBe(2);
        expect(next[0].parentFieldId).toBe('mart_global_cls_1');
        expect(next[0].parentScope).toBe('global');
        expect(next[0].parentTabUuid).toBeUndefined();
    });

    it('writes parentTabUuid for tab parents', () => {
        const plan = planFor([tabRule(1), tabRule(2)]);

        const next = applyBatchCategoryBindingPlan(
            [tabRule(1), tabRule(2)],
            plan,
            new Set(['tab-cls-2']),
        );

        expect(next[1].parentFieldId).toBe('mart_a_cls_1');
        expect(next[1].parentScope).toBe('tab');
        expect(next[1].parentTabUuid).toBe(TAB_UUID);
    });

    it('only applies selected filters and keeps untouched references', () => {
        const level2 = tabRule(2);
        const level3 = tabRule(3);
        const plan = planFor([tabRule(1), level2, level3]);

        const next = applyBatchCategoryBindingPlan(
            [tabRule(1), level2, level3],
            plan,
            new Set(['tab-cls-2']),
        );

        expect(next[1]).not.toBe(level2);
        expect(next[2]).toBe(level3);
    });

    it('returns the original array when nothing is selected or actionable', () => {
        const filters = [
            tabRule(1),
            tabRule(2, {
                parentFieldId: 'mart_a_cls_1',
                parentScope: 'tab',
                parentTabUuid: TAB_UUID,
            }),
        ];
        const plan = planFor(filters);

        expect(applyBatchCategoryBindingPlan(filters, plan, new Set())).toBe(
            filters,
        );
        expect(applyBatchCategoryBindingPlan(filters, plan, allIds(plan))).toBe(
            filters,
        );
    });
});

describe('batch binding tie-breaks and runtime compatibility', () => {
    it('keeps the currently bound candidate when several share the level', () => {
        const otherLevel2 = tabRule(2, {
            id: 'tab-cls-2-other-mart',
            fieldId: 'mart_b_cls_2',
            tableName: 'mart_b',
        });
        const child = tabRule(3, {
            parentFieldId: 'mart_b_cls_2',
            parentScope: 'tab',
            parentTabUuid: TAB_UUID,
        });
        const plan = planFor([tabRule(2), otherLevel2, child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent?.rule.id).toBe('tab-cls-2-other-mart');
        expect(entry.resolvedParent?.rule.id).toBe('tab-cls-2-other-mart');
        expect(entry.ambiguousParentCandidates).toBe(true);
    });

    it('prefers a candidate from the same table when there is no binding', () => {
        const otherTable = tabRule(2, {
            id: 'tab-a-cls-2',
            fieldId: 'mart_a_cls_2',
            tableName: 'mart_a',
        });
        const sameTable = tabRule(2, {
            id: 'tab-b-cls-2',
            fieldId: 'mart_b_cls_2',
            tableName: 'mart_b',
        });
        const child = tabRule(3, {
            id: 'tab-b-cls-3',
            fieldId: 'mart_b_cls_3',
            tableName: 'mart_b',
        });
        // 配置顺序把另一张表放在前面，验证同表优先
        const plan = planFor([otherTable, sameTable, child]);

        const entry = entryOf(plan, 'tab-b-cls-3');
        expect(entry.resolvedParent?.rule.id).toBe('tab-b-cls-2');
        expect(entry.ambiguousParentCandidates).toBe(true);
    });

    it('does not treat a labeled sql column as a category filter', () => {
        const sqlColumn = rule({
            id: 'sql-labeled',
            fieldId: 'category_expr',
            target: {
                fieldId: 'category_expr',
                tableName: 'mart_a',
                isSqlColumn: true,
            },
            label: '一级类目',
        });
        const plan = planFor([sqlColumn, tabRule(2)]);

        expect(plan.map((entry) => entry.filter.id)).toEqual(['tab-cls-2']);
    });

    it('allows a same-field candidate like the runtime does', () => {
        // 同字段不同规则：运行时只排除同一条规则，允许同字段不同层级
        const sameFieldParent = rule({
            id: 'tab-same-field-2',
            fieldId: 'mart_a_cls_3',
            tableName: 'mart_a',
            categoryLevel: 2,
        });
        const child = tabRule(3);
        const plan = planFor([sameFieldParent, child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.resolvedParent?.rule.id).toBe('tab-same-field-2');
    });

    it('preserves an existing same-field parent binding', () => {
        const sameFieldParent = rule({
            id: 'tab-same-field-1',
            fieldId: 'mart_a_cls_3',
            tableName: 'mart_a',
            categoryLevel: 1,
        });
        const child = tabRule(3, {
            parentFieldId: 'mart_a_cls_3',
            parentScope: 'tab',
            parentTabUuid: TAB_UUID,
        });
        const plan = planFor([sameFieldParent, child]);

        const entry = entryOf(plan, 'tab-cls-3');
        expect(entry.currentParent?.rule.id).toBe('tab-same-field-1');
        expect(entry.parentChanged).toBe(false);
    });

    it('normalizes the stored parent chain of an unselected ancestor', () => {
        // parent（3 级）存的是 p1（1 级），但 plan 会把它重算成 p2（2 级）；
        // parent 未被选中 → 存储绑定仍是 p1 → 补层级必须沿存储链走
        // p1 / p2 都只有 cls 列名（无显式层级）：是否被补写可以区分走了哪条链
        const p1 = rule({
            id: 'p1',
            fieldId: 'mart_a_cls_1',
            tableName: 'mart_a',
        });
        const p2 = rule({
            id: 'p2',
            fieldId: 'mart_a_cls_2',
            tableName: 'mart_a',
        });
        const parent = tabRule(3, {
            id: 'parent',
            parentFieldId: 'mart_a_cls_1',
            parentScope: 'tab',
            parentTabUuid: TAB_UUID,
        });
        const child = tabRule(4, { id: 'child' });
        const filters = [p1, p2, parent, child];
        const plan = planFor(filters);

        expect(entryOf(plan, 'parent').resolvedParent?.rule.id).toBe('p2');

        const next = applyBatchCategoryBindingPlan(
            filters,
            plan,
            new Set(['child']),
        );
        const byId = new Map(next.map((item) => [item.id, item]));

        // 未选中的 parent 与它实际依赖的 p1 都补了层级；p2 未被误写
        expect(byId.get('parent')?.categoryLevel).toBe(3);
        expect(byId.get('p1')?.categoryLevel).toBe(1);
        expect(byId.get('p2')?.categoryLevel).toBeUndefined();
        expect(byId.get('child')?.parentFieldId).toBe('mart_a_cls_3');
    });

    it('produces bindings that the runtime cascade can resolve', () => {
        const globalLevel1 = globalRule(1);
        const tabLevel2 = tabRule(2);
        const tabLevel3 = tabRule(3);
        const filters = [tabLevel2, tabLevel3];
        const plan = planFor(filters, [globalLevel1]);

        const next = applyBatchCategoryBindingPlan(filters, plan, allIds(plan));
        const chain = buildCategoryChain(
            {
                globalFilters: {
                    dimensions: [globalLevel1],
                    metrics: [],
                    tableCalculations: [],
                },
                tabFilters: {
                    [TAB_UUID]: {
                        dimensions: next,
                        metrics: [],
                        tableCalculations: [],
                    },
                },
            },
            TAB_UUID,
        );

        const level3 = chain.find((entry) => entry.rule.id === 'tab-cls-3')!;
        const level2 = chain.find((entry) => entry.rule.id === 'tab-cls-2')!;

        expect(findParentCategoryEntry(chain, level3)?.rule.id).toBe(
            'tab-cls-2',
        );
        expect(findParentCategoryEntry(chain, level2)?.rule.id).toBe(
            'global-cls-1',
        );
        // 运行时只认显式层级：apply 后父子都必须是类目筛选器
        expect(isCategoryField(level2.rule)).toBe(true);
        expect(isCategoryField(level3.rule)).toBe(true);
    });
});

describe('candidateToParentFilterRef', () => {
    it('encodes global and tab parents', () => {
        expect(
            candidateToParentFilterRef({
                rule: globalRule(1),
                scope: 'global',
                tabUuid: null,
                level: 1,
            }),
        ).toEqual({
            scope: 'global',
            tabUuid: null,
            fieldId: 'mart_global_cls_1',
        });

        expect(
            candidateToParentFilterRef({
                rule: tabRule(1),
                scope: 'tab',
                tabUuid: TAB_UUID,
                level: 1,
            }),
        ).toEqual({
            scope: 'tab',
            tabUuid: TAB_UUID,
            fieldId: 'mart_a_cls_1',
        });
    });
});

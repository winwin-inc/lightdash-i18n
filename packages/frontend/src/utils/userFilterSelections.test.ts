import {
    DimensionType,
    FilterOperator,
    TimeFrames,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    applyFilterSelection,
    applySelectionToFilters,
    applySelectionToTabFilters,
    applySelectionValues,
    findFilterRuleById,
    findInheritedRule,
    findMatchingRuleIndices,
    findRuleByIdentity,
    getFilterIdentityKey,
    getFilterIdentityKeys,
    isRuleSelectionCompatible,
    restoreAuthorDefaults,
} from './userFilterSelections';

type RuleOverrides = Partial<DashboardFilterRule> & {
    id: string;
    fieldId: string;
    tableName?: string;
};

const rule = (overrides: RuleOverrides): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: overrides.tableName ?? 'orders',
        ...(overrides.target ?? {}),
    },
    operator: overrides.operator ?? FilterOperator.EQUALS,
    values: overrides.values,
    label: overrides.label,
    settings: overrides.settings,
    categoryLevel: overrides.categoryLevel,
    parentFieldId: overrides.parentFieldId,
    parentScope: overrides.parentScope,
    parentTabUuid: overrides.parentTabUuid,
    dateRangeGranularity: overrides.dateRangeGranularity,
    disabled: overrides.disabled,
});

const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

/**
 * 跨 mart 的同类目：字段名不同、层级相同 —— 新 API 里视为「同一个筛选器」。
 */
const crossMartCategoryRule = (
    overrides: RuleOverrides & { categoryLevel: 1 | 2 | 3 | 4 },
): DashboardFilterRule =>
    rule({
        ...overrides,
        tableName: overrides.tableName ?? 'mart_b',
    });

describe('userFilterSelections', () => {
    beforeEach(() => {
        // 继承路径在开发模式会打诊断日志，测试里静音
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getFilterIdentityKey', () => {
        it('uses namespace + table + field for regular fields', () => {
            expect(
                getFilterIdentityKey(
                    rule({ id: 'a', fieldId: 'status' }),
                    'dimension',
                ),
            ).toBe('dimension:orders.status');
        });

        it('uses the metric namespace for metrics', () => {
            expect(
                getFilterIdentityKey(
                    rule({ id: 'a', fieldId: 'revenue' }),
                    'metric',
                ),
            ).toBe('metric:orders.revenue');
        });

        it('uses the tableCalculation namespace for table calculations', () => {
            expect(
                getFilterIdentityKey(
                    rule({ id: 'a', fieldId: 'margin' }),
                    'tableCalculation',
                ),
            ).toBe('tableCalculation:orders.margin');
        });

        it('falls back to the rule id for sql columns', () => {
            const sqlRule = rule({
                id: 'sql-1',
                fieldId: 'amount',
                tableName: 'whatever',
                target: {
                    fieldId: 'amount',
                    tableName: 'whatever',
                    isSqlColumn: true,
                },
            });
            expect(getFilterIdentityKey(sqlRule, 'dimension')).toBe(
                'rule:sql-1',
            );
        });
    });

    describe('findFilterRuleById', () => {
        it('finds the rule and its namespace', () => {
            const found = findFilterRuleById(
                {
                    dimensions: [],
                    metrics: [rule({ id: 'm1', fieldId: 'revenue' })],
                    tableCalculations: [],
                },
                'm1',
            );
            expect(found?.namespace).toBe('metric');
            expect(found?.rule.id).toBe('m1');
        });

        it('finds table calculations', () => {
            const found = findFilterRuleById(
                {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [rule({ id: 'tc1', fieldId: 'margin' })],
                },
                'tc1',
            );
            expect(found?.namespace).toBe('tableCalculation');
        });

        it('returns undefined for unknown ids', () => {
            expect(
                findFilterRuleById(
                    { dimensions: [], metrics: [], tableCalculations: [] },
                    'nope',
                ),
            ).toBeUndefined();
        });
    });

    describe('findMatchingRuleIndices', () => {
        it('matches the same field exactly', () => {
            const source = rule({ id: 'a', fieldId: 'status' });
            const matches = findMatchingRuleIndices(
                [
                    rule({ id: 'b', fieldId: 'status' }),
                    rule({ id: 'c', fieldId: 'amount' }),
                ],
                source,
                'dimension',
            );
            expect(matches).toEqual([{ index: 0, matchKind: 'exact-field' }]);
        });

        it('prefers the exact field over same-level category rules', () => {
            const source = rule({
                id: 'a',
                fieldId: 'status',
                categoryLevel: 2,
            });
            const matches = findMatchingRuleIndices(
                [
                    rule({ id: 'b', fieldId: 'status', categoryLevel: 2 }),
                    rule({ id: 'c', fieldId: 'other', categoryLevel: 2 }),
                ],
                source,
                'dimension',
            );
            expect(matches).toEqual([{ index: 0, matchKind: 'exact-field' }]);
        });

        it('falls back to the same category level across marts', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
            });
            const matches = findMatchingRuleIndices(
                [
                    crossMartCategoryRule({
                        id: 'b',
                        fieldId: 'group_cls2_insight_list_cls_2',
                        categoryLevel: 2,
                    }),
                ],
                source,
                'dimension',
            );
            expect(matches).toEqual([
                { index: 0, matchKind: 'category-level' },
            ]);
        });

        it('does not match a different category level', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
            });
            const matches = findMatchingRuleIndices(
                [
                    crossMartCategoryRule({
                        id: 'b',
                        fieldId: 'cls_3',
                        categoryLevel: 3,
                    }),
                ],
                source,
                'dimension',
            );
            expect(matches).toEqual([]);
        });

        it('does not match sql columns by category level', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
            });
            const matches = findMatchingRuleIndices(
                [
                    rule({
                        id: 'b',
                        fieldId: 'cls_2',
                        tableName: 'mart_b',
                        categoryLevel: 2,
                        target: {
                            fieldId: 'cls_2',
                            tableName: 'mart_b',
                            isSqlColumn: true,
                        },
                    }),
                ],
                source,
                'dimension',
            );
            expect(matches).toEqual([]);
        });

        it('never matches by category level outside the dimension namespace', () => {
            const source = rule({
                id: 'a',
                fieldId: 'revenue',
                categoryLevel: 2,
            });
            const matches = findMatchingRuleIndices(
                [rule({ id: 'b', fieldId: 'revenue_2', categoryLevel: 2 })],
                source,
                'metric',
            );
            expect(matches).toEqual([]);
        });
    });

    describe('findInheritedRule', () => {
        it('returns the rule of the same field', () => {
            const inherited = findInheritedRule(
                filters([
                    rule({ id: 'b', fieldId: 'amount' }),
                    rule({ id: 'c', fieldId: 'status' }),
                ]),
                rule({ id: 'a', fieldId: 'status' }),
                'dimension',
            );
            expect(inherited?.id).toBe('c');
        });

        it('falls back to the same category level across marts', () => {
            const inherited = findInheritedRule(
                filters([
                    crossMartCategoryRule({
                        id: 'b',
                        fieldId: 'group_cls2_insight_list_cls_2',
                        categoryLevel: 2,
                    }),
                ]),
                rule({
                    id: 'a',
                    fieldId: 'cls_2',
                    tableName: 'mart_a',
                    categoryLevel: 2,
                }),
                'dimension',
            );
            expect(inherited?.id).toBe('b');
        });

        it('returns undefined when nothing matches', () => {
            expect(
                findInheritedRule(
                    filters([rule({ id: 'b', fieldId: 'amount' })]),
                    rule({ id: 'a', fieldId: 'status' }),
                    'dimension',
                ),
            ).toBeUndefined();
        });
    });

    describe('isRuleSelectionCompatible', () => {
        it('accepts rules with the same operator and settings shape', () => {
            const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
            const target = rule({ id: 'b', fieldId: 'status', values: ['y'] });
            expect(isRuleSelectionCompatible(source, target)).toBe(true);
        });

        it('rejects different operators', () => {
            const source = rule({ id: 'a', fieldId: 'status' });
            const target = rule({
                id: 'b',
                fieldId: 'status',
                operator: FilterOperator.IN_BETWEEN,
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });

        it('rejects different settings shapes', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                settings: { unitOfTime: 'month' },
            });
            const target = rule({
                id: 'b',
                fieldId: 'date',
                settings: { dateRange: 'last 30 days' },
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });

        it('rejects different category levels', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cat',
                categoryLevel: 2,
                parentFieldId: 'p1',
            });
            const differentLevel = rule({
                id: 'b',
                fieldId: 'cat',
                categoryLevel: 3,
                parentFieldId: 'p1',
            });
            expect(isRuleSelectionCompatible(source, differentLevel)).toBe(
                false,
            );
        });

        it('rejects different parents for non-category rules', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cat',
                parentFieldId: 'p1',
            });
            const differentParent = rule({
                id: 'b',
                fieldId: 'cat',
                parentFieldId: 'p2',
            });
            expect(isRuleSelectionCompatible(source, differentParent)).toBe(
                false,
            );
        });

        it('accepts different parents for same-level category rules', () => {
            // 父级绑定指向各 Tab 自己的父级字段（跨 mart 必然不同），
            // 同层级即视为同一个筛选器
            const source = rule({
                id: 'a',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
                parentFieldId: 'cls_1',
            });
            const target = rule({
                id: 'b',
                fieldId: 'group_cls2_insight_list_cls_2',
                tableName: 'mart_b',
                categoryLevel: 2,
                parentFieldId: 'group_cls1_insight_list_cls_1',
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(true);
        });

        it('accepts disabled targets so the receiver can be enabled', () => {
            const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
            const target = rule({ id: 'b', fieldId: 'status', disabled: true });
            expect(isRuleSelectionCompatible(source, target)).toBe(true);
        });

        it('rejects targets whose fallback type changed', () => {
            const source = rule({
                id: 'a',
                fieldId: 'status',
                target: {
                    fieldId: 'status',
                    tableName: 'orders',
                    fallbackType: DimensionType.STRING,
                },
            });
            const target = rule({
                id: 'b',
                fieldId: 'status',
                target: {
                    fieldId: 'status',
                    tableName: 'orders',
                    fallbackType: DimensionType.NUMBER,
                },
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });

        it('rejects a source that still uses a dynamic date default', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                settings: {
                    unitOfTime: 'month',
                    singleDate: { mode: 'dynamic' },
                },
            });
            const target = rule({
                id: 'b',
                fieldId: 'date',
                settings: { unitOfTime: 'month' },
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });

        it('rejects different date units', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                settings: { unitOfTime: 'month' },
            });
            const target = rule({
                id: 'b',
                fieldId: 'date',
                settings: { unitOfTime: 'day' },
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });

        it('rejects a different completed flag', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                settings: { unitOfTime: 'month', completed: true },
            });
            const target = rule({
                id: 'b',
                fieldId: 'date',
                settings: { unitOfTime: 'month' },
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });

        it('accepts a receiver that still uses a dynamic date default', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                settings: { unitOfTime: 'month' },
            });
            const target = rule({
                id: 'b',
                fieldId: 'date',
                settings: {
                    unitOfTime: 'month',
                    singleDate: { mode: 'dynamic' },
                },
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(true);
        });

        it('rejects a different date range granularity', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                settings: { unitOfTime: 'day' },
                dateRangeGranularity: TimeFrames.MONTH,
            });
            const target = rule({
                id: 'b',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                settings: { unitOfTime: 'day' },
                dateRangeGranularity: TimeFrames.DAY,
            });
            expect(isRuleSelectionCompatible(source, target)).toBe(false);
        });
    });

    describe('applyFilterSelection', () => {
        it('applies operator, values, settings and disabled state', () => {
            const restored = applyFilterSelection(
                rule({ id: 'a', fieldId: 'status', values: ['user-picked'] }),
                {
                    operator: FilterOperator.INCLUDE,
                    values: ['author-default'],
                    settings: { unitOfTime: 'month' },
                    disabled: true,
                },
            );
            expect(restored.operator).toBe(FilterOperator.INCLUDE);
            expect(restored.values).toEqual(['author-default']);
            expect(restored.settings).toEqual({ unitOfTime: 'month' });
            expect(restored.disabled).toBe(true);
            // 规则定义（id / target / label）保持不变
            expect(restored.id).toBe('a');
            expect(restored.target.fieldId).toBe('status');
        });
    });

    describe('applySelectionValues', () => {
        it('copies the values and follows the source disabled state', () => {
            const next = applySelectionValues(
                rule({ id: 'b', fieldId: 'status', values: ['old'] }),
                rule({
                    id: 'a',
                    fieldId: 'status',
                    values: ['new'],
                    disabled: true,
                }),
            );
            expect(next.values).toEqual(['new']);
            expect(next.disabled).toBe(true);
        });

        it('enables the receiver when the source has a value', () => {
            const next = applySelectionValues(
                rule({ id: 'b', fieldId: 'status', disabled: true }),
                rule({ id: 'a', fieldId: 'status', values: ['new'] }),
            );
            expect(next.disabled).toBe(false);
        });

        it('clears the values when the source has none', () => {
            const next = applySelectionValues(
                rule({ id: 'b', fieldId: 'status', values: ['old'] }),
                rule({ id: 'a', fieldId: 'status' }),
            );
            expect(next.values).toEqual([]);
        });

        it('keeps the receiver operator and settings', () => {
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'status',
                    operator: FilterOperator.INCLUDE,
                    settings: { excludedValues: ['x'] },
                }),
                rule({
                    id: 'a',
                    fieldId: 'status',
                    operator: FilterOperator.EQUALS,
                    values: ['new'],
                    settings: { unitOfTime: 'month' },
                }),
            );
            expect(next.operator).toBe(FilterOperator.INCLUDE);
            expect(next.settings).toEqual({ excludedValues: ['x'] });
        });

        it('strips the dynamic default of the receiver', () => {
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'date',
                    settings: {
                        unitOfTime: 'month',
                        singleDate: { mode: 'dynamic' },
                    },
                }),
                rule({
                    id: 'a',
                    fieldId: 'date',
                    values: ['2026-09'],
                    settings: { unitOfTime: 'month' },
                }),
            );
            expect(next.values).toEqual(['2026-09']);
            expect(next.settings).toEqual({ unitOfTime: 'month' });
        });
    });

    describe('applySelectionToFilters', () => {
        it('applies the selection to the matching field only', () => {
            const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
            const target = rule({
                id: 'b',
                fieldId: 'status',
                values: ['old'],
                label: 'Status',
            });
            const other = rule({ id: 'c', fieldId: 'amount', values: ['1'] });

            const result = applySelectionToFilters(
                filters([target, other]),
                source,
                'dimension',
            );

            expect(result.changed).toBe(true);
            expect(result.matchKind).toBe('exact-field');
            expect(result.filters.dimensions[0].values).toEqual(['x']);
            // rule id / label / target are untouched
            expect(result.filters.dimensions[0].id).toBe('b');
            expect(result.filters.dimensions[0].label).toBe('Status');
            expect(result.filters.dimensions[1].values).toEqual(['1']);
        });

        it('does nothing when the field is not configured', () => {
            const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
            const input = filters([rule({ id: 'c', fieldId: 'amount' })]);
            const result = applySelectionToFilters(input, source, 'dimension');
            expect(result.changed).toBe(false);
            expect(result.matchKind).toBeNull();
            expect(result.filters).toBe(input);
            expect(result.filters.dimensions).toHaveLength(1);
        });

        it('does nothing when the target is incompatible', () => {
            const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
            const target = rule({
                id: 'b',
                fieldId: 'status',
                operator: FilterOperator.IN_BETWEEN,
            });
            const result = applySelectionToFilters(
                filters([target]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(false);
            expect(result.filters.dimensions[0].values).toBeUndefined();
        });

        it('inherits into a same-level category rule of another mart', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
                values: ['new'],
            });
            const result = applySelectionToFilters(
                filters([
                    crossMartCategoryRule({
                        id: 'b',
                        fieldId: 'group_cls2_insight_list_cls_2',
                        categoryLevel: 2,
                        values: ['old'],
                        parentFieldId: 'group_cls1_insight_list_cls_1',
                    }),
                ]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.matchKind).toBe('category-level');
            expect(result.filters.dimensions[0].values).toEqual(['new']);
            // 接收方的规则定义保持不变
            expect(result.filters.dimensions[0].id).toBe('b');
            expect(result.filters.dimensions[0].target.fieldId).toBe(
                'group_cls2_insight_list_cls_2',
            );
        });

        it('does not inherit into a different category level', () => {
            const source = rule({
                id: 'a',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
                values: ['new'],
            });
            const input = filters([
                crossMartCategoryRule({
                    id: 'b',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    values: ['old'],
                }),
            ]);
            const result = applySelectionToFilters(input, source, 'dimension');
            expect(result.changed).toBe(false);
            expect(result.filters.dimensions[0].values).toEqual(['old']);
        });

        it('enables a disabled receiver when the source has a value', () => {
            const source = rule({
                id: 'a',
                fieldId: 'status',
                values: ['new'],
            });
            const result = applySelectionToFilters(
                filters([rule({ id: 'b', fieldId: 'status', disabled: true })]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.filters.dimensions[0].values).toEqual(['new']);
            expect(result.filters.dimensions[0].disabled).toBe(false);
        });

        it('clears the receiver values when the source has none', () => {
            const source = rule({ id: 'a', fieldId: 'status' });
            const result = applySelectionToFilters(
                filters([
                    rule({ id: 'b', fieldId: 'status', values: ['old'] }),
                ]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.filters.dimensions[0].values).toEqual([]);
        });

        it('does not change anything when the receiver already has the same value', () => {
            const source = rule({
                id: 'a',
                fieldId: 'status',
                values: ['same'],
            });
            const input = filters([
                rule({ id: 'b', fieldId: 'status', values: ['same'] }),
            ]);
            const result = applySelectionToFilters(input, source, 'dimension');
            expect(result.changed).toBe(false);
            expect(result.matchKind).toBe('exact-field');
            expect(result.filters).toBe(input);
        });
    });

    describe('applySelectionToTabFilters', () => {
        const source = rule({
            id: 'tab-a-rule',
            fieldId: 'status',
            values: ['x'],
        });

        it('syncs the value to every tab that configures the field', () => {
            const tabFilters = {
                'tab-a': filters([
                    rule({ id: 'tab-a-rule', fieldId: 'status' }),
                ]),
                'tab-b': filters([
                    rule({ id: 'tab-b-rule', fieldId: 'status' }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    source,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-b']);
            expect(next['tab-b'].dimensions[0].values).toEqual(['x']);
            expect(next['tab-b'].dimensions[0].id).toBe('tab-b-rule');
        });

        it('skips tabs that do not configure the field', () => {
            const tabFilters = {
                'tab-a': filters([
                    rule({ id: 'tab-a-rule', fieldId: 'status' }),
                ]),
                'tab-b': filters([
                    rule({ id: 'tab-b-rule', fieldId: 'amount' }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    source,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual([]);
            expect(next).toBe(tabFilters);
        });

        it('skips the source tab', () => {
            const tabFilters = {
                'tab-a': filters([
                    rule({ id: 'tab-a-rule', fieldId: 'status' }),
                ]),
                'tab-b': filters([
                    rule({ id: 'tab-b-rule', fieldId: 'status' }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    source,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-b']);
            expect(next['tab-a'].dimensions[0].values).toBeUndefined();
        });

        it('skips incompatible tabs but keeps compatible ones', () => {
            const tabFilters = {
                'tab-a': filters([
                    rule({ id: 'tab-a-rule', fieldId: 'status' }),
                ]),
                'tab-b': filters([
                    rule({
                        id: 'tab-b-rule',
                        fieldId: 'status',
                        operator: FilterOperator.IN_BETWEEN,
                    }),
                ]),
                'tab-c': filters([
                    rule({ id: 'tab-c-rule', fieldId: 'status' }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    source,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-c']);
            expect(next['tab-b'].dimensions[0].values).toBeUndefined();
        });

        it('syncs into a same-level category rule of another mart', () => {
            const categorySource = rule({
                id: 'tab-a-rule',
                fieldId: 'cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
                values: ['new'],
            });
            const tabFilters = {
                'tab-a': filters([categorySource]),
                'tab-b': filters([
                    crossMartCategoryRule({
                        id: 'tab-b-rule',
                        fieldId: 'group_cls2_insight_list_cls_2',
                        categoryLevel: 2,
                        values: ['old'],
                    }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    categorySource,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-b']);
            expect(next['tab-b'].dimensions[0].values).toEqual(['new']);
        });

        it('propagates the disabled state of the source', () => {
            const disabledSource = rule({
                id: 'tab-a-rule',
                fieldId: 'status',
                values: ['x'],
                disabled: true,
            });
            const tabFilters = {
                'tab-a': filters([disabledSource]),
                'tab-b': filters([
                    rule({
                        id: 'tab-b-rule',
                        fieldId: 'status',
                        values: ['old'],
                    }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    disabledSource,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-b']);
            expect(next['tab-b'].dimensions[0].disabled).toBe(true);
        });

        it('does not write anything when every tab already has the value', () => {
            const anyValueSource = rule({
                id: 'tab-a-rule',
                fieldId: 'status',
                values: [],
                disabled: true,
            });
            const tabFilters = {
                'tab-a': filters([anyValueSource]),
                // 两边都是「任何值」：不应新建对象、不应标脏、不触发联动
                'tab-b': filters([
                    rule({
                        id: 'tab-b-rule',
                        fieldId: 'status',
                        values: [],
                        disabled: true,
                    }),
                ]),
            };
            const result = applySelectionToTabFilters(
                tabFilters,
                anyValueSource,
                'dimension',
                'tab-a',
            );
            expect(result.changedTabUuids).toEqual([]);
            expect(result.tabFilters).toBe(tabFilters);
        });
    });

    describe('getFilterIdentityKeys', () => {
        it('collects the identity keys of a filter set', () => {
            const keys = getFilterIdentityKeys(
                filters([
                    rule({ id: 'r1', fieldId: 'status' }),
                    rule({ id: 'r2', fieldId: 'amount', tableName: 'orders' }),
                ]),
            );
            expect([...keys]).toEqual([
                'dimension:orders.status',
                'dimension:orders.amount',
            ]);
        });

        it('collects metrics and table calculations with their namespace', () => {
            const keys = getFilterIdentityKeys({
                dimensions: [],
                metrics: [rule({ id: 'm1', fieldId: 'revenue' })],
                tableCalculations: [rule({ id: 'tc1', fieldId: 'margin' })],
            });
            expect([...keys]).toEqual([
                'metric:orders.revenue',
                'tableCalculation:orders.margin',
            ]);
        });
    });

    describe('findRuleByIdentity', () => {
        it('finds a rule by its identity key', () => {
            const found = findRuleByIdentity(
                filters([
                    rule({ id: 'r1', fieldId: 'status' }),
                    rule({ id: 'r2', fieldId: 'amount' }),
                ]),
                'dimension:orders.amount',
                'dimension',
            );
            expect(found?.id).toBe('r2');
        });

        it('returns undefined for an unknown identity key', () => {
            expect(
                findRuleByIdentity(
                    filters([rule({ id: 'r1', fieldId: 'status' })]),
                    'dimension:orders.nope',
                    'dimension',
                ),
            ).toBeUndefined();
        });
    });

    describe('restoreAuthorDefaults', () => {
        it('restores the server default value', () => {
            const runtime = filters([
                rule({
                    id: 'r1',
                    fieldId: 'status',
                    values: ['user-picked'],
                    disabled: true,
                }),
            ]);
            const serverField = filters([
                rule({
                    id: 'srv',
                    fieldId: 'status',
                    values: ['author-default'],
                    disabled: false,
                }),
            ]);
            const server = filters([
                rule({
                    id: 'srv',
                    fieldId: 'status',
                    values: ['author-default'],
                    disabled: false,
                }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                server,
            );
            expect(restored.dimensions[0].values).toEqual(['author-default']);
            expect(restored.dimensions[0].disabled).toBe(false);
            // 规则定义保持不变
            expect(restored.dimensions[0].id).toBe('r1');
        });

        it('clears the value when the author has no default', () => {
            const runtime = filters([
                rule({ id: 'r1', fieldId: 'status', values: ['user-picked'] }),
            ]);
            const serverField = filters([
                rule({ id: 'srv', fieldId: 'status' }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                undefined,
            );
            expect(restored.dimensions[0].values).toEqual([]);
            expect(restored.dimensions[0].disabled).toBe(true);
        });

        it('leaves other filters untouched', () => {
            const runtime = filters([
                rule({ id: 'r1', fieldId: 'status', values: ['user-picked'] }),
                rule({ id: 'r2', fieldId: 'amount', values: ['5'] }),
            ]);
            const serverField = filters([
                rule({ id: 'srv', fieldId: 'status' }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                undefined,
            );
            expect(restored.dimensions[1].values).toEqual(['5']);
        });

        it('restores same-level category rules of another mart', () => {
            const runtime = filters([
                crossMartCategoryRule({
                    id: 'r1',
                    fieldId: 'group_cls2_insight_list_cls_2',
                    categoryLevel: 2,
                    values: ['user-picked'],
                }),
            ]);
            const serverField = filters([
                rule({
                    id: 'srv',
                    fieldId: 'cls_2',
                    tableName: 'mart_a',
                    categoryLevel: 2,
                }),
            ]);
            const server = filters([
                rule({
                    id: 'srv',
                    fieldId: 'cls_2',
                    tableName: 'mart_b',
                    categoryLevel: 2,
                    values: ['author-default'],
                }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                server,
            );
            expect(restored.dimensions[0].values).toEqual(['author-default']);
            expect(restored.dimensions[0].id).toBe('r1');
        });

        it('does not restore a different category level', () => {
            const runtime = filters([
                crossMartCategoryRule({
                    id: 'r1',
                    fieldId: 'cls_3',
                    categoryLevel: 3,
                    values: ['user-picked'],
                }),
            ]);
            const serverField = filters([
                rule({
                    id: 'srv',
                    fieldId: 'cls_2',
                    tableName: 'mart_a',
                    categoryLevel: 2,
                }),
            ]);
            const server = filters([
                rule({
                    id: 'srv',
                    fieldId: 'cls_2',
                    tableName: 'mart_b',
                    categoryLevel: 2,
                    values: ['author-default'],
                }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                server,
            );
            expect(restored.dimensions[0].values).toEqual(['user-picked']);
        });

        it('returns the same filters when nothing has to be restored', () => {
            const runtime = filters([
                rule({
                    id: 'r1',
                    fieldId: 'status',
                    values: ['author-default'],
                }),
            ]);
            const serverField = filters([
                rule({ id: 'srv', fieldId: 'status' }),
            ]);
            const server = filters([
                rule({
                    id: 'srv',
                    fieldId: 'status',
                    values: ['author-default'],
                }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                server,
            );
            expect(restored).toBe(runtime);
        });

        it('does nothing when the server does not know the field', () => {
            const runtime = filters([
                rule({ id: 'r1', fieldId: 'status', values: ['user-picked'] }),
            ]);
            const serverField = filters([
                rule({ id: 'srv', fieldId: 'amount' }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                undefined,
            );
            expect(restored).toBe(runtime);
        });
    });
});

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
    minAllowedDate: overrides.minAllowedDate,
    maxAllowedDate: overrides.maxAllowedDate,
    enableDynamicMaxAllowedDate: overrides.enableDynamicMaxAllowedDate,
    rollingMinAllowedMonths: overrides.rollingMinAllowedMonths,
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

        it('derives the category level from the column name when only one side declares it', () => {
            // 客户现场：一级类目在四级类目 Tab 里是 group_cls2_insight_list_cls_1（没配类目层级），
            // 三级类目 Tab 里是 cls_insight_list_cls_1（配了 1）—— 应该视为同一个筛选器。
            const source = rule({
                id: 'a',
                fieldId: 'group_cls2_insight_list_cls_1',
                tableName: 'group_cls2_insight_list',
                values: ['饮料和酒'],
            });
            const target = rule({
                id: 'b',
                fieldId: 'cls_insight_list_cls_1',
                tableName: 'cls_insight_list',
                categoryLevel: 1,
                values: ['日化品'],
            });
            expect(
                findMatchingRuleIndices([target], source, 'dimension'),
            ).toEqual([{ index: 0, matchKind: 'category-level' }]);

            const result = applySelectionToFilters(
                filters([target]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.filters.dimensions[0].values).toEqual(['饮料和酒']);
        });

        it('does not match unrelated fields across marts', () => {
            const source = rule({
                id: 'a',
                fieldId: 'mart_a_status',
                tableName: 'mart_a',
            });
            const target = rule({
                id: 'b',
                fieldId: 'mart_b_amount',
                tableName: 'mart_b',
            });
            expect(
                findMatchingRuleIndices([target], source, 'dimension'),
            ).toEqual([]);
        });

        it('falls back to the same column name across marts for plain fields', () => {
            // 客户现场：各 Tab 的「时间」筛选器是同一套 period 列，但分属不同 mart
            // （group_cls4_insight_list_period vs brand_cls3_insight_list_period）。
            const source = rule({
                id: 'a',
                fieldId: 'group_cls4_insight_list_period',
                tableName: 'group_cls4_insight_list',
                values: ['YTD2609'],
            });
            const target = rule({
                id: 'b',
                fieldId: 'brand_cls3_insight_list_period',
                tableName: 'brand_cls3_insight_list',
                values: ['近3个月'],
            });
            expect(
                findMatchingRuleIndices([target], source, 'dimension'),
            ).toEqual([{ index: 0, matchKind: 'column-name' }]);

            const result = applySelectionToFilters(
                filters([target]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.filters.dimensions[0].values).toEqual(['YTD2609']);
        });

        it('prefers the exact field over a same-column rule of another mart', () => {
            const source = rule({
                id: 'a',
                fieldId: 'mart_a_period',
                tableName: 'mart_a',
            });
            const matches = findMatchingRuleIndices(
                [
                    rule({
                        id: 'b',
                        fieldId: 'mart_b_period',
                        tableName: 'mart_b',
                    }),
                    rule({
                        id: 'c',
                        fieldId: 'mart_a_period',
                        tableName: 'mart_a',
                    }),
                ],
                source,
                'dimension',
            );
            expect(matches).toEqual([{ index: 1, matchKind: 'exact-field' }]);
        });

        it('prefers the category level over the column name', () => {
            const source = rule({
                id: 'a',
                fieldId: 'mart_a_cls_2',
                tableName: 'mart_a',
                categoryLevel: 2,
            });
            const matches = findMatchingRuleIndices(
                [
                    rule({
                        id: 'b',
                        fieldId: 'mart_b_cls_2',
                        tableName: 'mart_b',
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

        it('does not match a labelled filter with a different label', () => {
            const source = rule({
                id: 'a',
                fieldId: 'mart_a_period',
                tableName: 'mart_a',
                label: '时间',
            });
            const target = rule({
                id: 'b',
                fieldId: 'mart_b_period',
                tableName: 'mart_b',
                label: '首单时间',
            });
            expect(
                findMatchingRuleIndices([target], source, 'dimension'),
            ).toEqual([]);
        });

        it('does not match sql columns by column name', () => {
            const source = rule({
                id: 'a',
                fieldId: 'mart_a_period',
                tableName: 'mart_a',
                target: {
                    fieldId: 'mart_a_period',
                    tableName: 'mart_a',
                    isSqlColumn: true,
                },
            });
            const target = rule({
                id: 'b',
                fieldId: 'mart_b_period',
                tableName: 'mart_b',
                target: {
                    fieldId: 'mart_b_period',
                    tableName: 'mart_b',
                    isSqlColumn: true,
                },
            });
            expect(
                findMatchingRuleIndices([target], source, 'dimension'),
            ).toEqual([]);
        });

        it('does not match by column name outside the dimension namespace', () => {
            const source = rule({
                id: 'a',
                fieldId: 'mart_a_period',
                tableName: 'mart_a',
            });
            const target = rule({
                id: 'b',
                fieldId: 'mart_b_period',
                tableName: 'mart_b',
            });
            expect(
                findMatchingRuleIndices([target], source, 'tableCalculation'),
            ).toEqual([]);
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

        it('clamps inherited range values to the receiver bounds', () => {
            // G1：继承值按接收方自身的可选范围钳制后写回存储，
            // 避免存储值永久越界（chip/查询路径的钳制只是展示/查询层兜底）
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    dateRangeGranularity: TimeFrames.MONTH,
                    minAllowedDate: '2025-01-01',
                    maxAllowedDate: '2025-12-31',
                }),
                rule({
                    id: 'a',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2024-06-15', '2026-03-20'],
                }),
            );
            // 两端都越界 → 夹到接收方窗口边界并按月对齐
            expect(next.values).toEqual(['2025-01-01', '2025-12-31']);
        });

        it('keeps in-bounds values untouched without period rewriting', () => {
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    dateRangeGranularity: TimeFrames.MONTH,
                    minAllowedDate: '2025-01-01',
                    maxAllowedDate: '2025-12-31',
                }),
                rule({
                    id: 'a',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2025-06-15', '2025-08-22'],
                }),
            );
            // 界内值原样透传，月中日期不被静默扩成整月
            expect(next.values).toEqual(['2025-06-15', '2025-08-22']);
        });

        it('passes values through for rules without any bounds config', () => {
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                }),
                rule({
                    id: 'a',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2020-01-01', '2030-12-31'],
                }),
            );
            // 普通 explore 筛选器没有可选范围 → 原样继承
            expect(next.values).toEqual(['2020-01-01', '2030-12-31']);
        });

        it('does not clamp non-IN_BETWEEN rules even with bounds', () => {
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'date',
                    operator: FilterOperator.EQUALS,
                    minAllowedDate: '2025-01-01',
                    maxAllowedDate: '2025-12-31',
                }),
                rule({
                    id: 'a',
                    fieldId: 'date',
                    values: ['2024-01-01'],
                }),
            );
            // D5：只夹 IN_BETWEEN 双端区间，equals 单值不夹
            expect(next.values).toEqual(['2024-01-01']);
        });

        it('does not clamp single-sided ranges', () => {
            const next = applySelectionValues(
                rule({
                    id: 'b',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    dateRangeGranularity: TimeFrames.MONTH,
                    minAllowedDate: '2025-01-01',
                    maxAllowedDate: '2025-12-31',
                }),
                rule({
                    id: 'a',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['', '2026-12-31'],
                }),
            );
            // 空槽位 = 单边区间，不钳制（S1：槽位结构保留）
            expect(next.values).toEqual(['', '2026-12-31']);
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

        it('stores values clamped to the receiver own narrower window', () => {
            // A(宽窗口) → B(窄窗口)：接收方按自己的边界钳制后写回存储
            const source = rule({
                id: 'a',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                values: ['2024-06-15', '2026-03-20'],
            });
            const result = applySelectionToFilters(
                filters([
                    rule({
                        id: 'b',
                        fieldId: 'date',
                        operator: FilterOperator.IN_BETWEEN,
                        dateRangeGranularity: TimeFrames.MONTH,
                        minAllowedDate: '2025-01-01',
                        maxAllowedDate: '2025-12-31',
                        values: ['2025-02-01', '2025-06-30'],
                    }),
                ]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.matchKind).toBe('exact-field');
            expect(result.filters.dimensions[0].values).toEqual([
                '2025-01-01',
                '2025-12-31',
            ]);
            // 规则定义保持不变
            expect(result.filters.dimensions[0].id).toBe('b');
        });

        it('does not mark the tab dirty when the clamp lands on the stored value', () => {
            // G1：接收方已存钳制后的值，来源越界值钳制后与之相同 →
            // isSameRuleSelection 必须判「无变化」，否则每次切换 Tab 都会
            // 误报脏并触发无意义的数据请求
            const source = rule({
                id: 'a',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                values: ['2024-06-15', '2026-03-20'],
            });
            const input = filters([
                rule({
                    id: 'b',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    dateRangeGranularity: TimeFrames.MONTH,
                    minAllowedDate: '2025-01-01',
                    maxAllowedDate: '2025-12-31',
                    values: ['2025-01-01', '2025-12-31'],
                }),
            ]);
            const result = applySelectionToFilters(input, source, 'dimension');
            expect(result.changed).toBe(false);
            expect(result.filters).toBe(input);
        });

        it('clamps after stripping the receiver dynamic default', () => {
            const source = rule({
                id: 'a',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                values: ['2024-06-15', '2026-03-20'],
            });
            const result = applySelectionToFilters(
                filters([
                    rule({
                        id: 'b',
                        fieldId: 'date',
                        operator: FilterOperator.IN_BETWEEN,
                        dateRangeGranularity: TimeFrames.MONTH,
                        minAllowedDate: '2025-01-01',
                        maxAllowedDate: '2025-12-31',
                        settings: { dateRange: { mode: 'dynamic' } },
                    }),
                ]),
                source,
                'dimension',
            );
            expect(result.changed).toBe(true);
            expect(result.filters.dimensions[0].values).toEqual([
                '2025-01-01',
                '2025-12-31',
            ]);
            // 动态默认被剥掉，避免查询前 preset 重新解析覆盖继承值
            expect(result.filters.dimensions[0].settings).toEqual({});
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

        it('syncs a plain field across marts by column name', () => {
            // 客户现场：各 Tab 的「时间」是同一个 period 列，但分属不同 mart。
            const timeSource = rule({
                id: 'tab-a-time',
                fieldId: 'group_cls4_insight_list_period',
                tableName: 'group_cls4_insight_list',
                values: ['YTD2609'],
            });
            const tabFilters = {
                'tab-a': filters([timeSource]),
                'tab-b': filters([
                    rule({
                        id: 'tab-b-time',
                        fieldId: 'brand_cls3_insight_list_period',
                        tableName: 'brand_cls3_insight_list',
                        values: ['近3个月'],
                    }),
                ]),
                'tab-c': filters([
                    rule({
                        id: 'tab-c-region',
                        fieldId: 'cls_insight_list_region_name',
                        tableName: 'cls_insight_list',
                        values: ['全国'],
                    }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    timeSource,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-b']);
            expect(next['tab-b'].dimensions[0].values).toEqual(['YTD2609']);
            // 不同列名的筛选器不能跟着变
            expect(next['tab-c'].dimensions[0].values).toEqual(['全国']);
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

        it('clamps each receiver tab by its own window', () => {
            const wideSource = rule({
                id: 'tab-a-date',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                values: ['2024-06-15', '2026-03-20'],
            });
            const tabFilters = {
                'tab-a': filters([wideSource]),
                // 12 个月窄窗口：继承值越界 → 钳到自己的边界
                'tab-b': filters([
                    rule({
                        id: 'tab-b-date',
                        fieldId: 'date',
                        operator: FilterOperator.IN_BETWEEN,
                        dateRangeGranularity: TimeFrames.MONTH,
                        minAllowedDate: '2025-01-01',
                        maxAllowedDate: '2025-12-31',
                    }),
                ]),
                // 24 个月宽窗口：继承值在界内 → 原样透传，不重复标脏
                'tab-c': filters([
                    rule({
                        id: 'tab-c-date',
                        fieldId: 'date',
                        operator: FilterOperator.IN_BETWEEN,
                        dateRangeGranularity: TimeFrames.MONTH,
                        minAllowedDate: '2024-01-01',
                        maxAllowedDate: '2026-12-31',
                        values: ['2024-06-15', '2026-03-20'],
                    }),
                ]),
            };
            const { tabFilters: next, changedTabUuids } =
                applySelectionToTabFilters(
                    tabFilters,
                    wideSource,
                    'dimension',
                    'tab-a',
                );
            expect(changedTabUuids).toEqual(['tab-b']);
            expect(next['tab-b'].dimensions[0].values).toEqual([
                '2025-01-01',
                '2025-12-31',
            ]);
            // tab-c 界内透传：无变化、引用保持
            expect(next['tab-c']).toBe(tabFilters['tab-c']);
        });

        it('uses each tab own rolling window for the clamp (A 24 → B 12)', () => {
            // 客户场景：来源 Tab 窗口 24 个月、接收 Tab 12 个月，各按各的边界；
            // 动态上限按运行时口径（4 号数据可用规则）解析
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-07-15T12:00:00'));
            try {
                const wideSource = rule({
                    id: 'tab-a-date',
                    fieldId: 'date',
                    operator: FilterOperator.IN_BETWEEN,
                    dateRangeGranularity: TimeFrames.MONTH,
                    enableDynamicMaxAllowedDate: true,
                    rollingMinAllowedMonths: 24,
                    values: ['2024-07-01', '2026-06-30'],
                });
                const tabFilters = {
                    'tab-a': filters([wideSource]),
                    'tab-b': filters([
                        rule({
                            id: 'tab-b-date',
                            fieldId: 'date',
                            operator: FilterOperator.IN_BETWEEN,
                            dateRangeGranularity: TimeFrames.MONTH,
                            enableDynamicMaxAllowedDate: true,
                            rollingMinAllowedMonths: 12,
                        }),
                    ]),
                };
                const { tabFilters: next, changedTabUuids } =
                    applySelectionToTabFilters(
                        tabFilters,
                        wideSource,
                        'dimension',
                        'tab-a',
                    );
                expect(changedTabUuids).toEqual(['tab-b']);
                // B 的 12 个月窗口：max=2026-06-30、rolling min=2025-07-01，
                // 来源 24 个月窗口的起点 2024-07-01 越界 → 夹到 B 自己的下限
                expect(next['tab-b'].dimensions[0].values).toEqual([
                    '2025-07-01',
                    '2026-06-30',
                ]);
            } finally {
                vi.useRealTimers();
            }
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

        it('restores a plain field of another mart by column name', () => {
            // 重置时「时间」也应跨 mart 回到各自作者默认值（见诊断文档 §13）
            const runtime = filters([
                rule({
                    id: 'r1',
                    fieldId: 'brand_cls3_insight_list_period',
                    tableName: 'brand_cls3_insight_list',
                    values: ['YTD2609'],
                }),
            ]);
            const serverField = filters([
                rule({
                    id: 'srv-current',
                    fieldId: 'group_cls4_insight_list_period',
                    tableName: 'group_cls4_insight_list',
                }),
            ]);
            const server = filters([
                rule({
                    id: 'srv-target',
                    fieldId: 'brand_cls3_insight_list_period',
                    tableName: 'brand_cls3_insight_list',
                    values: ['近3个月'],
                }),
            ]);
            const restored = restoreAuthorDefaults(
                runtime,
                serverField,
                server,
            );
            expect(restored.dimensions[0].values).toEqual(['近3个月']);
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

describe('applySelectionValues round trip (A → B → A)', () => {
    it('inherits clamped values back into the wider tab without out-of-window values', () => {
        // 场景：作者窗口 A(24 个月) → B(12 个月) → 同步回 A。
        // 期望：B 按自身窗口钳制；钳后值再回到 A 时在 A 的窗口内原样继承；
        // A 的约束字段（rolling/动态 max）不因同步而改变。
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-15T12:00:00'));
        try {
            const tabA = rule({
                id: 'tab-a-date',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                enableDynamicMaxAllowedDate: true,
                rollingMinAllowedMonths: 24,
            });
            const tabB = rule({
                id: 'tab-b-date',
                fieldId: 'date',
                operator: FilterOperator.IN_BETWEEN,
                dateRangeGranularity: TimeFrames.MONTH,
                enableDynamicMaxAllowedDate: true,
                rollingMinAllowedMonths: 12,
            });
            // 作者在 A 上选择了完整 24 个月窗口（运行时窗口 2024-07-01 ~ 2026-06-30）
            const aSelected = {
                ...tabA,
                values: ['2024-07-01', '2026-06-30'],
            };

            // A → B：B 按自身 12 个月窗口钳制（2025-07-01 ~ 2026-06-30）
            const bAfter = applySelectionValues(tabB, aSelected);
            expect(bAfter.values).toEqual(['2025-07-01', '2026-06-30']);
            expect(bAfter.rollingMinAllowedMonths).toBe(12);

            // B → A：钳后值在 A 的 24 个月窗口内 → 原样继承，A 不越界
            const aAfter = applySelectionValues({ ...tabA }, bAfter);
            expect(aAfter.values).toEqual(['2025-07-01', '2026-06-30']);
            expect(aAfter.rollingMinAllowedMonths).toBe(24);
            expect(aAfter.enableDynamicMaxAllowedDate).toBe(true);
            expect(aAfter.id).toBe('tab-a-date');
        } finally {
            vi.useRealTimers();
        }
    });
});

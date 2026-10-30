import {
    FilterOperator,
    type DashboardFieldTarget,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import {
    CATEGORY_COLUMN_LEVELS,
    getCategoryColumnName,
    getCategoryLevelOf,
    getDeclaredCategoryLevel,
    type CategoryLevel,
} from './categoryLevel';

type RuleOverrides = Omit<
    Partial<DashboardFilterRule>,
    'categoryLevel' | 'target'
> & {
    id: string;
    fieldId: string;
    tableName?: string;
    target?: Partial<DashboardFieldTarget>;
    /**
     * 这里放开成 number，是为了让测试能构造非法层级（0 / 5），
     * 验证「非法值视为未声明」。
     */
    categoryLevel?: number;
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
    categoryLevel:
        overrides.categoryLevel as DashboardFilterRule['categoryLevel'],
});

const LEVELS: CategoryLevel[] = [1, 2, 3, 4];

describe('categoryLevel', () => {
    describe('getCategoryLevelOf', () => {
        describe('显式 categoryLevel 优先', () => {
            it('uses the explicit level 1..4 over the column name', () => {
                LEVELS.forEach((level) => {
                    // 列名推导会得到 4，显式层级必须赢
                    const result = getCategoryLevelOf(
                        rule({
                            id: `explicit-${level}`,
                            fieldId: 'orders_cls_4',
                            tableName: 'orders',
                            categoryLevel: level,
                        }),
                    );
                    expect(result).toBe(level);
                });
            });

            it('ignores an out-of-range level and derives from the column name', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'invalid-0',
                            fieldId: 'orders_cls_2',
                            tableName: 'orders',
                            categoryLevel: 0,
                        }),
                    ),
                ).toBe(2);
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'invalid-5',
                            fieldId: 'orders_cls_3',
                            tableName: 'orders',
                            categoryLevel: 5,
                        }),
                    ),
                ).toBe(3);
            });

            it('ignores a missing level and derives from the column name', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'undefined-level',
                            fieldId: 'orders_cls_4',
                            tableName: 'orders',
                        }),
                    ),
                ).toBe(4);
            });

            it('ignores a non-numeric level and derives from the column name', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'string-level',
                            fieldId: 'orders_cls_2',
                            tableName: 'orders',
                            categoryLevel: '2' as unknown as number,
                        }),
                    ),
                ).toBe(2);
            });
        });

        describe('列名推导', () => {
            it('derives the level from cls_1..cls_4', () => {
                LEVELS.forEach((level) => {
                    const result = getCategoryLevelOf(
                        rule({
                            id: `cls-underscore-${level}`,
                            fieldId: `orders_cls_${level}`,
                            tableName: 'orders',
                        }),
                    );
                    expect(result).toBe(level);
                });
            });

            it('derives the level from cls1..cls4', () => {
                LEVELS.forEach((level) => {
                    const result = getCategoryLevelOf(
                        rule({
                            id: `cls-plain-${level}`,
                            fieldId: `cls${level}`,
                            tableName: 'orders',
                        }),
                    );
                    expect(result).toBe(level);
                });
            });

            it('strips the tableName prefix before deriving the level', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'cross-mart',
                            fieldId: 'group_cls2_insight_list_cls_2',
                            tableName: 'group_cls2_insight_list',
                        }),
                    ),
                ).toBe(2);
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'cross-mart-plain',
                            fieldId: 'cls_insight_list_cls3',
                            tableName: 'cls_insight_list',
                        }),
                    ),
                ).toBe(3);
            });
        });

        describe('无法识别', () => {
            it('returns null for an unknown column name', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'unknown-column',
                            fieldId: 'orders_revenue',
                            tableName: 'orders',
                        }),
                    ),
                ).toBeNull();
            });

            it('returns null for a SQL column', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'sql-column',
                            fieldId: 'orders_cls_1',
                            tableName: 'orders',
                            target: { isSqlColumn: true },
                        }),
                    ),
                ).toBeNull();
            });

            it('returns null when the field has no category column at all', () => {
                expect(
                    getCategoryLevelOf(
                        rule({
                            id: 'no-column',
                            fieldId: 'orders_cls',
                            tableName: 'orders',
                        }),
                    ),
                ).toBeNull();
            });
        });
    });

    describe('getDeclaredCategoryLevel', () => {
        it('returns the declared level for 1..4', () => {
            LEVELS.forEach((level) => {
                expect(
                    getDeclaredCategoryLevel(
                        rule({
                            id: `declared-${level}`,
                            fieldId: 'orders_cls_1',
                            tableName: 'orders',
                            categoryLevel: level,
                        }),
                    ),
                ).toBe(level);
            });
        });

        it('returns null for illegal values', () => {
            expect(
                getDeclaredCategoryLevel(
                    rule({
                        id: 'declared-0',
                        fieldId: 'orders_cls_1',
                        categoryLevel: 0,
                    }),
                ),
            ).toBeNull();
            expect(
                getDeclaredCategoryLevel(
                    rule({
                        id: 'declared-5',
                        fieldId: 'orders_cls_1',
                        categoryLevel: 5,
                    }),
                ),
            ).toBeNull();
            expect(
                getDeclaredCategoryLevel(
                    rule({ id: 'declared-none', fieldId: 'orders_cls_1' }),
                ),
            ).toBeNull();
            expect(
                getDeclaredCategoryLevel(
                    rule({
                        id: 'declared-string',
                        fieldId: 'orders_cls_1',
                        categoryLevel: '1' as unknown as number,
                    }),
                ),
            ).toBeNull();
        });
    });

    describe('CATEGORY_COLUMN_LEVELS', () => {
        it('maps both cls_1..cls_4 and cls1..cls4 to their level', () => {
            LEVELS.forEach((level) => {
                expect(CATEGORY_COLUMN_LEVELS[`cls_${level}`]).toBe(level);
                expect(CATEGORY_COLUMN_LEVELS[`cls${level}`]).toBe(level);
            });
        });
    });

    describe('getCategoryColumnName', () => {
        it('strips the tableName prefix', () => {
            expect(
                getCategoryColumnName(
                    rule({
                        id: 'column-prefix',
                        fieldId: 'orders_cls_1',
                        tableName: 'orders',
                    }),
                ),
            ).toBe('cls_1');
        });

        it('falls back to the last segment when the tableName is not a prefix', () => {
            expect(
                getCategoryColumnName(
                    rule({
                        id: 'column-no-prefix',
                        fieldId: 'orders_revenue',
                        tableName: 'mart_a',
                    }),
                ),
            ).toBe('revenue');
            // 末尾是类目列时保留两段，便于诊断日志看出真实列名
            expect(
                getCategoryColumnName(
                    rule({
                        id: 'column-no-prefix-cls',
                        fieldId: 'orders_cls_2',
                        tableName: 'mart_a',
                    }),
                ),
            ).toBe('cls_2');
        });

        it('returns the fieldId itself when there is no tableName', () => {
            // 没有表名前缀时 fieldId 就是列名（不能只取最后一段，否则 cls_2 → '2'）
            expect(
                getCategoryColumnName(
                    rule({
                        id: 'column-no-table',
                        fieldId: 'orders_cls_2',
                        tableName: '',
                    }),
                ),
            ).toBe('orders_cls_2');
            expect(
                getCategoryColumnName(
                    rule({
                        id: 'column-no-table-cls',
                        fieldId: 'cls_2',
                        tableName: '',
                    }),
                ),
            ).toBe('cls_2');
        });

        it('returns the raw fieldId when it has no underscore', () => {
            expect(
                getCategoryColumnName(
                    rule({
                        id: 'column-no-underscore',
                        fieldId: 'cls1',
                        tableName: 'orders',
                    }),
                ),
            ).toBe('cls1');
        });
    });
});

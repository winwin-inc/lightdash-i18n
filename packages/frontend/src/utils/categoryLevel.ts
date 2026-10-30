import { type DashboardFilterRule } from '@lightdash/common';

/**
 * 类目层级（1 = 一级类目 … 4 = 四级类目）
 */
export type CategoryLevel = 1 | 2 | 3 | 4;

/**
 * 作者显式声明的类目层级（非法值视为未声明）
 */
export const getDeclaredCategoryLevel = (
    rule: DashboardFilterRule,
): CategoryLevel | null => {
    const level = rule.categoryLevel;
    if (typeof level !== 'number') return null;
    if (level !== 1 && level !== 2 && level !== 3 && level !== 4) return null;
    return level;
};

/**
 * 类目列名 → 层级。类目 mart 的约定是同一套列冗余在多个表里，
 * 列名固定为 cls_1..cls_4（或 cls1..cls4）。
 */
export const CATEGORY_COLUMN_LEVELS: Record<string, CategoryLevel> = {
    cls_1: 1,
    cls1: 1,
    cls_2: 2,
    cls2: 2,
    cls_3: 3,
    cls3: 3,
    cls_4: 4,
    cls4: 4,
};

/**
 * 字段的列名：fieldId 通常是 `${tableName}_${columnName}`，取掉表名前缀。
 */
export const getCategoryColumnName = (rule: DashboardFilterRule): string => {
    const { fieldId, tableName } = rule.target;
    if (tableName && fieldId.startsWith(`${tableName}_`)) {
        return fieldId.slice(tableName.length + 1);
    }
    // 没有表名前缀时，fieldId 本身就是列名
    if (!tableName) return fieldId;

    const parts = fieldId.split('_');
    // 表名不匹配/缺失时，末尾两段仍可能是类目列（如 a_b_cls_2）
    const tail = parts.slice(-2).join('_');
    if (CATEGORY_COLUMN_LEVELS[tail] !== undefined) return tail;

    return parts.length > 1 ? parts[parts.length - 1] : fieldId;
};

/**
 * 类目层级：优先取作者显式配置的 `categoryLevel`，其次按列名推导（cls_1..cls_4）。
 *
 * 推导的原因：跨 mart 的同一套类目列，有的 Tab 配了类目层级、有的没配。
 * 只认显式层级时，“没配层级”的那一侧连身份都匹配不上，跨 Tab 继承会静默失效。
 *
 * 注意：只做「字段本身能证明」的推导（显式配置 / 列名约定），
 * 不做 label 文案猜测 —— label 是展示文案，可能被作者随意改。
 */
export const getCategoryLevelOf = (
    rule: DashboardFilterRule,
): CategoryLevel | null => {
    const declared = getDeclaredCategoryLevel(rule);
    if (declared !== null) return declared;
    if (rule.target.isSqlColumn) return null;

    const columnLevel = CATEGORY_COLUMN_LEVELS[getCategoryColumnName(rule)];
    if (columnLevel !== undefined) return columnLevel;

    // 表名前缀缺失 / 不匹配时，fieldId 末尾仍可能是 cls_N（如 a_b_cls_2）
    const tail = rule.target.fieldId.split('_').slice(-2).join('_');
    return CATEGORY_COLUMN_LEVELS[tail] ?? null;
};

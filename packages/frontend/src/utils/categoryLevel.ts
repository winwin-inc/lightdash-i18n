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

const CHINESE_LEVEL_NUMERALS: Record<CategoryLevel, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
};

const LEVELS: CategoryLevel[] = [1, 2, 3, 4];

/**
 * 仅用于「配置界面 / 批量绑定」的层级兜底：字段 / 列名都推不出层级时，再看 label 文案。
 *
 * 老看板里存在「只把层级写进 label」的配置；批量绑定会把推导出的层级写回
 * `categoryLevel`，之后运行时只认显式层级 / 列名，不再依赖文案。
 *
 * 这里刻意保守：中文必须出现「X级类目」，英文必须出现「level N category」，
 * 避免把普通筛选器（例如 “Level 2 approval”）误判成类目。
 *
 * 注意：运行时（`isCategoryField`）**不**使用这个兜底 —— label 是展示文案，
 * 误判会让普通筛选器被当成类目自动解析。
 */
export const getCategoryLevelFromLabel = (
    rule: DashboardFilterRule,
): CategoryLevel | null => {
    // SQL 列不参与类目识别（与跨 Tab 继承的 SQL 排除保持一致）
    if (rule.target.isSqlColumn) return null;

    const labels = [rule.label, rule.target.fieldLabel]
        .filter((label): label is string => typeof label === 'string')
        .map((label) => label.trim().toLowerCase())
        .filter((label) => label.length > 0);
    if (labels.length === 0) return null;

    const chineseMatch = LEVELS.find((level) => {
        const keyword = `${CHINESE_LEVEL_NUMERALS[level]}级类目`;
        return labels.some((label) => label.includes(keyword));
    });
    if (chineseMatch) return chineseMatch;

    const englishMatch = LEVELS.find((level) => {
        const pattern = new RegExp(`level\\s*${level}\\s*category\\b`, 'i');
        return labels.some((label) => pattern.test(label));
    });
    return englishMatch ?? null;
};

/**
 * 配置界面用：这个筛选器「像不像类目」。
 *
 * 用于决定是否展示「类目层级」选择器 —— 对集团 / 品牌 / 商品名称 / 时间这类
 * 明显不是类目的字段隐藏它，避免作者误设 `categoryLevel` 造成不可逆的语义污染
 * （一旦设置，该筛选器会被当成类目自动解析、跨 Tab 同级继承、重置为首值）。
 *
 * 判据（任一命中即展示）：
 * - 已显式声明 `categoryLevel`（含历史数据）
 * - 列名约定 `cls_1..cls_4`（`getCategoryLevelOf` 的推导）
 * - label 写成「X级类目」/「level N category」（老看板兼容，与批量绑定一致）
 */
export const looksLikeCategoryFilter = (rule: DashboardFilterRule): boolean => {
    if (rule.target.isSqlColumn) return false;
    if (getCategoryLevelOf(rule) !== null) return true;
    if (getCategoryLevelFromLabel(rule) !== null) return true;

    // 最后一道兜底：label / 字段名里出现「类目」「category」就算。
    // 宁可多显示一个下拉框，也不要让作者没法声明层级（误显示的代价只是多一个框，
    // 误隐藏的代价是这个看板永远绑不了类目层级）。
    const texts = [rule.label, rule.target.fieldLabel, rule.target.fieldId]
        .filter((text): text is string => typeof text === 'string')
        .map((text) => text.toLowerCase());
    return texts.some(
        (text) => text.includes('类目') || text.includes('category'),
    );
};

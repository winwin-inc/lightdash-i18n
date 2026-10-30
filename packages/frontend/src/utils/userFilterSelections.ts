import {
    FilterOperator,
    TimeFrames,
    isDateRangeDynamic,
    isSingleDateDynamic,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';

import {
    getCategoryColumnName,
    getCategoryLevelOf,
    type CategoryLevel,
} from './categoryLevel';

/**
 * 用户在查看模式下的显式选择。
 *
 * 只包含用户自己选中的内容（取值 + 生效状态），不包含作者配置：
 * - operator / settings（粒度、日期边界、动态默认）归各 Tab 的作者配置所有
 * - 类目级联派生出来的子级取值、权限回退后的兜底取值也不进入继承
 */
export type FilterSelection = {
    operator: FilterOperator;
    values?: unknown[];
    settings?: unknown;
    disabled?: boolean;
};

export type FilterNamespace = 'dimension' | 'metric' | 'tableCalculation';

/**
 * 跨 Tab 匹配结果的类型（仅用于诊断日志）：
 * - exact-field：同一张表的同一个字段
 * - category-level：跨 mart 的同级类目（同一 categoryLevel）
 */
export type FilterMatchKind = 'exact-field' | 'category-level';

export type FilterMatch = {
    index: number;
    matchKind: FilterMatchKind;
};

/** 诊断上下文：出问题的 Tab（仅用于日志） */
export type FilterMatchContext = {
    tabUuid?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 跨 Tab 继承诊断日志（仅开发模式）。
 *
 * 继承有三道闸门（身份 / 兼容性 / 取值变化），任何一道静默拒绝都会表现为
 * 「切到另一个 Tab 还是旧值」，所以每次跳过都要留下原因。
 */
const logCrossTabInheritance = (...args: unknown[]): void => {
    if (import.meta.env.DEV !== true) return;
    // eslint-disable-next-line no-console
    console.log('[cross-tab-inherit]', ...args);
};

/**
 * 规则摘要（诊断日志用）：身份匹配失败时，一眼看到两侧的字段 / 列名 / 层级。
 */
const summarizeRuleForLog = (rule: DashboardFilterRule) => ({
    id: rule.id,
    fieldId: rule.target.fieldId,
    tableName: rule.target.tableName,
    column: getCategoryColumnName(rule),
    isSqlColumn: rule.target.isSqlColumn ?? false,
    categoryLevel: rule.categoryLevel ?? null,
    effectiveCategoryLevel: getCategoryLevelOf(rule),
    operator: rule.operator,
    values: rule.values ?? null,
    disabled: rule.disabled ?? false,
});

const getRuleList = (
    filters: DashboardFilters,
    namespace: FilterNamespace,
): DashboardFilterRule[] => {
    if (namespace === 'dimension') return filters.dimensions;
    if (namespace === 'metric') return filters.metrics;
    return filters.tableCalculations;
};

const withRuleList = (
    filters: DashboardFilters,
    namespace: FilterNamespace,
    rules: DashboardFilterRule[],
): DashboardFilters => {
    if (namespace === 'dimension') return { ...filters, dimensions: rules };
    if (namespace === 'metric') return { ...filters, metrics: rules };
    return { ...filters, tableCalculations: rules };
};

/**
 * 字段身份：跨 Tab 判断「是不是同一个字段」的唯一依据。
 *
 * 规则 id 是作者按 Tab 配置时生成的，同一个字段在不同 Tab 里 id 不同，
 * 所以不能拿 id 做跨 Tab 匹配，只能用「命名空间 + 表 + 字段」。
 *
 * 例外：SQL 列（isSqlColumn）—— fieldId 只是列名、tableName 没有意义，
 * 两个 Tab 里的同名 SQL 列很可能是完全不同的表达式，误共享会套错值，
 * 因此 SQL 列不参与跨 Tab 共享，退化成按 rule id 匹配。
 */
export const getFilterIdentityKey = (
    rule: DashboardFilterRule,
    namespace: FilterNamespace,
): string => {
    if (rule.target.isSqlColumn) {
        return `rule:${rule.id}`;
    }
    return `${namespace}:${rule.target.tableName}.${rule.target.fieldId}`;
};

/**
 * 在筛选器集合里找到指定 id 的规则及其所属命名空间
 */
export const findFilterRuleById = (
    filters: DashboardFilters,
    ruleId: string,
): { rule: DashboardFilterRule; namespace: FilterNamespace } | undefined => {
    const dimension = filters.dimensions.find((rule) => rule.id === ruleId);
    if (dimension) {
        return { rule: dimension, namespace: 'dimension' };
    }
    const metric = filters.metrics.find((rule) => rule.id === ruleId);
    if (metric) {
        return { rule: metric, namespace: 'metric' };
    }
    const tableCalculation = filters.tableCalculations.find(
        (rule) => rule.id === ruleId,
    );
    if (tableCalculation) {
        return { rule: tableCalculation, namespace: 'tableCalculation' };
    }
    return undefined;
};

/**
 * 跨 mart 的同级类目：dbt mart 常常把同一套类目列（cls_1..cls_4）冗余在多个表里，
 * 同一物理列在不同 mart 上是两个 fieldId（group_cls2_insight_list_cls_2 vs
 * cls_insight_list_cls_2）。只看 fieldId 会把它们判成两个不同筛选器，
 * 继承与重置都不会发生。类目层级是作者显式声明的语义，同级即可视为同一筛选器。
 */
const isCategoryRulePair = (
    source: DashboardFilterRule,
    candidate: DashboardFilterRule,
    namespace: FilterNamespace,
): boolean => {
    if (namespace !== 'dimension') return false;
    if (source.target.isSqlColumn || candidate.target.isSqlColumn) {
        return false;
    }
    const sourceLevel: CategoryLevel | null = getCategoryLevelOf(source);
    if (sourceLevel === null) return false;
    return sourceLevel === getCategoryLevelOf(candidate);
};

/**
 * 找出「同一个筛选器」在集合里的位置。
 *
 * 精确字段命中优先；没有精确命中时，类目才按 categoryLevel 兜底。
 * （精确命中存在时绝不兜底：同一作用域里已有同字段规则，就不该再动别的类目。）
 */
export const findMatchingRuleIndices = (
    rules: DashboardFilterRule[],
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
): FilterMatch[] => {
    const sourceIdentity = getFilterIdentityKey(sourceRule, namespace);

    const exactMatches: FilterMatch[] = [];
    rules.forEach((rule, index) => {
        if (getFilterIdentityKey(rule, namespace) === sourceIdentity) {
            exactMatches.push({ index, matchKind: 'exact-field' });
        }
    });
    if (exactMatches.length > 0) return exactMatches;

    const levelMatches: FilterMatch[] = [];
    rules.forEach((rule, index) => {
        if (isCategoryRulePair(sourceRule, rule, namespace)) {
            levelMatches.push({ index, matchKind: 'category-level' });
        }
    });
    return levelMatches;
};

/**
 * 按「同一个筛选器」的规则在集合里找一条规则
 */
export const findInheritedRule = (
    filters: DashboardFilters,
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
): DashboardFilterRule | undefined => {
    const rules = getRuleList(filters, namespace);
    const [firstMatch] = findMatchingRuleIndices(rules, sourceRule, namespace);
    return firstMatch ? rules[firstMatch.index] : undefined;
};

/* -------------------------------------------------------------------------- */
/*                              日期筛选器形态                                */
/* -------------------------------------------------------------------------- */

/**
 * 日期筛选器有很多种形态，取值能不能互搬取决于形态：
 * - 相对时间（inThePast：values = [数字] + settings.unitOfTime）
 * - 当前周期（inTheCurrent：无取值，只有 unitOfTime）
 * - 固定单值（equals：values = ['2026-09']）
 * - 动态单值默认（equals + settings.singleDate.mode='dynamic'）
 * - 固定区间（inBetween：values = [start, end]）
 * - 动态区间默认（inBetween + settings.dateRange.mode='dynamic'）
 *
 * 「近3个月」和「月份=2026-09」是两个不同形态的筛选器，取值无法互译，
 * 因此本模块只承认「同形态」才继承，不做任何换算。
 */
type DateShape = {
    isDate: boolean;
    unitOfTime: string | null;
    completed: boolean;
    singleDateMode: string | null;
    dateRangeMode: string | null;
    rangeGranularity: string | null;
};

const isRangeOperator = (operator: FilterOperator): boolean =>
    operator === FilterOperator.IN_BETWEEN ||
    operator === FilterOperator.NOT_IN_BETWEEN;

const getDateShape = (rule: DashboardFilterRule): DateShape => {
    const settings = isRecord(rule.settings) ? rule.settings : {};
    const singleDate = isRecord(settings.singleDate)
        ? settings.singleDate
        : null;
    const dateRange = isRecord(settings.dateRange) ? settings.dateRange : null;

    const unitOfTime =
        typeof settings.unitOfTime === 'string' ? settings.unitOfTime : null;
    const singleDateMode =
        singleDate && typeof singleDate.mode === 'string'
            ? singleDate.mode
            : null;
    const dateRangeMode =
        dateRange && typeof dateRange.mode === 'string' ? dateRange.mode : null;

    return {
        isDate:
            unitOfTime !== null ||
            singleDateMode !== null ||
            dateRangeMode !== null,
        unitOfTime,
        // 缺省视为「非完整周期」，与显式 false 等价
        completed: settings.completed === true,
        singleDateMode,
        dateRangeMode,
        rangeGranularity: isRangeOperator(rule.operator)
            ? rule.dateRangeGranularity ?? TimeFrames.DAY
            : null,
    };
};

const isDynamicDateRule = (rule: DashboardFilterRule): boolean =>
    isSingleDateDynamic(rule) || isDateRangeDynamic(rule);

/**
 * 去掉接收方的「动态默认」（singleDate / dateRange）。
 *
 * 查看者手动选值后，源 Tab 的规则会被固定成具体取值（`writeFixed` →
 * `getSingleDateRuleWithFixedValues`），而接收方仍然是动态默认。
 * 如果只复制 values 保留动态 settings，查询前 `prepareDashboardFilterRuleForQuery`
 * 会用 preset 重新解析并把继承值覆盖掉 —— 表现为「继承没生效」。
 */
const stripDynamicDateSettings = (
    rule: DashboardFilterRule,
): DashboardFilterRule => {
    if (!isDynamicDateRule(rule)) return rule;
    const settings = isRecord(rule.settings) ? rule.settings : null;
    if (!settings) return rule;

    const nextSettings = { ...settings };
    if (isSingleDateDynamic(rule)) delete nextSettings.singleDate;
    if (isDateRangeDynamic(rule)) delete nextSettings.dateRange;

    return { ...rule, settings: nextSettings };
};

/**
 * 兼容性闸门：来源规则的选择能不能套到目标规则上。
 *
 * 不兼容时宁可不继承，也不能覆盖作者的控件配置或造出非法的筛选器：
 * - operator 决定取值个数（equals 1 个 / inBetween 2 个 / in 多个），不一致会生成非法条件
 * - 类目层级不同则同一个取值在两个 Tab 里含义不同
 * - 日期形态（unitOfTime / completed / 动态默认 / 区间粒度）不同则取值无法互译
 * - 两边都声明了 fallbackType 且不一致：字段类型变了（看板升级 / dbt 变更），
 *   旧的取值可能已经不是合法值，宁可不继承
 *
 * 注意：`disabled` 不再是拒绝条件 —— 它表示「当前没有生效取值」，
 * 用户显式选值后接收方必须跟着启用（见 applySelectionValues）。
 */
const getSelectionIncompatibility = (
    source: DashboardFilterRule,
    target: DashboardFilterRule,
): string | null => {
    if (source.operator !== target.operator) return 'operator-mismatch';

    const sourceLevel: CategoryLevel | null = getCategoryLevelOf(source);
    if (sourceLevel !== getCategoryLevelOf(target)) {
        return 'category-level-mismatch';
    }
    // 类目：父级绑定指向各 Tab 自己的父级字段（跨 mart 必然是不同 fieldId），
    // 同一层级即视为同一筛选器；非类目仍要求父级一致。
    if (
        sourceLevel === null &&
        (source.parentFieldId ?? null) !== (target.parentFieldId ?? null)
    ) {
        return 'parent-mismatch';
    }

    if (
        source.target.fallbackType !== undefined &&
        target.target.fallbackType !== undefined &&
        source.target.fallbackType !== target.target.fallbackType
    ) {
        return 'fallback-type-mismatch';
    }

    const sourceShape = getDateShape(source);
    const targetShape = getDateShape(target);
    if (sourceShape.isDate || targetShape.isDate) {
        // 来源是动态默认（查看者没有显式选值）→ 值是占位符，无法搬
        if (isDynamicDateRule(source)) return 'source-dynamic';
        if (sourceShape.unitOfTime !== targetShape.unitOfTime) {
            return 'date-unit-mismatch';
        }
        if (sourceShape.completed !== targetShape.completed) {
            return 'date-completed-mismatch';
        }
        // 接收方是动态默认、来源已固定 → 允许（继承后剥掉动态默认）
        if (
            sourceShape.singleDateMode !== targetShape.singleDateMode &&
            !(targetShape.singleDateMode === 'dynamic')
        ) {
            return 'date-shape-mismatch';
        }
        if (
            sourceShape.dateRangeMode !== targetShape.dateRangeMode &&
            !(targetShape.dateRangeMode === 'dynamic')
        ) {
            return 'date-shape-mismatch';
        }
        if (sourceShape.rangeGranularity !== targetShape.rangeGranularity) {
            return 'date-range-granularity-mismatch';
        }
    }

    return null;
};

export const isRuleSelectionCompatible = (
    source: DashboardFilterRule,
    target: DashboardFilterRule,
): boolean => getSelectionIncompatibility(source, target) === null;

/**
 * 取出规则上的「用户选择」
 */
const getFilterSelection = (rule: DashboardFilterRule): FilterSelection => ({
    operator: rule.operator,
    values: rule.values,
    settings: rule.settings,
    disabled: rule.disabled,
});

/**
 * 把选择整条套用到规则上（用于「恢复作者默认值」：
 * operator / 取值 / 设置 / 生效状态全部回到服务端快照）。
 */
export const applyFilterSelection = (
    rule: DashboardFilterRule,
    selection: FilterSelection,
): DashboardFilterRule => ({
    ...rule,
    operator: selection.operator,
    values: selection.values,
    settings: selection.settings,
    disabled: selection.disabled,
});

/**
 * 跨 Tab 继承：只搬「用户选的取值 + 生效状态」，不动作者的控件配置。
 *
 * - `values` 覆盖为来源的取值
 * - `disabled` 跟随来源：有值 → 启用（"任何值"的规则也会被启用并真正参与过滤）；
 *   来源被清空 → 同步成"任何值"
 * - `settings` 只在接收方是动态默认时去掉 singleDate / dateRange，
 *   其余粒度 / 日期边界 / 排除项保持接收方作者配置
 */
export const applySelectionValues = (
    rule: DashboardFilterRule,
    source: DashboardFilterRule,
): DashboardFilterRule => {
    const target = stripDynamicDateSettings(rule);
    return {
        ...target,
        values: source.values !== undefined ? [...source.values] : [],
        disabled: source.disabled ?? false,
    };
};

const serialize = (value: unknown): string =>
    value === undefined ? 'null' : JSON.stringify(value);

const isSameRuleSelection = (
    a: DashboardFilterRule,
    b: DashboardFilterRule,
): boolean =>
    a.operator === b.operator &&
    (a.disabled ?? false) === (b.disabled ?? false) &&
    serialize(a.values) === serialize(b.values) &&
    serialize(a.settings) === serialize(b.settings);

const applySelectionToRuleList = (
    rules: DashboardFilterRule[],
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
    context?: FilterMatchContext,
): {
    rules: DashboardFilterRule[];
    changed: boolean;
    matchKind: FilterMatchKind | null;
} => {
    const matches = findMatchingRuleIndices(rules, sourceRule, namespace);
    if (matches.length === 0) {
        // 一个都匹配不上是最容易"静默失效"的分支：必须把两侧的字段 / 层级 / 列名
        // 都打出来，否则只能看到"切过去没继承"而毫无线索。
        logCrossTabInheritance('skip: no matching rule', {
            tabUuid: context?.tabUuid ?? null,
            source: summarizeRuleForLog(sourceRule),
            candidates: rules.map(summarizeRuleForLog),
        });
        return { rules, changed: false, matchKind: null };
    }

    const matchKindByIndex = new Map<number, FilterMatchKind>();
    matches.forEach((match) =>
        matchKindByIndex.set(match.index, match.matchKind),
    );

    if (matches.length > 1) {
        logCrossTabInheritance('multiple matches for the same filter', {
            tabUuid: context?.tabUuid ?? null,
            fieldId: sourceRule.target.fieldId,
            categoryLevel: getCategoryLevelOf(sourceRule),
            ruleIds: matches.map((match) => rules[match.index]?.id ?? null),
            matchKind: matches[0].matchKind,
        });
    }

    let changed = false;
    const nextRules = rules.map((rule, index) => {
        const matchKind = matchKindByIndex.get(index);
        if (!matchKind) return rule;

        const reason = getSelectionIncompatibility(sourceRule, rule);
        if (reason !== null) {
            logCrossTabInheritance('skip: incompatible', {
                reason,
                tabUuid: context?.tabUuid ?? null,
                fieldId: sourceRule.target.fieldId,
                targetFieldId: rule.target.fieldId,
                matchKind,
                sourceOperator: sourceRule.operator,
                targetOperator: rule.operator,
                sourceCategoryLevel: getCategoryLevelOf(sourceRule),
                targetCategoryLevel: getCategoryLevelOf(rule),
                sourceSettings: sourceRule.settings ?? null,
                targetSettings: rule.settings ?? null,
            });
            return rule;
        }

        const next = applySelectionValues(rule, sourceRule);
        if (isSameRuleSelection(rule, next)) {
            logCrossTabInheritance('skip: no change', {
                tabUuid: context?.tabUuid ?? null,
                fieldId: sourceRule.target.fieldId,
                targetFieldId: rule.target.fieldId,
                matchKind,
                values: rule.values ?? null,
                disabled: rule.disabled ?? false,
            });
            return rule;
        }

        logCrossTabInheritance('inherited', {
            tabUuid: context?.tabUuid ?? null,
            fieldId: sourceRule.target.fieldId,
            targetFieldId: rule.target.fieldId,
            matchKind,
            fromValues: rule.values ?? null,
            toValues: next.values ?? null,
            fromDisabled: rule.disabled ?? false,
            toDisabled: next.disabled ?? false,
        });
        changed = true;
        return next;
    });

    return {
        rules: changed ? nextRules : rules,
        changed,
        matchKind: matches[0].matchKind,
    };
};

/**
 * 把来源规则的用户选择同步到同一个筛选器集合里的同字段规则。
 * 集合里没有该字段（或不兼容）时原样返回，不新建规则——筛选器定义归作者。
 */
export const applySelectionToFilters = (
    filters: DashboardFilters,
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
    context?: FilterMatchContext,
): {
    filters: DashboardFilters;
    changed: boolean;
    matchKind: FilterMatchKind | null;
} => {
    const result = applySelectionToRuleList(
        getRuleList(filters, namespace),
        sourceRule,
        namespace,
        context,
    );
    if (!result.changed) {
        return { filters, changed: false, matchKind: result.matchKind };
    }
    return {
        filters: withRuleList(filters, namespace, result.rules),
        changed: true,
        matchKind: result.matchKind,
    };
};

/**
 * 把来源规则的用户选择同步到所有 Tab 的筛选器集合（跨 Tab 继承）。
 *
 * excludeTabUuid：来源 Tab 自身不参与同步 —— 它的写入由原有的更新路径负责，
 * 避免与类目级联的签名校验冲突（同步会立刻改写已提交的筛选器）。
 */
export const applySelectionToTabFilters = (
    tabFilters: Record<string, DashboardFilters>,
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
    excludeTabUuid?: string,
): {
    tabFilters: Record<string, DashboardFilters>;
    changedTabUuids: string[];
} => {
    const next: Record<string, DashboardFilters> = { ...tabFilters };
    const changedTabUuids: string[] = [];

    Object.entries(tabFilters).forEach(([tabUuid, filters]) => {
        if (tabUuid === excludeTabUuid) {
            return;
        }
        const result = applySelectionToFilters(filters, sourceRule, namespace, {
            tabUuid,
        });
        if (result.changed) {
            next[tabUuid] = result.filters;
            changedTabUuids.push(tabUuid);
        }
    });

    return {
        tabFilters: changedTabUuids.length ? next : tabFilters,
        changedTabUuids,
    };
};

/**
 * 收集筛选器集合里所有字段的身份（诊断 / 剪枝用）
 */
export const getFilterIdentityKeys = (
    filters: DashboardFilters,
): Set<string> => {
    const keys = new Set<string>();
    filters.dimensions.forEach((rule) =>
        keys.add(getFilterIdentityKey(rule, 'dimension')),
    );
    filters.metrics.forEach((rule) =>
        keys.add(getFilterIdentityKey(rule, 'metric')),
    );
    filters.tableCalculations.forEach((rule) =>
        keys.add(getFilterIdentityKey(rule, 'tableCalculation')),
    );
    return keys;
};

/**
 * 在筛选器集合里按身份找规则
 */
export const findRuleByIdentity = (
    filters: DashboardFilters,
    identityKey: string,
    namespace: FilterNamespace,
): DashboardFilterRule | undefined => {
    return getRuleList(filters, namespace).find(
        (rule) => getFilterIdentityKey(rule, namespace) === identityKey,
    );
};

/**
 * 恢复作者默认值。
 *
 * - `serverFieldRules`：要恢复的字段来源（通常是当前 Tab 的服务端快照）
 * - `serverFilters`：目标作用域自己的服务端快照（各 Tab 用自己的默认值）
 *
 * 匹配用与继承一致的规则（精确字段优先，类目按层级兜底），
 * 恢复内容包括 operator / 取值 / 设置 / 生效状态：
 * 被继承启用的筛选器必须跟着回到作者的"任何值"，否则与作者配置不一致。
 */
export const restoreAuthorDefaults = (
    filters: DashboardFilters,
    serverFieldRules: DashboardFilters,
    serverFilters: DashboardFilters | undefined,
): DashboardFilters => {
    let changed = false;

    const restoreList = (
        rules: DashboardFilterRule[],
        namespace: FilterNamespace,
    ): DashboardFilterRule[] => {
        const fieldRules = getRuleList(serverFieldRules, namespace);
        if (fieldRules.length === 0) return rules;
        const targetServerRules = serverFilters
            ? getRuleList(serverFilters, namespace)
            : [];

        let listChanged = false;
        const next = rules.map((rule) => {
            const belongsToRestoredField =
                findMatchingRuleIndices(fieldRules, rule, namespace).length > 0;
            if (!belongsToRestoredField) return rule;

            const [serverMatch] = findMatchingRuleIndices(
                targetServerRules,
                rule,
                namespace,
            );
            const restored = serverMatch
                ? applyFilterSelection(
                      rule,
                      getFilterSelection(targetServerRules[serverMatch.index]),
                  )
                : // 服务端没有这个字段的规则 → 作者没配默认值 → "任何值"
                  { ...rule, values: [], disabled: true };

            if (isSameRuleSelection(rule, restored)) {
                return rule;
            }
            listChanged = true;
            return restored;
        });

        if (!listChanged) {
            return rules;
        }
        changed = true;
        return next;
    };

    const dimensions = restoreList(filters.dimensions, 'dimension');
    const metrics = restoreList(filters.metrics, 'metric');
    const tableCalculations = restoreList(
        filters.tableCalculations,
        'tableCalculation',
    );

    if (!changed) {
        return filters;
    }

    return { ...filters, dimensions, metrics, tableCalculations };
};

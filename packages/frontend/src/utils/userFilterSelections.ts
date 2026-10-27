import {
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterOperator,
} from '@lightdash/common';

/**
 * 用户在查看模式下的显式选择。
 *
 * 只包含用户自己选中的内容（操作符 + 取值 + 设置），不包含：
 * - 类目级联派生出来的子级取值
 * - 权限回退后的兜底取值
 *
 * 这两类值都是「当前 Tab 下的合法值」，不是用户意图，因此不能进入选择层，
 * 也不能被跨 Tab 继承（见下方 isRuleSelectionCompatible）。
 */
export type FilterSelection = {
    operator: FilterOperator;
    values?: unknown[];
    settings?: unknown;
};

/**
 * 选择层：按作用域（全局 / Tab）分桶，按字段（identityKey）索引。
 * Tab 作用域在所有 Tab 之间共享（跨 Tab 继承），全局作用域独立。
 */
export type UserFilterSelections = {
    global: Record<string, FilterSelection>;
    tab: Record<string, FilterSelection>;
};

export const emptyUserFilterSelections: UserFilterSelections = {
    global: {},
    tab: {},
};

export type FilterNamespace = 'dimension' | 'metric' | 'tableCalculation';

export type FilterScope = keyof UserFilterSelections;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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
 * 取出规则上的「用户选择」（操作符 + 取值 + 设置）
 */
export const getFilterSelection = (
    rule: DashboardFilterRule,
): FilterSelection => ({
    operator: rule.operator,
    values: rule.values,
    settings: rule.settings,
});

/**
 * 把选择套用到规则上：只改用户可选的部分，
 * 规则 id / target / tileTargets / 父子绑定 / 标签等定义保持不变。
 */
export const applyFilterSelection = (
    rule: DashboardFilterRule,
    selection: FilterSelection,
): DashboardFilterRule => ({
    ...rule,
    operator: selection.operator,
    values: selection.values,
    settings: selection.settings,
});

const hasUnitOfTime = (settings: unknown): boolean =>
    isRecord(settings) && 'unitOfTime' in settings;

const hasDateRange = (settings: unknown): boolean =>
    isRecord(settings) && 'dateRange' in settings;

/**
 * 兼容性闸门：来源规则的选择能不能套到目标规则上。
 *
 * 不兼容时宁可不继承，也不能覆盖作者的控件配置或造出非法的筛选器：
 * - operator 决定取值个数（equals 1 个 / inBetween 2 个 / in 多个），不一致会生成非法条件
 * - settings 承载日期单位与动态区间，形态不一致会丢掉语义
 * - 类目层级 / 父级字段不同则同一个取值在两个 Tab 里含义不同
 * - 被作者禁用（disabled）的规则不参与同步：编译器会把 disabled 渲染成 1=1，写了也不生效
 * - 两边都声明了 fallbackType 且不一致：字段类型变了（看板升级 / dbt 变更），
 *   旧的取值可能已经不是合法值，宁可不继承
 */
export const isRuleSelectionCompatible = (
    source: DashboardFilterRule,
    target: DashboardFilterRule,
): boolean => {
    if (target.disabled) {
        return false;
    }
    if (source.operator !== target.operator) {
        return false;
    }
    if (hasUnitOfTime(source.settings) !== hasUnitOfTime(target.settings)) {
        return false;
    }
    if (hasDateRange(source.settings) !== hasDateRange(target.settings)) {
        return false;
    }
    if ((source.categoryLevel ?? null) !== (target.categoryLevel ?? null)) {
        return false;
    }
    if ((source.parentFieldId ?? null) !== (target.parentFieldId ?? null)) {
        return false;
    }
    if (
        source.target.fallbackType !== undefined &&
        target.target.fallbackType !== undefined &&
        source.target.fallbackType !== target.target.fallbackType
    ) {
        return false;
    }
    return true;
};

const applySelectionToRuleList = (
    rules: DashboardFilterRule[],
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
): { rules: DashboardFilterRule[]; changed: boolean } => {
    const sourceIdentity = getFilterIdentityKey(sourceRule, namespace);
    const selection = getFilterSelection(sourceRule);

    let changed = false;
    const nextRules = rules.map((rule) => {
        const identity = getFilterIdentityKey(rule, namespace);
        if (identity !== sourceIdentity) {
            return rule;
        }
        if (!isRuleSelectionCompatible(sourceRule, rule)) {
            return rule;
        }
        const next = applyFilterSelection(rule, selection);
        if (next === rule) {
            return rule;
        }
        changed = true;
        return next;
    });

    return { rules: changed ? nextRules : rules, changed };
};

/**
 * 把来源规则的用户选择同步到同一个筛选器集合里的同字段规则。
 * 集合里没有该字段（或不兼容）时原样返回，不新建规则——筛选器定义归作者。
 */
export const applySelectionToFilters = (
    filters: DashboardFilters,
    sourceRule: DashboardFilterRule,
    namespace: FilterNamespace,
): { filters: DashboardFilters; changed: boolean } => {
    const dimensions = applySelectionToRuleList(
        filters.dimensions,
        sourceRule,
        namespace,
    );
    if (dimensions.changed) {
        return {
            filters: { ...filters, dimensions: dimensions.rules },
            changed: true,
        };
    }
    return { filters, changed: false };
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
        const result = applySelectionToFilters(
            filters,
            sourceRule,
            namespace,
        );
        if (result.changed) {
            next[tabUuid] = result.filters;
            changedTabUuids.push(tabUuid);
        }
    });

    return { tabFilters: changedTabUuids.length ? next : tabFilters, changedTabUuids };
};

/**
 * 记忆条目：用户的一次显式选择 + 指纹
 */
export type FilterMemoryEntry = {
    /** 指纹：字段身份 + 类目层级 + 父级字段 */
    fingerprint: string;
    operator: FilterOperator;
    values?: unknown[];
    settings?: unknown;
};

/**
 * 记忆指纹：字段身份 + 类目层级 + 父级字段 + 字段类型。
 *
 * 不包含 rule id（不同 Tab 的 id 不同）、不包含 operator / settings
 * （用户自己改操作符不应该让自己的记忆失效）。
 * 作者改了类目层级 / 父子绑定 / 字段类型 → 指纹变化 → 旧记忆自动失效。
 */
export const getFilterMemoryFingerprint = (
    rule: DashboardFilterRule,
    identityKey: string,
): string =>
    [
        identityKey,
        rule.categoryLevel ?? '',
        rule.parentFieldId ?? '',
        rule.target.fallbackType ?? '',
    ].join('|');

/**
 * 记忆条目能否套用到目标规则上
 */
export const isMemoryEntryApplicable = (
    rule: DashboardFilterRule,
    entry: FilterMemoryEntry,
): boolean => {
    if (rule.disabled) {
        return false;
    }
    if (rule.operator !== entry.operator) {
        return false;
    }
    if (hasUnitOfTime(rule.settings) !== hasUnitOfTime(entry.settings)) {
        return false;
    }
    if (hasDateRange(rule.settings) !== hasDateRange(entry.settings)) {
        return false;
    }
    return true;
};

/**
 * 收集筛选器集合里所有字段的身份，用于剪枝失效的记忆
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
 * 从本地记忆恢复选择：把记忆里的用户选择套回筛选器集合。
 *
 * 命中条件：指纹一致（作者没改过类目层级 / 父子绑定）+ 兼容性闸门通过。
 * 恢复出来的选择同时回填选择层（它是用户意图的权威副本）。
 */
export const restoreSelectionToFilters = (
    filters: DashboardFilters,
    entries: Record<string, FilterMemoryEntry>,
): {
    filters: DashboardFilters;
    restored: Record<string, FilterSelection>;
} => {
    const restored: Record<string, FilterSelection> = {};
    let changed = false;

    const restoreList = (
        rules: DashboardFilterRule[],
        namespace: FilterNamespace,
    ): DashboardFilterRule[] =>
        rules.map((rule) => {
            const identityKey = getFilterIdentityKey(rule, namespace);
            const entry = entries[identityKey];
            if (!entry) {
                return rule;
            }
            const fingerprint = getFilterMemoryFingerprint(rule, identityKey);
            if (entry.fingerprint !== fingerprint) {
                return rule;
            }
            if (!isMemoryEntryApplicable(rule, entry)) {
                return rule;
            }
            changed = true;
            restored[identityKey] = {
                operator: entry.operator,
                values: entry.values,
                settings: entry.settings,
            };
            return applyFilterSelection(rule, {
                operator: entry.operator,
                values: entry.values,
                settings: entry.settings,
            });
        });

    const dimensions = restoreList(filters.dimensions, 'dimension');
    const metrics = restoreList(filters.metrics, 'metric');
    const tableCalculations = restoreList(
        filters.tableCalculations,
        'tableCalculation',
    );

    if (!changed) {
        return { filters, restored };
    }

    return {
        filters: { ...filters, dimensions, metrics, tableCalculations },
        restored,
    };
};

/**
 * 在筛选器集合里按身份找规则
 */
export const findRuleByIdentity = (
    filters: DashboardFilters,
    identityKey: string,
    namespace: FilterNamespace,
): DashboardFilterRule | undefined => {
    const rules =
        namespace === 'dimension'
            ? filters.dimensions
            : namespace === 'metric'
              ? filters.metrics
              : filters.tableCalculations;
    return rules.find(
        (rule) => getFilterIdentityKey(rule, namespace) === identityKey,
    );
};

/**
 * 恢复作者默认值：把指定字段的规则恢复成服务端配置里的默认值。
 *
 * - 服务端有该字段的默认值 → 套用服务端的取值（各 Tab 用自己的默认值）
 * - 服务端没有（作者没配默认值）→ 清空取值，保留作者的 operator / settings
 * - 筛选器定义本身不动（规则还在，只是回到了作者配置的默认值）
 */
export const restoreAuthorDefaults = (
    filters: DashboardFilters,
    identityKeys: Set<string>,
    serverFilters: DashboardFilters | undefined,
): DashboardFilters => {
    let changed = false;

    const restoreList = (
        rules: DashboardFilterRule[],
        namespace: FilterNamespace,
    ): DashboardFilterRule[] => {
        let listChanged = false;
        const next = rules.map((rule) => {
            const identityKey = getFilterIdentityKey(rule, namespace);
            if (!identityKeys.has(identityKey)) {
                return rule;
            }
            const serverRule = serverFilters
                ? findRuleByIdentity(serverFilters, identityKey, namespace)
                : undefined;
            const restored = serverRule
                ? applyFilterSelection(rule, getFilterSelection(serverRule))
                : { ...rule, values: [] };
            if (restored === rule) {
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

/**
 * 收集筛选器集合里每个字段身份对应的定义指纹。
 *
 * 指纹 = 字段身份 + 类目层级 + 父级字段。
 * 作者改了定义（换字段 / 改类目层级 / 改父子绑定）后，指纹会变，
 * 旧记忆就不再对应当前定义。
 */
export const getFilterDefinitionFingerprints = (
    filters: DashboardFilters,
): Map<string, Set<string>> => {
    const result = new Map<string, Set<string>>();

    const collect = (
        rules: DashboardFilterRule[],
        namespace: FilterNamespace,
    ) => {
        rules.forEach((rule) => {
            const identityKey = getFilterIdentityKey(rule, namespace);
            const fingerprint = getFilterMemoryFingerprint(rule, identityKey);
            const existing = result.get(identityKey);
            if (existing) {
                existing.add(fingerprint);
            } else {
                result.set(identityKey, new Set([fingerprint]));
            }
        });
    };

    collect(filters.dimensions, 'dimension');
    collect(filters.metrics, 'metric');
    collect(filters.tableCalculations, 'tableCalculation');

    return result;
};

/**
 * 按筛选器定义剪枝记忆：
 * - 筛选器被作者删了 → 记忆条目丢弃
 * - 作者改了筛选器定义 → 旧指纹的记忆条目丢弃
 *
 * 这样记忆里只保留「还对应当前定义」的用户选择，
 * 看板升级 / 编辑模式大改之后不会把旧值套回新定义上。
 */
export const pruneSelectionsByDefinition = <
    T extends {
        global: Record<string, FilterMemoryEntry>;
        tab: Record<string, FilterMemoryEntry>;
    },
>(
    selections: T,
    valid: {
        global: Map<string, Set<string>>;
        tab: Map<string, Set<string>>;
    },
): T => {
    const prune = (
        source: Record<string, FilterMemoryEntry>,
        fingerprints: Map<string, Set<string>>,
    ): Record<string, FilterMemoryEntry> => {
        const next: Record<string, FilterMemoryEntry> = {};
        let changed = false;
        Object.entries(source).forEach(([key, entry]) => {
            const validFingerprints = fingerprints.get(key);
            if (validFingerprints?.has(entry.fingerprint)) {
                next[key] = entry;
            } else {
                changed = true;
            }
        });
        return changed ? next : source;
    };

    const global = prune(selections.global, valid.global);
    const tab = prune(selections.tab, valid.tab);
    if (global === selections.global && tab === selections.tab) {
        return selections;
    }
    return { ...selections, global, tab };
};

/**
 * 剪枝：服务端已经删掉的筛选器，其记忆条目要一并丢弃
 */
export const pruneSelections = <
    T,
    S extends { global: Record<string, T>; tab: Record<string, T> },
>(
    selections: S,
    validKeys: { global: Set<string>; tab: Set<string> },
): S => {
    const prune = (
        source: Record<string, T>,
        valid: Set<string>,
    ): Record<string, T> => {
        const next: Record<string, T> = {};
        let changed = false;
        Object.entries(source).forEach(([key, value]) => {
            if (valid.has(key)) {
                next[key] = value;
            } else {
                changed = true;
            }
        });
        return changed ? next : source;
    };

    const global = prune(selections.global, validKeys.global);
    const tab = prune(selections.tab, validKeys.tab);
    if (global === selections.global && tab === selections.tab) {
        return selections;
    }
    return { ...selections, global, tab } as S;
};

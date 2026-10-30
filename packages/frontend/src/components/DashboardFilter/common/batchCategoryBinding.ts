import { type DashboardFilterRule } from '@lightdash/common';

import {
    getCategoryLevelOf,
    getDeclaredCategoryLevel,
    type CategoryLevel,
} from '../../../utils/categoryLevel';
import { applyParentFilterRef, type ParentFilterRef } from './parentFilterRef';

/**
 * 批量绑定类目筛选器（父级关系）的纯计算逻辑。
 *
 * 与运行时 `findParentCategoryEntry` / `FilterSettings` 自动选父级的差异：
 * - 运行时：父级必须显式绑定；绑定失效按「同作用域 → 全局 → 任意」兜底
 * - 批量绑定：是一次「按当前配置重算父级关系」的动作：
 *   1. 精确层级优先：先找「上一级」（n-1）
 *   2. 同层级内 **当前 Tab 优先，其次全局**（全局二级 → Tab 三级）
 *   3. 上一级在整个候选范围都不存在时，向下找最近的更低层级
 *      （一级类目可能只配在全局、或某个 Tab 根本没配上一级）
 *   4. 同层级多候选：已绑定的 → 与子级同表的 → 配置顺序
 *   5. 已有绑定与新规则指向同一父级时不重写（旧数据无 scope 也视为同一父级）
 *   6. 找不到任何合法父级时保持原绑定，并在 UI 标记（不静默清空）
 *   7. 全局候选必须显式设置 categoryLevel：运行时只认显式层级，而本操作
 *      不改全局筛选器；否则绑定上去子级会在运行时被清空
 *   8. 选中子级时，依赖的 Tab 祖先层级会被一并补写（祖先本身可不勾选）
 */

export type CategoryBindingScope = 'global' | 'tab';

export type CategoryBindingCandidate = {
    rule: DashboardFilterRule;
    scope: CategoryBindingScope;
    tabUuid: string | null;
    /** 该候选的类目层级（显式配置 → cls 列名 → label 兜底） */
    level: CategoryLevel;
};

/**
 * 批量绑定无法处理的原因：
 * - parent-missing-level：存在更低层级的筛选器，但它没有显式 categoryLevel，
 *   无法在运行时作为父级（典型：全局一级只有 cls 列名）
 * - orphan-parent：原父级已失效，且候选范围里没有任何更低层级的筛选器
 */
export type CategoryBindingSkipReason =
    | 'parent-missing-level'
    | 'orphan-parent';

export type BatchCategoryBindingEntry = {
    filter: DashboardFilterRule;
    categoryLevel: CategoryLevel;
    /** 现有绑定能解析到的合法父级（null = 没有绑定 / 绑定已失效） */
    currentParent: CategoryBindingCandidate | null;
    /** 本次准备写入的父级（null = 不写父级：一级类目或没有候选） */
    resolvedParent: CategoryBindingCandidate | null;
    /** 同层级同作用域存在多个候选：按稳定顺序取一个，提示作者检查 */
    ambiguousParentCandidates: boolean;
    categoryLevelChanged: boolean;
    parentChanged: boolean;
    /** 没有可用父级且已有绑定：保持原绑定不变 */
    preserveExistingParent: boolean;
    skipReason: CategoryBindingSkipReason | null;
};

export type BatchCategoryBindingPlan = BatchCategoryBindingEntry[];

export type BatchCategoryBindingPlanParams = {
    /** 当前 Tab 的筛选器（批量绑定只写它们） */
    filters: DashboardFilterRule[];
    /** 全局筛选器：只能作为父级候选，不被本操作修改 */
    globalFilters: DashboardFilterRule[];
    /** 当前 Tab uuid（父级在同一个 Tab 时写入 parentTabUuid） */
    tabUuid: string | null;
};

export type BatchCategoryBindingUpdate = {
    categoryLevel: CategoryLevel;
    /** false = 保持现有父级字段（parentFieldId / parentScope / parentTabUuid）不动 */
    parentChanged: boolean;
    parentRef: ParentFilterRef | null;
};

/** 现有绑定的原始值（作用域可能未声明：旧数据只有 parentFieldId） */
type ParentBindingRef = {
    scope: CategoryBindingScope | null;
    tabUuid: string | null;
    fieldId: string;
};

const CHINESE_LEVEL_NUMERALS: Record<CategoryLevel, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
};

const LEVELS = [1, 2, 3, 4] as const;

/**
 * 仅用于批量绑定：字段 / 列名都推不出层级时，再看 label 文案。
 *
 * 老看板里存在「只把层级写进 label」的配置；批量绑定会把推导出的层级写回
 * `categoryLevel`，之后运行时只认显式层级 / 列名，不再依赖文案。
 *
 * 这里刻意保守：中文必须出现「X级类目」，英文必须出现「level N category」，
 * 避免把普通筛选器（例如 “Level 2 approval”）误判成类目。
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
 * 批量绑定可用的类目层级：
 * 显式配置 → cls 列名 → label 文案（前两步与运行时一致，label 仅批量绑定使用）
 */
export const getBindableCategoryLevel = (
    rule: DashboardFilterRule,
): CategoryLevel | null =>
    getCategoryLevelOf(rule) ?? getCategoryLevelFromLabel(rule);

const buildCandidates = (
    filters: DashboardFilterRule[],
    scope: CategoryBindingScope,
    tabUuid: string | null,
): CategoryBindingCandidate[] =>
    filters.flatMap((rule) => {
        const level = getBindableCategoryLevel(rule);
        if (level === null) return [];

        const declaredLevel = getDeclaredCategoryLevel(rule);
        // 全局筛选器不在本操作里修改，因此不能补写 categoryLevel。
        // 运行时 `isCategoryField` 只认显式层级：没有显式层级的全局类目不能当父级
        // （否则子级的 field/search 会因父级不是类目而断裂 → 子级被清空）。
        if (scope === 'global' && declaredLevel === null) return [];

        return [
            {
                rule,
                scope,
                tabUuid: scope === 'tab' ? tabUuid : null,
                level,
            },
        ];
    });

const getParentBindingRef = (
    filter: DashboardFilterRule,
): ParentBindingRef | null => {
    if (!filter.parentFieldId) return null;
    return {
        scope: filter.parentScope ?? null,
        tabUuid: filter.parentTabUuid ?? null,
        fieldId: filter.parentFieldId,
    };
};

/**
 * 两处父级绑定是否指向同一个父级。
 *
 * 旧数据只有 parentFieldId：作用域未知时只要字段相同就视为同一个，
 * 避免批量绑定把「没声明作用域」的绑定无意义地重写一遍。
 */
export const isSameParentBinding = (
    a: ParentBindingRef | null,
    b: ParentBindingRef | null,
): boolean => {
    if (!a || !b) return a === b;
    if (a.fieldId !== b.fieldId) return false;
    if (a.scope === null || b.scope === null) return true;
    if (a.scope !== b.scope) return false;
    if (a.scope === 'global') return true;
    return (a.tabUuid ?? null) === (b.tabUuid ?? null);
};

export const candidateToParentFilterRef = (
    candidate: CategoryBindingCandidate | null,
): ParentFilterRef | null =>
    candidate === null
        ? null
        : {
              scope: candidate.scope,
              tabUuid: candidate.scope === 'tab' ? candidate.tabUuid : null,
              fieldId: candidate.rule.target.fieldId,
          };

/**
 * 解析筛选器现有的父级绑定（必须能落到候选里，且层级严格低于自己）。
 * 解析顺序与运行时一致：显式作用域 → 当前 Tab → 全局。
 */
const findCurrentParent = (
    filter: DashboardFilterRule,
    categoryLevel: CategoryLevel,
    candidates: CategoryBindingCandidate[],
    childTabUuid: string | null,
): CategoryBindingCandidate | null => {
    const parentFieldId = filter.parentFieldId;
    if (!parentFieldId) return null;

    // 与运行时保持一致：只排除同一条规则（同 id），允许「同字段不同规则」
    const matches = candidates.filter(
        (candidate) =>
            candidate.rule.target.fieldId === parentFieldId &&
            candidate.rule.id !== filter.id &&
            candidate.level < categoryLevel,
    );
    if (matches.length === 0) return null;

    if (filter.parentScope === 'global') {
        const globalMatch = matches.find(
            (candidate) => candidate.scope === 'global',
        );
        if (globalMatch) return globalMatch;
    }
    if (filter.parentScope === 'tab') {
        const scopedTabMatch = matches.find(
            (candidate) =>
                candidate.scope === 'tab' &&
                (!filter.parentTabUuid ||
                    candidate.tabUuid === filter.parentTabUuid),
        );
        if (scopedTabMatch) return scopedTabMatch;
    }

    return (
        matches.find(
            (candidate) =>
                candidate.scope === 'tab' &&
                (childTabUuid === null || candidate.tabUuid === childTabUuid),
        ) ??
        matches.find((candidate) => candidate.scope === 'global') ??
        matches[0] ??
        null
    );
};

/**
 * 找新的父级：层级从 n-1 往下找最近的；同一层级内当前 Tab 优先，其次全局。
 *
 * 一级类目只配在全局时：Tab 二级 → 全局一级；
 * 上一级完全缺失时（例如只有三级 / 四级）：Tab 三级 → 更低层级里最近的候选。
 */
/**
 * 同层级多候选的稳定选择顺序：
 * 1. 作者当前已绑定的那个（避免一键批量化时无谓改掉手工选择）
 * 2. 与子级同一张表（Tab 父级不会被运行时跨 mart 重映射，同表最安全）
 * 3. 配置顺序
 */
const pickCandidate = (
    matches: CategoryBindingCandidate[],
    currentParent: CategoryBindingCandidate | null,
    filter: DashboardFilterRule,
): CategoryBindingCandidate =>
    matches.find((candidate) => candidate.rule.id === currentParent?.rule.id) ??
    matches.find(
        (candidate) =>
            candidate.rule.target.tableName === filter.target.tableName,
    ) ??
    matches[0];

const findNearestParentCandidate = (
    filter: DashboardFilterRule,
    categoryLevel: CategoryLevel,
    currentParent: CategoryBindingCandidate | null,
    tabCandidates: CategoryBindingCandidate[],
    globalCandidates: CategoryBindingCandidate[],
): { candidate: CategoryBindingCandidate; ambiguous: boolean } | null => {
    // 与运行时一致：只排除同一条规则自身，允许同字段的不同规则
    const isUsable = (candidate: CategoryBindingCandidate) =>
        candidate.rule.id !== filter.id;

    for (let level = categoryLevel - 1; level >= 1; level -= 1) {
        const targetLevel = level as CategoryLevel;
        const tabMatches = tabCandidates.filter(
            (candidate) =>
                candidate.level === targetLevel && isUsable(candidate),
        );
        if (tabMatches.length > 0) {
            return {
                candidate: pickCandidate(tabMatches, currentParent, filter),
                ambiguous: tabMatches.length > 1,
            };
        }

        const globalMatches = globalCandidates.filter(
            (candidate) =>
                candidate.level === targetLevel && isUsable(candidate),
        );
        if (globalMatches.length > 0) {
            return {
                candidate: pickCandidate(globalMatches, currentParent, filter),
                ambiguous: globalMatches.length > 1,
            };
        }
    }

    return null;
};

export const buildBatchCategoryBindingPlan = ({
    filters,
    globalFilters,
    tabUuid,
}: BatchCategoryBindingPlanParams): BatchCategoryBindingPlan => {
    const tabCandidates = buildCandidates(filters, 'tab', tabUuid);
    const globalCandidates = buildCandidates(globalFilters, 'global', null);
    const allCandidates = [...tabCandidates, ...globalCandidates];

    return filters.flatMap((filter) => {
        const categoryLevel = getBindableCategoryLevel(filter);
        if (categoryLevel === null) return [];

        const currentBinding = getParentBindingRef(filter);
        const currentParent = findCurrentParent(
            filter,
            categoryLevel,
            allCandidates,
            tabUuid,
        );

        let resolvedParent: CategoryBindingCandidate | null = null;
        let ambiguousParentCandidates = false;
        let preserveExistingParent = false;
        let skipReason: CategoryBindingSkipReason | null = null;

        if (categoryLevel === 1) {
            // 一级类目不存在上一级；历史遗留的父级绑定一律视为无效并清除
            resolvedParent = null;
        } else {
            const found = findNearestParentCandidate(
                filter,
                categoryLevel,
                currentParent,
                tabCandidates,
                globalCandidates,
            );
            if (found) {
                resolvedParent = found.candidate;
                ambiguousParentCandidates = found.ambiguous;
            } else {
                // 区分「本来就没有更低层级（本层就是根）」与「有更低层级但不可用」
                const hasLowerLevelFilter = [...filters, ...globalFilters].some(
                    (candidate) => {
                        if (candidate.id === filter.id) return false;
                        const level = getBindableCategoryLevel(candidate);
                        return level !== null && level < categoryLevel;
                    },
                );

                if (hasLowerLevelFilter) {
                    // 存在可选层级，但候选都不可用（例如全局筛选器没有显式层级）
                    preserveExistingParent = currentBinding !== null;
                    skipReason = 'parent-missing-level';
                } else if (currentBinding !== null) {
                    // 没有更低层级可绑定，但历史绑定指向了已删除 / 不可解析的父级
                    preserveExistingParent = true;
                    skipReason = 'orphan-parent';
                }
                // 否则：本层就是最高层级（或没有上级），无需绑定父级
            }
        }

        const resolvedBinding = candidateToParentFilterRef(resolvedParent);
        const parentChanged =
            !preserveExistingParent &&
            !isSameParentBinding(
                currentBinding,
                resolvedBinding === null
                    ? null
                    : {
                          scope: resolvedBinding.scope,
                          tabUuid: resolvedBinding.tabUuid,
                          fieldId: resolvedBinding.fieldId,
                      },
            );

        return [
            {
                filter,
                categoryLevel,
                currentParent,
                resolvedParent,
                ambiguousParentCandidates,
                categoryLevelChanged: filter.categoryLevel !== categoryLevel,
                parentChanged,
                preserveExistingParent,
                skipReason,
            },
        ];
    });
};

/** 该条是否真的会产生写入 */
export const isBatchCategoryBindingEntryActionable = (
    entry: BatchCategoryBindingEntry,
): boolean => entry.categoryLevelChanged || entry.parentChanged;

/**
 * 被选中的筛选器依赖、但本身未被选中的 Tab 父级。
 *
 * 运行时 `isCategoryField` 只认显式 `categoryLevel`：如果父级仅有 cls 列名 / label
 * 推导出的层级，子级绑定会因「父级不是类目筛选器」而断裂（子级被清空）。
 * 因此选中子级时，必须把祖先链上的层级一并规范化。
 */
export const getImplicitCategoryLevelEntries = (
    plan: BatchCategoryBindingPlan,
    selectedFilterIds: ReadonlySet<string>,
): BatchCategoryBindingEntry[] => {
    const entryById = new Map(
        plan.map((entry) => [entry.filter.id, entry] as const),
    );
    const implicit = new Map<string, BatchCategoryBindingEntry>();

    const isSelectedAndActionable = (entry: BatchCategoryBindingEntry) =>
        selectedFilterIds.has(entry.filter.id) &&
        isBatchCategoryBindingEntryActionable(entry);

    const walkAncestors = (entry: BatchCategoryBindingEntry) => {
        const visited = new Set<string>();
        // 选中的子级会写入重算后的父级；未选中的祖先保持它自己的存储绑定
        let parent = entry.resolvedParent;
        while (parent && parent.scope === 'tab') {
            const parentEntry = entryById.get(parent.rule.id);
            if (!parentEntry || visited.has(parentEntry.filter.id)) return;
            visited.add(parentEntry.filter.id);

            const parentSelected = isSelectedAndActionable(parentEntry);
            if (!parentSelected && parentEntry.categoryLevelChanged) {
                implicit.set(parentEntry.filter.id, parentEntry);
            }

            parent = parentSelected
                ? parentEntry.resolvedParent
                : parentEntry.currentParent;
        }
    };

    plan.forEach((entry) => {
        if (!selectedFilterIds.has(entry.filter.id)) return;
        if (!isBatchCategoryBindingEntryActionable(entry)) return;
        walkAncestors(entry);
    });

    return [...implicit.values()];
};

export const getBatchCategoryBindingUpdates = (
    plan: BatchCategoryBindingPlan,
    selectedFilterIds: ReadonlySet<string>,
): Map<string, BatchCategoryBindingUpdate> => {
    const updates = new Map<string, BatchCategoryBindingUpdate>();
    plan.forEach((entry) => {
        if (!selectedFilterIds.has(entry.filter.id)) return;
        // 勾选已正确绑定的行只是「确认建议」，不产生写入
        if (!isBatchCategoryBindingEntryActionable(entry)) return;
        updates.set(entry.filter.id, {
            categoryLevel: entry.categoryLevel,
            parentChanged: entry.parentChanged,
            parentRef: candidateToParentFilterRef(entry.resolvedParent),
        });
    });

    // 祖先层级只补写 categoryLevel，不隐式改写祖先的父级绑定
    getImplicitCategoryLevelEntries(plan, selectedFilterIds).forEach(
        (entry) => {
            if (!updates.has(entry.filter.id)) {
                updates.set(entry.filter.id, {
                    categoryLevel: entry.categoryLevel,
                    parentChanged: false,
                    parentRef: null,
                });
            }
        },
    );

    return updates;
};

/**
 * 应用批量绑定：未选中 / 无变化的筛选器保持原对象引用，方便上层做差量写回。
 */
export const applyBatchCategoryBindingPlan = (
    filters: DashboardFilterRule[],
    plan: BatchCategoryBindingPlan,
    selectedFilterIds: ReadonlySet<string>,
): DashboardFilterRule[] => {
    const updates = getBatchCategoryBindingUpdates(plan, selectedFilterIds);
    if (updates.size === 0) return filters;

    return filters.map((filter) => {
        const update = updates.get(filter.id);
        if (!update) return filter;

        const withLevel: DashboardFilterRule =
            filter.categoryLevel === update.categoryLevel
                ? filter
                : { ...filter, categoryLevel: update.categoryLevel };

        return update.parentChanged
            ? applyParentFilterRef(withLevel, update.parentRef)
            : withLevel;
    });
};

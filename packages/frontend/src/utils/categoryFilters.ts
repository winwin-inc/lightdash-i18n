import {
    type CategoryTreeNode,
    type DashboardFilterRule,
    type DashboardFilters,
    type FieldValueSearchResult,
    FilterOperator,
    type UserCategoryList,
} from '@lightdash/common';
import { lightdashApi } from '../api';

/**
 * 类目字段名映射
 */
export const CATEGORY_FIELD_NAMES = {
    LEVEL1: ['cls_1', 'cls1'],
    LEVEL2: ['cls_2', 'cls2'],
    LEVEL3: ['cls_3', 'cls3'],
    LEVEL4: ['cls_4', 'cls4'],
} as const;

/**
 * 从 DashboardFieldTarget 中提取字段名
 * fieldId 格式通常是 tableName_fieldName，如果没有下划线则返回 fieldId
 */
export const getFieldNameFromTarget = (
    target: DashboardFilterRule['target'],
): string => {
    // fieldId 格式通常是 tableName_fieldName
    const parts = target.fieldId.split('_');
    return parts.length > 1 ? parts[parts.length - 1] : target.fieldId;
};

type CategoryLevel = 1 | 2 | 3 | 4;

/**
 * 类型守卫：检查筛选器是否有 categoryLevel 属性
 */
type CategoryFilterRule = DashboardFilterRule & {
    categoryLevel: CategoryLevel;
};

const hasCategoryLevel = (
    filter: DashboardFilterRule,
): filter is CategoryFilterRule => {
    return (
        'categoryLevel' in filter &&
        filter.categoryLevel !== undefined &&
        typeof filter.categoryLevel === 'number' &&
        filter.categoryLevel >= 1 &&
        filter.categoryLevel <= 4
    );
};

/**
 * 检查筛选器是否是类目字段
 * 通过检查 filter.categoryLevel 属性来判断
 */
export const isCategoryField = (filter: DashboardFilterRule): boolean => {
    return hasCategoryLevel(filter);
};

/**
 * 获取筛选器对应的类目层级
 * 从 filter.categoryLevel 配置属性中读取
 */
export const getCategoryLevel = (
    filter: DashboardFilterRule,
): CategoryLevel | null => {
    if (hasCategoryLevel(filter)) {
        return filter.categoryLevel;
    }
    return null;
};

/**
 * 获取筛选器的父级筛选器字段ID
 * 从 filter.parentFieldId 配置属性中读取
 */
export const getParentFieldId = (
    filter: DashboardFilterRule,
): string | null => {
    return (
        (filter as DashboardFilterRule & { parentFieldId?: string })
            .parentFieldId || null
    );
};

/**
 * 根据父级筛选器字段ID查找父级筛选器
 */
export const findParentFilter = (
    filters: DashboardFilters,
    parentFieldId: string,
): DashboardFilterRule | null => {
    return (
        filters.dimensions.find(
            (filter) => filter.target.fieldId === parentFieldId,
        ) || null
    );
};

/**
 * 根据层级获取全部可用的类目
 */
const getCategoriesForLevel = (
    level: CategoryLevel,
    userCategories: UserCategoryList,
): CategoryTreeNode[] => {
    switch (level) {
        case 1:
            return userCategories.level1;
        case 2:
            return userCategories.level2;
        case 3:
            return userCategories.level3;
        case 4:
            return userCategories.level4;
        default:
            return [];
    }
};

/**
 * 获取筛选器对应的类目列表
 */
export const getCategoryListForFilter = (
    filter: DashboardFilterRule,
    userCategories: UserCategoryList,
): CategoryTreeNode[] => {
    const level = getCategoryLevel(filter);
    if (!level) return [];
    return getCategoriesForLevel(level, userCategories);
};

/**
 * 检查类目值是否在用户权限范围内
 */
const getCategoryName = (category: CategoryTreeNode): string | undefined =>
    category.name ? String(category.name) : undefined;

/**
 * 检查类目 label（name）是否在用户权限范围内
 * 使用 label（name）查询
 */
export const isCategoryLabelAllowed = (
    filter: DashboardFilterRule,
    categoryLabel: string,
    userCategories: UserCategoryList,
): boolean => {
    const categoryList = getCategoryListForFilter(filter, userCategories);
    return categoryList.some((cat) => getCategoryName(cat) === categoryLabel);
};

/**
 * 根据父级类目值过滤子级类目列表
 */
export const filterCategoriesByParent = (
    categories: CategoryTreeNode[],
    parentId: string,
): CategoryTreeNode[] => {
    return categories.filter((cat) => cat.parentId === parentId);
};

/**
 * 根据父级类目值获取子级类目
 */
export const getChildCategoriesForLevel = (
    parentCategoryId: string,
    userCategories: UserCategoryList,
    targetLevel: Exclude<CategoryLevel, 1>,
): CategoryTreeNode[] => {
    const targetCategories = getCategoriesForLevel(targetLevel, userCategories);
    return filterCategoriesByParent(targetCategories, parentCategoryId);
};

/**
 * 解析类目筛选器的值
 * 根据父级筛选器值获取子级类目列表
 * 如果父级筛选器值不在用户权限范围内，返回 undefined
 * 如果当前筛选器值在用户权限范围内，返回当前值
 * 如果当前筛选器值不在用户权限范围内，返回第一个可用类目
 */
const resolveCategoryFilterValue = ({
    filter,
    filters,
    userCategories,
    parentValueOverride,
}: ResolveCategoryValueArgs): string | undefined => {
    if (!isCategoryField(filter)) return undefined;

    const level = getCategoryLevel(filter);
    if (!level) return undefined;

    const parentFieldId = getParentFieldId(filter);
    let availableCategories: CategoryTreeNode[] = [];

    if (parentFieldId) {
        const parentFilter = findParentFilter(filters, parentFieldId);
        if (!parentFilter || !isCategoryField(parentFilter)) {
            return undefined;
        }

        const parentLabel =
            parentValueOverride !== undefined
                ? (parentValueOverride ?? undefined)
                : parentFilter.values && parentFilter.values.length > 0
                  ? String(parentFilter.values[0])
                  : undefined;

        if (!parentLabel) {
            return undefined;
        }

        const parentCategoryNode = getCategoryListForFilter(
            parentFilter,
            userCategories,
        ).find((cat) => getCategoryName(cat) === parentLabel);

        if (!parentCategoryNode) {
            return undefined;
        }

        availableCategories = getChildCategoriesForLevel(
            parentCategoryNode.categoryId,
            userCategories,
            level as Exclude<CategoryLevel, 1>,
        );
    } else {
        availableCategories = getCategoriesForLevel(level, userCategories);
    }

    const availableLabels = availableCategories
        .map((cat) => getCategoryName(cat))
        .filter((label): label is string => !!label);

    if (availableLabels.length === 0) {
        return undefined;
    }

    const currentValue =
        filter.values && filter.values.length > 0
            ? String(filter.values[0])
            : undefined;

    if (currentValue && availableLabels.includes(currentValue)) {
        return currentValue;
    }

    return availableLabels[0];
};

/**
 * 根据用户权限初始化单个类目筛选器的 values
 * 如果配置了父级筛选器，根据父级值获取子级类目列表；否则使用当前层级的所有类目
 * 如果当前值在类目列表中保持不变，否则选择第一个
 * 只有当 filter 有默认值配置（disabled === false）时才处理
 */
export const initializeCategoryFilterValuesByPermission = (
    filter: DashboardFilterRule,
    filters: DashboardFilters,
    userCategories: UserCategoryList,
): DashboardFilterRule | null => {
    if (!isCategoryField(filter) || filter.disabled) {
        return null;
    }

    const resolvedValue = resolveCategoryFilterValue({
        filter,
        filters,
        userCategories,
    });

    if (!resolvedValue) {
        return null;
    }

    const currentValue = filter.values?.[0];
    if (currentValue && String(currentValue) === resolvedValue) {
        return null;
    }

    return {
        ...filter,
        values: [resolvedValue],
        operator: FilterOperator.EQUALS,
    };
};

type ResolveCategoryValueArgs = {
    filter: DashboardFilterRule;
    filters: DashboardFilters;
    userCategories: UserCategoryList;
    parentValueOverride?: string | null;
};

/**
 * 处理类目筛选器联动
 * 当父级类目改变时，自动更新子级类目的可选值
 */
export const updateCategoryFilterCascade = (
    filters: DashboardFilters,
    changedFilter: DashboardFilterRule,
    newValue: string | null,
    userCategories: UserCategoryList,
): DashboardFilters => {
    if (!isCategoryField(changedFilter)) return filters;

    const cascadeChildren = (
        currentFilters: DashboardFilters,
        parentFieldId: string,
        parentValue: string | null,
    ): { filters: DashboardFilters; hasChanges: boolean } => {
        let updatedFilters = currentFilters;
        let hasChanges = false;

        currentFilters.dimensions.forEach((originalFilter) => {
            const filter =
                updatedFilters.dimensions.find(
                    (dimension) => dimension.id === originalFilter.id,
                ) ?? originalFilter;

            if (!isCategoryField(filter)) return;

            const filterParentFieldId = getParentFieldId(filter);
            if (!filterParentFieldId || filterParentFieldId !== parentFieldId)
                return;

            const resolvedValue = resolveCategoryFilterValue({
                filter,
                filters: updatedFilters,
                userCategories,
                parentValueOverride: parentValue,
            });

            const currentValue =
                filter.values && filter.values.length > 0
                    ? String(filter.values[0])
                    : undefined;

            if (resolvedValue !== currentValue) {
                hasChanges = true;

                const updatedFilter: DashboardFilterRule = {
                    ...filter,
                    values: resolvedValue ? [resolvedValue] : undefined,
                    operator: resolvedValue
                        ? FilterOperator.EQUALS
                        : filter.operator,
                };

                updatedFilters = {
                    ...updatedFilters,
                    dimensions: updatedFilters.dimensions.map((dimension) =>
                        dimension.id === filter.id ? updatedFilter : dimension,
                    ),
                };
            }

            const appliedFilter =
                updatedFilters.dimensions.find(
                    (dimension) => dimension.id === filter.id,
                ) ?? filter;

            const childValue =
                appliedFilter.values && appliedFilter.values.length > 0
                    ? String(appliedFilter.values[0])
                    : null;

            const childResult = cascadeChildren(
                updatedFilters,
                appliedFilter.target.fieldId,
                childValue,
            );

            if (childResult.hasChanges) {
                hasChanges = true;
                updatedFilters = childResult.filters;
            }
        });

        return { filters: updatedFilters, hasChanges };
    };

    const normalizedValue = newValue ? String(newValue) : null;

    const result = cascadeChildren(
        filters,
        changedFilter.target.fieldId,
        normalizedValue,
    );

    if (!result.hasChanges) {
        return filters;
    }

    return result.filters;
};

// ============================================================
// 异步版本：与 field/search 接口取交集
// ============================================================

const FIELD_SEARCH_CACHE_TTL_MS = 5000;

type FieldSearchCacheEntry = {
    expiresAt: number;
    promise: Promise<string[]>;
};

const fieldSearchCache = new Map<string, FieldSearchCacheEntry>();

const serializeFieldSearchFilters = (
    filters?: DashboardFilterRule[],
): string => {
    if (!filters || filters.length === 0) {
        return '[]';
    }

    return JSON.stringify(
        filters.map((filter) => ({
            target: { fieldId: filter.target.fieldId },
            operator: filter.operator,
            values: filter.values ?? null,
        })),
    );
};

const getFieldSearchCacheKey = (
    projectUuid: string,
    fieldId: string,
    tableName: string,
    filters?: DashboardFilterRule[],
): string =>
    JSON.stringify({
        projectUuid,
        fieldId,
        tableName,
        filters: serializeFieldSearchFilters(filters),
    });

/**
 * 调用 field/search 接口获取字段的实际可用值
 */
const fetchFieldSearchValues = async (
    projectUuid: string,
    fieldId: string,
    tableName: string,
    filters?: DashboardFilterRule[],
): Promise<string[]> => {
    const cacheKey = getFieldSearchCacheKey(
        projectUuid,
        fieldId,
        tableName,
        filters,
    );
    const now = Date.now();
    const cachedEntry = fieldSearchCache.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > now) {
        return cachedEntry.promise;
    }

    const requestPromise = (async () => {
        try {
            const filterGroup =
                filters && filters.length > 0
                    ? {
                          id: 'category_cascade_filter',
                          and: filters.map((f) => ({
                              id: f.id,
                              target: { fieldId: f.target.fieldId },
                              operator: f.operator,
                              values: f.values,
                          })),
                      }
                    : undefined;

            const result = await lightdashApi<FieldValueSearchResult>({
                url: `/projects/${projectUuid}/field/${fieldId}/search`,
                method: 'POST',
                body: JSON.stringify({
                    search: '',
                    limit: 1000,
                    table: tableName,
                    filters: filterGroup,
                    forceRefresh: false,
                }),
            });
            return result.results.filter(
                (v): v is string => typeof v === 'string',
            );
        } catch {
            fieldSearchCache.delete(cacheKey);
            // 请求失败时回退到不做交集过滤
            return [];
        }
    })();

    fieldSearchCache.set(cacheKey, {
        expiresAt: now + FIELD_SEARCH_CACHE_TTL_MS,
        promise: requestPromise,
    });

    return requestPromise;
};

/**
 * 异步解析类目筛选器的值
 * 先从 userCategories 获取权限范围内的候选值，
 * 再调 field/search 获取数据仓库中实际存在的值，取交集
 */
const resolveCategoryFilterValueAsync = async ({
    filter,
    filters,
    userCategories,
    projectUuid,
    parentValueOverride,
}: ResolveCategoryValueArgs & { projectUuid: string }): Promise<
    string | undefined
> => {
    if (!isCategoryField(filter)) return undefined;

    const level = getCategoryLevel(filter);
    if (!level) return undefined;

    const parentFieldId = getParentFieldId(filter);
    let availableCategories: CategoryTreeNode[] = [];

    // 收集上游已确定的筛选器，用于传给 field/search 做级联过滤
    const parentFilters: DashboardFilterRule[] = [];

    if (parentFieldId) {
        const parentFilter = findParentFilter(filters, parentFieldId);
        if (!parentFilter || !isCategoryField(parentFilter)) {
            return undefined;
        }

        const parentLabel =
            parentValueOverride !== undefined
                ? (parentValueOverride ?? undefined)
                : parentFilter.values && parentFilter.values.length > 0
                  ? String(parentFilter.values[0])
                  : undefined;

        if (!parentLabel) {
            return undefined;
        }

        // 把父级筛选器加入 parentFilters，让 field/search 做级联
        parentFilters.push({
            ...parentFilter,
            values: [parentLabel],
            operator: FilterOperator.EQUALS,
        });

        const parentCategoryNode = getCategoryListForFilter(
            parentFilter,
            userCategories,
        ).find((cat) => getCategoryName(cat) === parentLabel);

        if (!parentCategoryNode) {
            return undefined;
        }

        availableCategories = getChildCategoriesForLevel(
            parentCategoryNode.categoryId,
            userCategories,
            level as Exclude<CategoryLevel, 1>,
        );
    } else {
        availableCategories = getCategoriesForLevel(level, userCategories);
    }

    const categoryLabels = availableCategories
        .map((cat) => getCategoryName(cat))
        .filter((label): label is string => !!label);

    if (categoryLabels.length === 0) {
        return undefined;
    }

    // 调 field/search 获取数据仓库中实际存在的值
    const fieldValues = await fetchFieldSearchValues(
        projectUuid,
        filter.target.fieldId,
        filter.target.tableName,
        parentFilters.length > 0 ? parentFilters : undefined,
    );

    // 取交集：权限类目 ∩ 实际字段值
    let availableLabels: string[];
    if (fieldValues.length > 0) {
        const fieldValueSet = new Set(fieldValues);
        availableLabels = categoryLabels.filter((label) =>
            fieldValueSet.has(label),
        );
    } else {
        // field/search 返回空（可能请求失败），回退到仅用权限类目
        availableLabels = categoryLabels;
    }

    if (availableLabels.length === 0) {
        return undefined;
    }

    const currentValue =
        filter.values && filter.values.length > 0
            ? String(filter.values[0])
            : undefined;

    if (currentValue && availableLabels.includes(currentValue)) {
        return currentValue;
    }

    return availableLabels[0];
};

/**
 * 异步初始化类目筛选器
 * 按顺序处理每个类目筛选器（因为子级依赖父级的值）
 */
export const initializeCategoryFiltersAsync = async (
    filters: DashboardFilters,
    userCategories: UserCategoryList,
    projectUuid: string,
): Promise<DashboardFilters> => {
    let workingFilters = filters;
    let hasChanges = false;

    for (const filter of filters.dimensions) {
        if (!isCategoryField(filter) || filter.disabled) {
            continue;
        }

        const resolvedValue = await resolveCategoryFilterValueAsync({
            filter:
                workingFilters.dimensions.find((d) => d.id === filter.id) ??
                filter,
            filters: workingFilters,
            userCategories,
            projectUuid,
        });

        if (!resolvedValue) {
            continue;
        }

        const currentFilter =
            workingFilters.dimensions.find((d) => d.id === filter.id) ?? filter;
        const currentValue = currentFilter.values?.[0];
        if (currentValue && String(currentValue) === resolvedValue) {
            continue;
        }

        hasChanges = true;
        const updatedFilter: DashboardFilterRule = {
            ...currentFilter,
            values: [resolvedValue],
            operator: FilterOperator.EQUALS,
        };

        workingFilters = {
            ...workingFilters,
            dimensions: workingFilters.dimensions.map((d) =>
                d.id === filter.id ? updatedFilter : d,
            ),
        };
    }

    if (!hasChanges) return filters;
    return workingFilters;
};

/**
 * 异步处理类目筛选器联动
 * 当父级类目改变时，自动更新子级类目的可选值（与 field/search 取交集）
 */
export const updateCategoryFilterCascadeAsync = async (
    filters: DashboardFilters,
    changedFilter: DashboardFilterRule,
    newValue: string | null,
    userCategories: UserCategoryList,
    projectUuid: string,
): Promise<DashboardFilters> => {
    if (!isCategoryField(changedFilter)) return filters;

    const cascadeChildren = async (
        currentFilters: DashboardFilters,
        parentFieldId: string,
        parentValue: string | null,
    ): Promise<{ filters: DashboardFilters; hasChanges: boolean }> => {
        let updatedFilters = currentFilters;
        let hasChanges = false;

        for (const originalFilter of currentFilters.dimensions) {
            const filter =
                updatedFilters.dimensions.find(
                    (d) => d.id === originalFilter.id,
                ) ?? originalFilter;

            if (!isCategoryField(filter)) continue;

            const filterParentFieldId = getParentFieldId(filter);
            if (!filterParentFieldId || filterParentFieldId !== parentFieldId)
                continue;

            // 没有配置默认值的 filter 不需要联动赋值，保持为空/无限制
            if (filter.disabled) continue;

            const resolvedValue = await resolveCategoryFilterValueAsync({
                filter,
                filters: updatedFilters,
                userCategories,
                projectUuid,
                parentValueOverride: parentValue,
            });

            const currentValue =
                filter.values && filter.values.length > 0
                    ? String(filter.values[0])
                    : undefined;

            if (resolvedValue !== currentValue) {
                hasChanges = true;

                const updatedFilter: DashboardFilterRule = {
                    ...filter,
                    values: resolvedValue ? [resolvedValue] : undefined,
                    operator: resolvedValue
                        ? FilterOperator.EQUALS
                        : filter.operator,
                };

                updatedFilters = {
                    ...updatedFilters,
                    dimensions: updatedFilters.dimensions.map((d) =>
                        d.id === filter.id ? updatedFilter : d,
                    ),
                };
            }

            const appliedFilter =
                updatedFilters.dimensions.find((d) => d.id === filter.id) ??
                filter;

            const childValue =
                appliedFilter.values && appliedFilter.values.length > 0
                    ? String(appliedFilter.values[0])
                    : null;

            const childResult = await cascadeChildren(
                updatedFilters,
                appliedFilter.target.fieldId,
                childValue,
            );

            if (childResult.hasChanges) {
                hasChanges = true;
                updatedFilters = childResult.filters;
            }
        }

        return { filters: updatedFilters, hasChanges };
    };

    const normalizedValue = newValue ? String(newValue) : null;

    const result = await cascadeChildren(
        filters,
        changedFilter.target.fieldId,
        normalizedValue,
    );

    if (!result.hasChanges) {
        return filters;
    }

    return result.filters;
};

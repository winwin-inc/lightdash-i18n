import {
    type CategoryTreeNode,
    type DashboardFilterRule,
    type DashboardFilters,
    FilterOperator,
    type UserCategoryList,
} from '@lightdash/common';

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
                ? parentValueOverride ?? undefined
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

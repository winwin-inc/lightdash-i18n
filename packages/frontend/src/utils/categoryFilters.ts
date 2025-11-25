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
export const isCategoryValueAllowed = (
    filter: DashboardFilterRule,
    categoryValue: string,
    userCategories: UserCategoryList,
): boolean => {
    const categoryList = getCategoryListForFilter(filter, userCategories);
    return categoryList.some((cat) => cat.categoryId === categoryValue);
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
 * 初始化类目筛选器
 * 根据用户权限设置默认值，并过滤掉不在权限范围内的值
 */
export const initializeCategoryFilters = (
    filters: DashboardFilters,
    userCategories: UserCategoryList,
): DashboardFilters => {
    const resolvedSelections = new Map<CategoryLevel, string>();

    const getExistingValidValueForLevel = (
        level: CategoryLevel,
    ): string | undefined => {
        const filter = filters.dimensions.find(
            (item) => getCategoryLevel(item) === level,
        );
        if (!filter || !filter.values) return undefined;
        const validValue = filter.values.find((value) =>
            isCategoryValueAllowed(filter, String(value), userCategories),
        );
        return validValue ? String(validValue) : undefined;
    };

    const computeDefaultForLevel = (
        level: CategoryLevel,
    ): string | null => {
        const existingSelection =
            resolvedSelections.get(level) ||
            getExistingValidValueForLevel(level);
        if (existingSelection) {
            resolvedSelections.set(level, existingSelection);
            return existingSelection;
        }

        if (level === 1) {
            const firstLevel1 =
                getCategoriesForLevel(1, userCategories)[0]?.categoryId;
            if (firstLevel1) {
                resolvedSelections.set(1, firstLevel1);
                return firstLevel1;
            }
            return null;
        }

        const parentLevel = (level - 1) as CategoryLevel;
        const parentSelection =
            resolvedSelections.get(parentLevel) ||
            computeDefaultForLevel(parentLevel);

        if (!parentSelection) return null;

        const childCategories = getChildCategoriesForLevel(
            parentSelection,
            userCategories,
            level as Exclude<CategoryLevel, 1>,
        );
        const firstChild = childCategories[0]?.categoryId ?? null;
        if (firstChild) {
            resolvedSelections.set(level, firstChild);
        }
        return firstChild;
    };

    const updatedDimensions = filters.dimensions.map((filter) => {
        // 检查是否是类目筛选器（通过 categoryLevel 配置）
        if (!isCategoryField(filter)) {
            return filter;
        }

        const level = getCategoryLevel(filter);
        if (!level) return filter;

        const validValues = filter.values?.filter((value) =>
            isCategoryValueAllowed(filter, String(value), userCategories),
        );
        const firstValidValue =
            validValues && validValues.length > 0 ? String(validValues[0]) : null;

        if (firstValidValue) {
            resolvedSelections.set(level, firstValidValue);
            if (validValues.length !== filter.values?.length) {
                return {
                    ...filter,
                    values: validValues,
                };
            }
            return filter;
        }

        const defaultValue = computeDefaultForLevel(level);
        if (defaultValue) {
            resolvedSelections.set(level, defaultValue);
            return {
                ...filter,
                values: [defaultValue],
                operator: FilterOperator.EQUALS,
            };
        }

        return {
            ...filter,
            values: undefined,
        };
    });

    return {
        ...filters,
        dimensions: updatedDimensions,
    };
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
    const changedLevel = getCategoryLevel(changedFilter);
    if (!changedLevel) return filters;

    const updatedDimensions = filters.dimensions.map((filter) => {
        // 检查是否是类目筛选器
        if (!isCategoryField(filter)) {
            return filter;
        }

        const filterLevel = getCategoryLevel(filter);
        if (!filterLevel) return filter;

        // 如果是子级类目，且父级类目已改变，需要更新
        if (filterLevel > changedLevel) {
            if (newValue) {
                // 根据新的父级值过滤子级类目
                const childCategories = getChildCategoriesForLevel(
                    newValue,
                    userCategories,
                    filterLevel as Exclude<CategoryLevel, 1>,
                );

                // 检查当前值是否在新的子级列表中
                const currentValue = filter.values?.[0];
                const isValidChild =
                    currentValue &&
                    childCategories.some(
                        (cat) => cat.categoryId === currentValue,
                    );

                if (isValidChild) {
                    // 值仍然有效，保持不变
                    return filter;
                } else {
                    // 值无效，设置为第一个可用的子级类目
                    return {
                        ...filter,
                        values:
                            childCategories.length > 0
                                ? [childCategories[0].categoryId]
                                : undefined,
                    };
                }
            } else {
                // 父级值被清空，清空子级值
                return {
                    ...filter,
                    values: undefined,
                };
            }
        }

        return filter;
    });

    return {
        ...filters,
        dimensions: updatedDimensions,
    };
};

import {
    type DashboardFilterRule,
    type DashboardFilters,
    type FieldValueSearchResult,
    FilterOperator,
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
 * 筛选器列表是否包含至少一个类目筛选器
 */
export const hasCategoryFilters = (filters: DashboardFilters): boolean =>
    filters.dimensions.some((filter) => isCategoryField(filter));

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

export type DashboardFilterContext = {
    dashboardSlug?: string;
    dashboardName?: string;
};

const FIELD_SEARCH_CACHE_TTL_MS = 5000;

type FieldSearchCacheEntry = {
    expiresAt: number;
    promise: Promise<string[]>;
};

const fieldSearchCache = new Map<string, FieldSearchCacheEntry>();

/** 清除 field/search 内存缓存（仅测试使用） */
export const clearFieldSearchCacheForTests = (): void => {
    fieldSearchCache.clear();
};

const pruneExpiredFieldSearchCache = (now: number): void => {
    for (const [key, entry] of fieldSearchCache.entries()) {
        if (entry.expiresAt <= now) {
            fieldSearchCache.delete(key);
        }
    }
};

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
    filters: DashboardFilterRule[] | undefined,
    dashboardContext: DashboardFilterContext | undefined,
): string =>
    JSON.stringify({
        projectUuid,
        fieldId,
        tableName,
        filters: serializeFieldSearchFilters(filters),
        dashboardSlug: dashboardContext?.dashboardSlug ?? null,
        dashboardName: dashboardContext?.dashboardName ?? null,
    });

/**
 * 类目初始化签名：仅包含真实 field/search 依赖。
 * collectFieldSearchFilters 会发送「目标类目左侧」的筛选，因此保留截至最后一个类目的 dimension 前缀；
 * 最后一个类目之后的筛选不可能参与查询，排除以免误触发 init。
 */
export const getCategoryFiltersSignature = (
    filters: DashboardFilters,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
): string => {
    let lastCategoryIndex = -1;
    filters.dimensions.forEach((filter, index) => {
        if (isCategoryField(filter)) {
            lastCategoryIndex = index;
        }
    });

    const relevantDimensions =
        lastCategoryIndex === -1
            ? []
            : filters.dimensions.slice(0, lastCategoryIndex + 1);

    return JSON.stringify({
        projectUuid,
        dashboardSlug: dashboardContext?.dashboardSlug ?? null,
        dashboardName: dashboardContext?.dashboardName ?? null,
        dimensions: relevantDimensions.map((filter) => ({
            id: filter.id,
            fieldId: filter.target.fieldId,
            tableName: filter.target.tableName,
            operator: filter.operator,
            values: filter.values ?? null,
            disabled: filter.disabled ?? false,
            categoryLevel: filter.categoryLevel ?? null,
            parentFieldId: filter.parentFieldId ?? null,
        })),
    });
};

/**
 * 调用 field/search 接口获取字段的实际可用值（含看板上下文以触发 dbt sql_filter）
 */
const fetchFieldSearchValues = async (
    projectUuid: string,
    fieldId: string,
    tableName: string,
    filters: DashboardFilterRule[] | undefined,
    dashboardContext: DashboardFilterContext | undefined,
): Promise<string[]> => {
    const now = Date.now();
    pruneExpiredFieldSearchCache(now);

    const cacheKey = getFieldSearchCacheKey(
        projectUuid,
        fieldId,
        tableName,
        filters,
        dashboardContext,
    );
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
                    dashboardSlug: dashboardContext?.dashboardSlug,
                    dashboardName: dashboardContext?.dashboardName,
                }),
            });
            return result.results.filter(
                (v): v is string => typeof v === 'string',
            );
        } catch {
            fieldSearchCache.delete(cacheKey);
            return [];
        }
    })();

    fieldSearchCache.set(cacheKey, {
        expiresAt: now + FIELD_SEARCH_CACHE_TTL_MS,
        promise: requestPromise,
    });

    return requestPromise;
};

type ResolveCategoryValueArgs = {
    filter: DashboardFilterRule;
    filters: DashboardFilters;
    projectUuid: string;
    dashboardContext?: DashboardFilterContext;
    parentValueOverride?: string | null;
};

/**
 * 收集 field/search 级联条件：目标筛选器左侧已有值的规则（对齐下拉 getAutocompleteFilterGroup），
 * 并对父级类目应用 override。
 */
const collectFieldSearchFilters = (
    filters: DashboardFilters,
    filter: DashboardFilterRule,
    parentValueOverride?: string | null,
): DashboardFilterRule[] | undefined => {
    const currentIndex = filters.dimensions.findIndex(
        (dimension) => dimension.id === filter.id,
    );
    const leftFilters = (
        currentIndex === -1
            ? filters.dimensions
            : filters.dimensions.slice(0, currentIndex)
    ).filter(
        (dimension) =>
            dimension.values !== undefined && dimension.values.length > 0,
    );

    const parentFieldId = getParentFieldId(filter);
    if (!parentFieldId) {
        return leftFilters.length > 0 ? leftFilters : undefined;
    }

    const parentFilter = findParentFilter(filters, parentFieldId);
    if (!parentFilter || !isCategoryField(parentFilter)) {
        return undefined;
    }

    // parentValueOverride === null 表示用户清空了父级
    // parentValueOverride === undefined 表示首次加载，用父级当前值
    // parentValueOverride 有具体值表示用户切换了父级
    const parentLabel =
        parentValueOverride !== undefined
            ? parentValueOverride
            : parentFilter.values?.[0]
              ? String(parentFilter.values[0])
              : undefined;

    if (!parentLabel) {
        return undefined;
    }

    const parentRule: DashboardFilterRule = {
        ...parentFilter,
        values: [parentLabel],
        operator: FilterOperator.EQUALS,
    };

    const withoutParent = leftFilters.filter(
        (dimension) => dimension.target.fieldId !== parentFieldId,
    );
    return [...withoutParent, parentRule];
};

/**
 * 按仓库实际类目解析筛选器值（field/search + 左侧筛选 + 父级 + dashboardSlug）
 */
const resolveCategoryFilterValueAsync = async ({
    filter,
    filters,
    projectUuid,
    dashboardContext,
    parentValueOverride,
}: ResolveCategoryValueArgs): Promise<string | undefined> => {
    if (!isCategoryField(filter)) return undefined;

    const searchFilters = collectFieldSearchFilters(
        filters,
        filter,
        parentValueOverride,
    );
    // 配置了父级但父级无值时，collect 返回 undefined，不解析
    if (
        getParentFieldId(filter) &&
        searchFilters === undefined
    ) {
        return undefined;
    }

    const fieldValues = await fetchFieldSearchValues(
        projectUuid,
        filter.target.fieldId,
        filter.target.tableName,
        searchFilters,
        dashboardContext,
    );

    if (fieldValues.length === 0) {
        return undefined;
    }

    const currentValue =
        filter.values && filter.values.length > 0
            ? String(filter.values[0])
            : undefined;

    if (currentValue && fieldValues.includes(currentValue)) {
        return currentValue;
    }

    return fieldValues[0];
};

/**
 * 异步初始化类目筛选器：当前值在实际数据中则保留，否则取第一个有效值
 */
export const initializeCategoryFiltersAsync = async (
    filters: DashboardFilters,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
): Promise<DashboardFilters> => {
    let workingFilters = filters;
    let hasChanges = false;

    for (const filter of filters.dimensions) {
        if (!isCategoryField(filter) || filter.disabled) {
            continue;
        }

        const currentFilter =
            workingFilters.dimensions.find((d) => d.id === filter.id) ?? filter;

        // 如果用户手动修改过 operator（如 NOT_NULL, NULL），保留用户的设置
        if (currentFilter.operator !== FilterOperator.EQUALS) {
            continue;
        }

        const resolvedValue = await resolveCategoryFilterValueAsync({
            filter: currentFilter,
            filters: workingFilters,
            projectUuid,
            dashboardContext,
        });

        if (!resolvedValue) {
            continue;
        }

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
 * 异步处理类目筛选器联动：父改子时按 field/search 实际类目纠正选中值
 */
export const updateCategoryFilterCascadeAsync = async (
    filters: DashboardFilters,
    changedFilter: DashboardFilterRule,
    newValue: string | null,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
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

            // 如果 operator 不是默认的 EQUALS，说明用户手动修改过，保留用户的设置
            if (filter.operator !== FilterOperator.EQUALS) {
                continue;
            }

            const resolvedValue = await resolveCategoryFilterValueAsync({
                filter,
                filters: updatedFilters,
                projectUuid,
                dashboardContext,
                parentValueOverride: parentValue,
            });

            if (!resolvedValue) {
                continue;
            }

            const currentValue =
                filter.values && filter.values.length > 0
                    ? String(filter.values[0])
                    : undefined;

            if (currentValue && currentValue === resolvedValue) {
                // 当前值仍有效，继续向下级联
            } else {
                hasChanges = true;

                const updatedFilter: DashboardFilterRule = {
                    ...filter,
                    values: [resolvedValue],
                    operator: FilterOperator.EQUALS,
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

import { type DashboardFilterRule, type DashboardFilters } from '@lightdash/common';
import {
    getCategoryFiltersSignature,
    getParentFieldId,
    hasCategoryFilters,
    isCategoryField,
    type DashboardFilterContext,
} from './categoryFilters';

export type CategoryInitDecision =
    | { action: 'skip-ready' }
    | { action: 'skip-already-processed' }
    | { action: 'none' }
    | { action: 'start'; signature: string };

/** Tab 类目级联期间的即时展示态（已提交 tabFilters 不变，图表仍用旧筛选） */
export type TabCategoryDisplayState = {
    filters: DashboardFilters;
    updatingFilterIds: string[];
};

/**
 * 收集某类目字段下全部子孙类目筛选器 id（用于标记「更新中」）。
 */
export const getDescendantCategoryFilterIds = (
    filters: DashboardFilters,
    parentFieldId: string,
): string[] => {
    const ids: string[] = [];

    const collect = (fieldId: string) => {
        filters.dimensions.forEach((filter) => {
            if (!isCategoryField(filter)) return;
            if (getParentFieldId(filter) !== fieldId) return;
            ids.push(filter.id);
            collect(filter.target.fieldId);
        });
    };

    collect(parentFieldId);
    return ids;
};

/**
 * 用户选择类目后的乐观展示：立即写入当前级新值，子孙标记为更新中。
 */
export const buildOptimisticCategoryDisplayState = (
    filters: DashboardFilters,
    changedFilter: DashboardFilterRule,
    index: number,
): TabCategoryDisplayState => {
    const nextFilters: DashboardFilters = {
        ...filters,
        dimensions: filters.dimensions.map((filter, filterIndex) =>
            filterIndex === index ? changedFilter : filter,
        ),
    };

    return {
        filters: nextFilters,
        updatingFilterIds: getDescendantCategoryFilterIds(
            nextFilters,
            changedFilter.target.fieldId,
        ),
    };
};

/**
 * 在已有展示态上合并一次 dimension 更新（快速连选 / pending 期间改普通筛选）。
 */
export const mergeDimensionIntoDisplayState = (
    displayFilters: DashboardFilters,
    item: DashboardFilterRule,
    index: number,
): TabCategoryDisplayState => {
    const nextFilters: DashboardFilters = {
        ...displayFilters,
        dimensions: displayFilters.dimensions.map((filter, filterIndex) =>
            filterIndex === index ? item : filter,
        ),
    };

    if (!isCategoryField(item)) {
        // 普通筛选变更：保留原更新中标记范围（所有类目子孙仍可能受 left-filter 影响）
        // 由调用方决定是否整树重新 init；此处不新增 updating ids
        return {
            filters: nextFilters,
            updatingFilterIds: [],
        };
    }

    return {
        filters: nextFilters,
        updatingFilterIds: getDescendantCategoryFilterIds(
            nextFilters,
            item.target.fieldId,
        ),
    };
};

/**
 * 相同签名已有 pending 任务时不再启动第二条（不 bump generation）。
 */
export const shouldStartCategoryInitTask = ({
    decision,
    pendingSignature,
}: {
    decision: CategoryInitDecision;
    pendingSignature: string | null | undefined;
}): boolean => {
    if (decision.action !== 'start') {
        return false;
    }
    return pendingSignature !== decision.signature;
};

/**
 * 决定是否需要对一组筛选发起类目初始化（全局或单个 Tab）
 */
export const decideCategoryInit = ({
    canApplyCategoryFilters,
    filters,
    projectUuid,
    dashboardContext,
    processedSignature,
}: {
    canApplyCategoryFilters: boolean;
    filters: DashboardFilters;
    projectUuid: string | undefined;
    dashboardContext?: DashboardFilterContext;
    processedSignature: string | null | undefined;
}): CategoryInitDecision => {
    if (!canApplyCategoryFilters || !projectUuid) {
        return { action: 'skip-ready' };
    }

    if (!hasCategoryFilters(filters)) {
        return { action: 'skip-ready' };
    }

    const signature = getCategoryFiltersSignature(
        filters,
        projectUuid,
        dashboardContext,
    );

    if (processedSignature === signature) {
        return { action: 'skip-already-processed' };
    }

    return { action: 'start', signature };
};

/**
 * 异步结果是否允许写回：generation 匹配，且当前筛选仍为请求起点签名
 * （用户中途改过筛选则丢弃旧结果，由新一轮 init 处理）
 */
export const shouldApplyCategoryInitResult = ({
    requestGeneration,
    currentGeneration,
    requestSignature,
    currentFilters,
    projectUuid,
    dashboardContext,
}: {
    requestGeneration: number;
    currentGeneration: number;
    requestSignature: string;
    currentFilters: DashboardFilters;
    projectUuid: string;
    dashboardContext?: DashboardFilterContext;
}): boolean => {
    if (requestGeneration !== currentGeneration) {
        return false;
    }

    const currentSignature = getCategoryFiltersSignature(
        currentFilters,
        projectUuid,
        dashboardContext,
    );

    return currentSignature === requestSignature;
};

/**
 * 只解析当前 Tab。未选中 Tab 不进入初始化，已处理签名不重复请求。
 */
export const resolveActiveTabCategoryInit = ({
    tabFilters,
    activeTabUuid,
    canApplyCategoryFilters,
    projectUuid,
    dashboardContext,
    processedSignatures,
}: {
    tabFilters: Record<string, DashboardFilters>;
    activeTabUuid: string | undefined;
    canApplyCategoryFilters: boolean;
    projectUuid: string | undefined;
    dashboardContext?: DashboardFilterContext;
    processedSignatures: Record<string, string | undefined>;
}): CategoryInitDecision => {
    if (!activeTabUuid || !tabFilters[activeTabUuid]) {
        return { action: 'none' };
    }

    return decideCategoryInit({
        canApplyCategoryFilters,
        filters: tabFilters[activeTabUuid],
        projectUuid,
        dashboardContext,
        processedSignature: processedSignatures[activeTabUuid],
    });
};

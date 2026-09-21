import { type DashboardFilters } from '@lightdash/common';
import {
    getCategoryFiltersSignature,
    hasCategoryFilters,
    type DashboardFilterContext,
} from './categoryFilters';

export type CategoryInitDecision =
    | { action: 'skip-ready' }
    | { action: 'skip-already-processed' }
    | { action: 'none' }
    | { action: 'start'; signature: string };

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

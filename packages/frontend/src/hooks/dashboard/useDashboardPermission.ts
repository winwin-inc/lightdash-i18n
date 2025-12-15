import { type UserCategoryList } from '@lightdash/common';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

import { useProject } from '../useProject';
import { useUserCategories } from '../useUserCategories';

/**
 * 检查用户是否有看板权限
 * 如果用户没有权限（user-category表没有dashboard配置），返回false
 */
export const hasDashboardPermission = (
    userCategories: UserCategoryList | undefined,
    isCustomerUse: boolean,
): boolean => {
    // 如果不是 customer use 模式，默认有权限
    if (!isCustomerUse) {
        return true;
    }

    // 如果 userCategories 未加载，暂时返回 true（等待加载完成）
    if (!userCategories) {
        return true;
    }

    // 检查是否有任何类目配置
    const hasAnyCategory =
        userCategories.level1.length > 0 ||
        userCategories.level2.length > 0 ||
        userCategories.level3.length > 0 ||
        userCategories.level4.length > 0;

    return hasAnyCategory;
};

/**
 * Hook: 检查看板权限，如果没有权限则跳转到无权限页面
 * @param projectUuid 项目UUID
 * @param dashboardUuid 可选的看板UUID，用于检查特定看板的权限
 * @param redirectPath 无权限时跳转的路径
 */
export const useDashboardPermissionCheck = (
    projectUuid: string | undefined,
    dashboardUuid?: string,
    redirectPath: string = '/no-dashboard-access',
) => {
    const navigate = useNavigate();
    const { data: project } = useProject(projectUuid);
    const isCustomerUse = project?.isCustomerUse ?? false;

    const { data: userCategories, isInitialLoading } = useUserCategories({
        dashboardUuid, // 如果提供了 dashboardUuid，会检查特定看板的权限
        useQueryOptions: {
            enabled: !!projectUuid && isCustomerUse,
        },
    });

    useEffect(() => {
        // 等待数据加载完成
        if (isInitialLoading) {
            return;
        }

        // 如果不是 customer use 模式，不需要检查
        if (!isCustomerUse) {
            return;
        }

        // 检查权限
        const hasPermission = hasDashboardPermission(
            userCategories,
            isCustomerUse,
        );

        if (!hasPermission) {
            navigate(redirectPath, { replace: true });
        }
    }, [
        isCustomerUse,
        userCategories,
        isInitialLoading,
        navigate,
        redirectPath,
    ]);

    return {
        hasPermission: hasDashboardPermission(userCategories, isCustomerUse),
        isChecking: isInitialLoading,
    };
};


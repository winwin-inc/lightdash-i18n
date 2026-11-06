import {
    ForbiddenError,
    type ViewerContentScope,
    type ViewerContentScopeResolver,
    type ViewerContentScopeUser,
} from '@lightdash/common';

/**
 * Resolve the visible content scope of a user in a project.
 * `undefined` means the client-use allow-list does not apply to this user
 * (project is not client-use, or the role is not restricted) and no extra
 * restriction has to be applied.
 */
export const getViewerContentScope = async (
    resolver: ViewerContentScopeResolver | undefined,
    user: ViewerContentScopeUser | undefined,
    projectUuid: string,
): Promise<ViewerContentScope | undefined> => {
    if (resolver === undefined || user === undefined) {
        return undefined;
    }
    return resolver.getViewerContentScope(user, projectUuid);
};

/**
 * Narrow an account user to a scope user.
 * Anonymous / embed users have no user uuid, so the client-use allow-list
 * (which is based on the user mobile number) cannot be resolved for them.
 */
export const toViewerContentScopeUser = (
    user: { userUuid?: string; email?: string | undefined } | undefined,
): ViewerContentScopeUser | undefined => {
    if (user === undefined || user.userUuid === undefined) {
        return undefined;
    }
    return { userUuid: user.userUuid, email: user.email };
};

/**
 * Fail-closed check for a saved chart (dbt chart or SQL chart).
 * In client-use projects, only the charts mounted on an allow-listed dashboard
 * can be read or executed.
 */
export const assertChartInViewerContentScope = async (
    resolver: ViewerContentScopeResolver | undefined,
    user: ViewerContentScopeUser | undefined,
    projectUuid: string,
    chartUuid: string,
): Promise<void> => {
    const scope = await getViewerContentScope(resolver, user, projectUuid);
    if (scope === undefined) {
        return;
    }
    if (!scope.chartUuids.includes(chartUuid)) {
        throw new ForbiddenError(
            "You don't have access to this chart in this project",
        );
    }
};

/**
 * Fail-closed check for a dashboard.
 * In client-use projects, only the allow-listed dashboards can be read.
 */
export const assertDashboardInViewerContentScope = async (
    resolver: ViewerContentScopeResolver | undefined,
    user: ViewerContentScopeUser | undefined,
    projectUuid: string,
    dashboardUuid: string,
): Promise<void> => {
    const scope = await getViewerContentScope(resolver, user, projectUuid);
    if (scope === undefined) {
        return;
    }
    if (!scope.dashboardUuids.includes(dashboardUuid)) {
        throw new ForbiddenError(
            "You don't have access to this dashboard in this project",
        );
    }
};

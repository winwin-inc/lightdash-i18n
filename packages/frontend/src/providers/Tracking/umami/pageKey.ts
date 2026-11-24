/**
 * 路径 → 页面事件属性（纯函数，不发请求）。
 *
 * 码值约定见 docs/ops/umami-analytics.md §4.4：page/route 一律英文码值，
 * route 是模板路径（uuid 段替换成 :projectUuid 等），绝不携带 uuid。
 */

export type UmamiPageEvent = {
    page: string;
    route: string;
    project_id: string | null;
    dashboard_id: string | null;
    chart_id: string | null;
    space_id: string | null;
    settings_section: string | null;
    is_embed: boolean;
};

type PageEventOverrides = Partial<
    Pick<
        UmamiPageEvent,
        | 'project_id'
        | 'dashboard_id'
        | 'chart_id'
        | 'space_id'
        | 'settings_section'
        | 'is_embed'
    >
>;

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const splitSegments = (pathname: string): string[] =>
    pathname.split('/').filter((segment) => segment.length > 0);

/** 兜底模板：uuid 形态的段替换成 :id，保证 route 永不带 uuid */
const templatePath = (segments: string[]): string => {
    if (segments.length === 0) return '/';
    const templated = segments.map((segment) =>
        UUID_PATTERN.test(segment) ? ':id' : segment,
    );
    return `/${templated.join('/')}`;
};

const makeEvent = (page: string, route: string, overrides: PageEventOverrides = {}): UmamiPageEvent => ({
    page,
    route,
    project_id: overrides.project_id ?? null,
    dashboard_id: overrides.dashboard_id ?? null,
    chart_id: overrides.chart_id ?? null,
    space_id: overrides.space_id ?? null,
    settings_section: overrides.settings_section ?? null,
    is_embed: overrides.is_embed ?? false,
});

const PROJECT_ROUTE = '/projects/:projectUuid';

const NAMED_PAGES = [
    'login',
    'register',
    'signup',
    'verify-email',
    'password-recovery',
    'password-reset',
    'join-organization',
] as const;

/**
 * 按顺序匹配（先长后短：`/dashboards/:d` 先于 `/dashboards`）。
 * 前端只发 URL 里能拿到的 id；explore 的 tableId 不外发。
 */
export const toPageEvent = (pathname: string): UmamiPageEvent => {
    const segments = splitSegments(pathname);
    const head = segments[0];

    // embed / minimal（uuid 一律模板化，is_embed=true）
    if (head === 'embed') {
        return makeEvent('embed', templatePath(segments), { is_embed: true });
    }
    if (head === 'minimal') {
        return makeEvent('minimal', templatePath(segments), { is_embed: true });
    }

    // /projects/:projectUuid/... 项目域
    if (head === 'projects' && segments.length >= 2) {
        const projectId = segments[1];
        const rest = segments.slice(2);
        const section = rest[0];

        if (section === undefined) {
            return makeEvent('project_home', PROJECT_ROUTE, {
                project_id: projectId,
            });
        }
        if (section === 'home') {
            return makeEvent('project_home', `${PROJECT_ROUTE}/home`, {
                project_id: projectId,
            });
        }
        if (section === 'user-activity' || section === 'unused-content') {
            return makeEvent('usage_insights', `${PROJECT_ROUTE}/${section}`, {
                project_id: projectId,
            });
        }
        if (section === 'dashboards') {
            const dashboardId = rest[1];
            if (dashboardId !== undefined && dashboardId.length > 0) {
                return makeEvent(
                    'dashboard',
                    `${PROJECT_ROUTE}/dashboards/:dashboardUuid`,
                    { project_id: projectId, dashboard_id: dashboardId },
                );
            }
            return makeEvent('dashboard_list', `${PROJECT_ROUTE}/dashboards`, {
                project_id: projectId,
            });
        }
        if (section === 'saved') {
            const chartId = rest[1];
            if (chartId !== undefined && chartId.length > 0) {
                return makeEvent('chart', `${PROJECT_ROUTE}/saved/:savedQueryUuid`, {
                    project_id: projectId,
                    chart_id: chartId,
                });
            }
            return makeEvent('chart_list', `${PROJECT_ROUTE}/saved`, {
                project_id: projectId,
            });
        }
        if (section === 'spaces') {
            const spaceId = rest[1];
            if (spaceId !== undefined && spaceId.length > 0) {
                return makeEvent('space', `${PROJECT_ROUTE}/spaces/:spaceUuid`, {
                    project_id: projectId,
                    space_id: spaceId,
                });
            }
            return makeEvent('space_list', `${PROJECT_ROUTE}/spaces`, {
                project_id: projectId,
            });
        }
        if (section === 'tables') {
            const tableId = rest[1];
            if (tableId !== undefined && tableId.length > 0) {
                // explore 不发 tableId（表名属 PII 边界内但口径上不外发）
                return makeEvent('explore', `${PROJECT_ROUTE}/tables/:tableId`, {
                    project_id: projectId,
                });
            }
            return makeEvent('explore_list', `${PROJECT_ROUTE}/tables`, {
                project_id: projectId,
            });
        }
        if (section === 'sqlRunner' || section === 'sql-runner') {
            return makeEvent('sql_runner', `${PROJECT_ROUTE}/sql-runner`, {
                project_id: projectId,
            });
        }
        if (section === 'metrics') {
            return makeEvent('metrics_catalog', `${PROJECT_ROUTE}/metrics`, {
                project_id: projectId,
            });
        }
        if (section === 'catalog') {
            return makeEvent('catalog', `${PROJECT_ROUTE}/catalog`, {
                project_id: projectId,
            });
        }
        if (section === 'apps') {
            return makeEvent('data_apps', `${PROJECT_ROUTE}/apps`, {
                project_id: projectId,
            });
        }
        // 项目下未穷举的路径（如 ai-agents）：project_id 仍带上
        return makeEvent('other', templatePath(segments), {
            project_id: projectId,
        });
    }

    // /generalSettings/** → settings + 第二段路径
    if (head === 'generalSettings') {
        const settingsSection = segments.length >= 2 ? segments[1] : null;
        return makeEvent(
            'settings',
            settingsSection === null
                ? '/generalSettings'
                : '/generalSettings/:section',
            { settings_section: settingsSection },
        );
    }

    // /createProject/** 与 /createProjectSettings/**（含 uuid 的段不进 route）
    if (head !== undefined && head.startsWith('createProject')) {
        return makeEvent('create_project', `/${head}`);
    }

    // 同名页
    if (head !== undefined && (NAMED_PAGES as readonly string[]).includes(head)) {
        return makeEvent(head, `/${head}`);
    }

    // /share/:nanoid
    if (head === 'share' && segments.length >= 2) {
        return makeEvent('share', '/share/:shareNanoid');
    }

    // 无权访问页
    if (
        head === 'no-access' ||
        head === 'no-project-access' ||
        head === 'no-dashboard-access'
    ) {
        return makeEvent('forbidden', `/${head}`);
    }

    // 其余
    return makeEvent('other', templatePath(segments));
};

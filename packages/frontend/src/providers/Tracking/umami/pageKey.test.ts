import { describe, expect, it } from 'vitest';
import { toPageEvent } from './pageKey';

const P = '11111111-2222-4333-8444-555566667777';
const D = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000';
const C = 'c0000000-0000-4000-8000-000000000001';
const S = 's0000000-0000-4000-8000-000000000002';
const NANOID = 'V1StGXR8_Z5jdHi6B-myT';

type Row = {
    name: string;
    pathname: string;
    page: string;
    route: string;
    project_id?: string;
    dashboard_id?: string;
    chart_id?: string;
    space_id?: string;
    settings_section?: string;
    is_embed?: boolean;
};

const rows: Row[] = [
    // dashboard（先长后短：带 id 的先于列表页）
    {
        name: 'dashboard detail',
        pathname: `/projects/${P}/dashboards/${D}`,
        page: 'dashboard',
        route: '/projects/:projectUuid/dashboards/:dashboardUuid',
        project_id: P,
        dashboard_id: D,
    },
    {
        name: 'dashboard detail subpath (view/tabs)',
        pathname: `/projects/${P}/dashboards/${D}/view/tabs/t1`,
        page: 'dashboard',
        route: '/projects/:projectUuid/dashboards/:dashboardUuid',
        project_id: P,
        dashboard_id: D,
    },
    {
        name: 'dashboard list',
        pathname: `/projects/${P}/dashboards`,
        page: 'dashboard_list',
        route: '/projects/:projectUuid/dashboards',
        project_id: P,
    },
    // chart
    {
        name: 'chart detail',
        pathname: `/projects/${P}/saved/${C}`,
        page: 'chart',
        route: '/projects/:projectUuid/saved/:savedQueryUuid',
        project_id: P,
        chart_id: C,
    },
    {
        name: 'chart detail subpath (history)',
        pathname: `/projects/${P}/saved/${C}/history`,
        page: 'chart',
        route: '/projects/:projectUuid/saved/:savedQueryUuid',
        project_id: P,
        chart_id: C,
    },
    {
        name: 'chart list',
        pathname: `/projects/${P}/saved`,
        page: 'chart_list',
        route: '/projects/:projectUuid/saved',
        project_id: P,
    },
    // space
    {
        name: 'space detail',
        pathname: `/projects/${P}/spaces/${S}`,
        page: 'space',
        route: '/projects/:projectUuid/spaces/:spaceUuid',
        project_id: P,
        space_id: S,
    },
    {
        name: 'space list',
        pathname: `/projects/${P}/spaces`,
        page: 'space_list',
        route: '/projects/:projectUuid/spaces',
        project_id: P,
    },
    // explore（不发 tableId）
    {
        name: 'explore (tableId not emitted)',
        pathname: `/projects/${P}/tables/some_table_id`,
        page: 'explore',
        route: '/projects/:projectUuid/tables/:tableId',
        project_id: P,
    },
    {
        name: 'explore list',
        pathname: `/projects/${P}/tables`,
        page: 'explore_list',
        route: '/projects/:projectUuid/tables',
        project_id: P,
    },
    // sql runner
    {
        name: 'sql runner (camelCase legacy path)',
        pathname: `/projects/${P}/sqlRunner`,
        page: 'sql_runner',
        route: '/projects/:projectUuid/sql-runner',
        project_id: P,
    },
    {
        name: 'sql runner',
        pathname: `/projects/${P}/sql-runner`,
        page: 'sql_runner',
        route: '/projects/:projectUuid/sql-runner',
        project_id: P,
    },
    {
        name: 'sql runner with slug',
        pathname: `/projects/${P}/sql-runner/abc123`,
        page: 'sql_runner',
        route: '/projects/:projectUuid/sql-runner',
        project_id: P,
    },
    // metrics / catalog / apps
    {
        name: 'metrics catalog',
        pathname: `/projects/${P}/metrics`,
        page: 'metrics_catalog',
        route: '/projects/:projectUuid/metrics',
        project_id: P,
    },
    {
        name: 'metrics catalog subpath (peek)',
        pathname: `/projects/${P}/metrics/peek/tbl/metric_name`,
        page: 'metrics_catalog',
        route: '/projects/:projectUuid/metrics',
        project_id: P,
    },
    {
        name: 'catalog',
        pathname: `/projects/${P}/catalog`,
        page: 'catalog',
        route: '/projects/:projectUuid/catalog',
        project_id: P,
    },
    {
        name: 'data apps list',
        pathname: `/projects/${P}/apps`,
        page: 'data_apps',
        route: '/projects/:projectUuid/apps',
        project_id: P,
    },
    {
        name: 'data apps detail',
        pathname: `/projects/${P}/apps/${C}/view`,
        page: 'data_apps',
        route: '/projects/:projectUuid/apps',
        project_id: P,
    },
    // project home / usage insights
    {
        name: 'project root',
        pathname: `/projects/${P}`,
        page: 'project_home',
        route: '/projects/:projectUuid',
        project_id: P,
    },
    {
        name: 'project home',
        pathname: `/projects/${P}/home`,
        page: 'project_home',
        route: '/projects/:projectUuid/home',
        project_id: P,
    },
    {
        name: 'user activity',
        pathname: `/projects/${P}/user-activity`,
        page: 'usage_insights',
        route: '/projects/:projectUuid/user-activity',
        project_id: P,
    },
    {
        name: 'unused content',
        pathname: `/projects/${P}/unused-content`,
        page: 'usage_insights',
        route: '/projects/:projectUuid/unused-content',
        project_id: P,
    },
    // settings
    {
        name: 'settings with section',
        pathname: '/generalSettings/organization',
        page: 'settings',
        route: '/generalSettings/:section',
        settings_section: 'organization',
    },
    {
        name: 'settings userManagement',
        pathname: '/generalSettings/userManagement',
        page: 'settings',
        route: '/generalSettings/:section',
        settings_section: 'userManagement',
    },
    {
        name: 'settings personalAccessTokens',
        pathname: '/generalSettings/personalAccessTokens',
        page: 'settings',
        route: '/generalSettings/:section',
        settings_section: 'personalAccessTokens',
    },
    {
        name: 'settings root (no section)',
        pathname: '/generalSettings',
        page: 'settings',
        route: '/generalSettings',
    },
    // create project
    {
        name: 'create project',
        pathname: '/createProject',
        page: 'create_project',
        route: '/createProject',
    },
    {
        name: 'create project with method',
        pathname: '/createProject/dbt',
        page: 'create_project',
        route: '/createProject',
    },
    {
        name: 'create project settings (uuid must not leak into route)',
        pathname: `/createProjectSettings/${P}`,
        page: 'create_project',
        route: '/createProjectSettings',
    },
    // named pages
    { name: 'login', pathname: '/login', page: 'login', route: '/login' },
    { name: 'register', pathname: '/register', page: 'register', route: '/register' },
    { name: 'signup', pathname: '/signup', page: 'signup', route: '/signup' },
    {
        name: 'verify-email',
        pathname: '/verify-email',
        page: 'verify-email',
        route: '/verify-email',
    },
    {
        name: 'password-recovery',
        pathname: '/password-recovery',
        page: 'password-recovery',
        route: '/password-recovery',
    },
    {
        name: 'password-reset',
        pathname: '/password-reset/code123',
        page: 'password-reset',
        route: '/password-reset',
    },
    {
        name: 'join-organization',
        pathname: '/join-organization',
        page: 'join-organization',
        route: '/join-organization',
    },
    // share
    {
        name: 'share link (nanoid not in route)',
        pathname: `/share/${NANOID}`,
        page: 'share',
        route: '/share/:shareNanoid',
    },
    // embed / minimal
    {
        name: 'embed',
        pathname: `/embed/${P}`,
        page: 'embed',
        route: '/embed/:id',
        is_embed: true,
    },
    {
        name: 'minimal dashboard (uuid templated)',
        pathname: `/minimal/projects/${P}/dashboards/${D}`,
        page: 'minimal',
        route: '/minimal/projects/:id/dashboards/:id',
        is_embed: true,
    },
    // forbidden
    { name: 'no-access', pathname: '/no-access', page: 'forbidden', route: '/no-access' },
    {
        name: 'no-project-access',
        pathname: '/no-project-access',
        page: 'forbidden',
        route: '/no-project-access',
    },
    {
        name: 'no-dashboard-access',
        pathname: '/no-dashboard-access',
        page: 'forbidden',
        route: '/no-dashboard-access',
    },
    // other
    { name: 'root path', pathname: '/', page: 'other', route: '/' },
    {
        name: 'unknown path',
        pathname: '/whatever/xyz',
        page: 'other',
        route: '/whatever/xyz',
    },
    {
        name: 'projects without project uuid',
        pathname: '/projects',
        page: 'other',
        route: '/projects',
    },
    {
        name: 'unlisted project subpath keeps project_id',
        pathname: `/projects/${P}/ai-agents`,
        page: 'other',
        route: '/projects/:id/ai-agents',
        project_id: P,
    },
];

describe('toPageEvent', () => {
    it.each(rows)(
        '$name → page=$page',
        ({
            pathname,
            page,
            route,
            project_id,
            dashboard_id,
            chart_id,
            space_id,
            settings_section,
            is_embed,
        }) => {
            const event = toPageEvent(pathname);
            expect(event.page).toBe(page);
            expect(event.route).toBe(route);
            expect(event.project_id).toBe(project_id ?? null);
            expect(event.dashboard_id).toBe(dashboard_id ?? null);
            expect(event.chart_id).toBe(chart_id ?? null);
            expect(event.space_id).toBe(space_id ?? null);
            expect(event.settings_section).toBe(settings_section ?? null);
            expect(event.is_embed).toBe(is_embed ?? false);
        },
    );

    it('route 永不携带 uuid', () => {
        const uuids = [P, D, C, S];
        const samples = [
            `/projects/${P}/dashboards/${D}/view`,
            `/projects/${P}/saved/${C}/history`,
            `/projects/${P}/spaces/${S}`,
            `/projects/${P}`,
            `/createProjectSettings/${P}`,
            `/minimal/projects/${P}/dashboards/${D}`,
            `/embed/${P}`,
        ];
        samples.forEach((pathname) => {
            const { route } = toPageEvent(pathname);
            uuids.forEach((uuid) => expect(route).not.toContain(uuid));
            expect(route).not.toMatch(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
            );
        });
    });

    // 凭据类路由：reset-password 的 code、invite 的 inviteCode 是 nanoid(30)，
    // 不是 uuid；写进埋点等于把可改密码的凭证泄漏出去（review P0-1）
    const CREDENTIALS: Array<[string, string, string]> = [
        ['/reset-password/' + NANOID + 'X'.repeat(10), 'password-reset', '/reset-password/:code'],
        ['/invite/' + NANOID, 'join-organization', '/invite/:inviteCode'],
        ['/recover-password', 'recover-password', '/recover-password'],
        ['/share/' + NANOID, 'share', '/share/:shareNanoid'],
    ];

    it.each(CREDENTIALS)('凭据段模板化：%s', (pathname, page, route) => {
        const event = toPageEvent(pathname);
        expect(event.page).toBe(page);
        expect(event.route).toBe(route);
        expect(event.route).not.toContain(NANOID);
    });

    it('未知长 token 段也被模板化，避免新增路由再漏', () => {
        const token = 'A'.repeat(30);
        const { route } = toPageEvent(`/some-new-page/${token}`);
        expect(route).toBe('/some-new-page/:id');
        expect(route).not.toContain(token);
    });
});

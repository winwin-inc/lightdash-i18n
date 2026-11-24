import { mapLightdashEvent, UmamiMappingContext } from './mapping';

const ctx: UmamiMappingContext = {
    client: 'web',
    path: '/api/v1/dashboard/123',
    environment: 'production',
};

describe('mapLightdashEvent', () => {
    it('maps a whitelisted event with trimmed snake_case properties', () => {
        const result = mapLightdashEvent(
            {
                event: 'dashboard.view',
                userId: 'user-1',
                properties: {
                    dashboardId: 'dash-1',
                    projectId: 'proj-1',
                    organizationId: 'org-1',
                    parametersCount: 3,
                    // 以下不在白名单，必须被丢弃
                    filtersCount: 9,
                    tilesCount: 5,
                },
            },
            ctx,
        );
        expect(result).not.toBeNull();
        expect(result?.event).toBe('dashboard_view');
        expect(result?.distinctId).toBe('user-1');
        expect(result?.properties).toEqual({
            dashboard_id: 'dash-1',
            project_id: 'proj-1',
            org_id: 'org-1',
            parameters_count: 3,
            client: 'web',
            app_version: expect.any(String),
            env: 'production',
        });
    });

    it('returns null for unknown events (strict whitelist)', () => {
        expect(
            mapLightdashEvent(
                { event: 'space.created', userId: 'u', properties: {} },
                ctx,
            ),
        ).toBeNull();
    });

    it('covers every whitelisted backend event', () => {
        const expected: Array<[string, string]> = [
            ['dashboard.view', 'dashboard_view'],
            ['saved_chart.view', 'chart_view'],
            ['sql_chart.view', 'sql_chart_view'],
            ['query.executed', 'query_executed'],
            ['query.error', 'query_error'],
            ['download_results.started', 'download_started'],
            ['download_results.completed', 'download_completed'],
            ['mcp_tool_call', 'mcp_tool_call'],
            ['user.logged_in', 'user_logged_in'],
            ['permission.updated', 'permission_updated'],
            ['project.deleted', 'project_deleted'],
            ['organization.deleted', 'organization_deleted'],
            ['user.deleted', 'user_deleted'],
            ['personal_access_token.created', 'pat_created'],
            ['share_url.created', 'share_link_created'],
            ['dbt_cloud_integration.deleted', 'dbt_cloud_integration_deleted'],
        ];
        for (const [rudderEvent, umamiEvent] of expected) {
            const result = mapLightdashEvent(
                { event: rudderEvent, userId: 'u', properties: {} },
                ctx,
            );
            expect(result?.event).toBe(umamiEvent);
        }
    });

    it('resolves distinct_id via the fallback chain', () => {
        expect(
            mapLightdashEvent(
                { event: 'query.error', properties: { projectId: 'p' } },
                { ...ctx, userUuid: 'als-user' },
            )?.distinctId,
        ).toBe('als-user');
        expect(
            mapLightdashEvent(
                {
                    event: 'query.error',
                    properties: { userId: 'prop-user' },
                },
                { ...ctx, userUuid: 'als-user' },
            )?.distinctId,
        ).toBe('prop-user');
        expect(
            mapLightdashEvent(
                {
                    event: 'personal_access_token.created',
                    properties: { createdUserId: 'c1' },
                },
                ctx,
            )?.distinctId,
        ).toBe('c1');
        expect(
            mapLightdashEvent(
                { event: 'dbt_cloud_integration.deleted', properties: {} },
                { client: 'scheduler', path: '', environment: 'prod' },
            )?.distinctId,
        ).toBe('server');
    });

    it('passes through optional view fields (P3 upstream additions)', () => {
        const result = mapLightdashEvent(
            {
                event: 'dashboard.view',
                userId: 'u',
                properties: {
                    dashboardId: 'd1',
                    dashboardSlug: 'rev-slot',
                    dashboardName: '营收看板',
                    spaceUuid: 's1',
                    spaceName: '增长空间',
                },
            },
            ctx,
        );
        expect(result?.properties).toMatchObject({
            dashboard_slug: 'rev-slot',
            dashboard_name: '营收看板',
            space_id: 's1',
            space_name: '增长空间',
        });
    });

    it('passes through chart view fields and drops non-scalar values', () => {
        const result = mapLightdashEvent(
            {
                event: 'sql_chart.view',
                userId: 'u',
                properties: {
                    chartId: 'c1',
                    chartSlug: 'daily-gmv',
                    chartName: '每日 GMV',
                    chartKind: 'cartesian',
                    // 非标量必须丢弃
                    someArray: ['a'],
                },
            },
            ctx,
        );
        expect(result?.properties).toMatchObject({
            chart_id: 'c1',
            chart_slug: 'daily-gmv',
            chart_name: '每日 GMV',
            chart_kind: 'cartesian',
        });
        expect(result?.properties.someArray).toBeUndefined();
    });

    it('defaults client to unknown when ctx.client is empty', () => {
        const result = mapLightdashEvent(
            { event: 'user.logged_in', properties: {} },
            { client: '', path: '', environment: 'dev' },
        );
        expect(result?.properties.client).toBe('unknown');
    });

    it('maps mcp_tool_call mcp_client and org_id', () => {
        const result = mapLightdashEvent(
            {
                event: 'mcp_tool_call',
                userId: 'u1',
                properties: {
                    organizationId: 'org-1',
                    toolName: 'find_explores',
                    mcpClient: 'msy-x-cli',
                    authType: 'pat',
                    durationMs: 42,
                    success: true,
                },
            },
            { client: 'mcp', path: '/api/v1/mcp', environment: 'production' },
        );
        expect(result?.event).toBe('mcp_tool_call');
        expect(result?.properties).toMatchObject({
            org_id: 'org-1',
            tool_name: 'find_explores',
            mcp_client: 'msy-x-cli',
            auth_type: 'pat',
            duration_ms: 42,
            success: true,
            client: 'mcp',
        });
    });
});

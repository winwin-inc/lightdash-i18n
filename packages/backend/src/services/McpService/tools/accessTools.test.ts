import { AnyType, ForbiddenError } from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { registerAccessTools } from './accessTools';
import { McpToolDeps } from './deps';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

type RegisteredTool = {
    name: string;
    config: { description?: string; inputSchema?: AnyType };
    handler: (args: AnyType, context: McpToolContext) => Promise<AnyType>;
};

const buildRegistry = () => {
    const registered: RegisteredTool[] = [];
    const registry = {
        register: jest.fn(
            (
                name: string,
                config: RegisteredTool['config'],
                handler: RegisteredTool['handler'],
            ) => {
                registered.push({ name, config, handler });
            },
        ),
    };
    return { registry: registry as unknown as McpToolRegistry, registered };
};

const buildDeps = ({
    projects,
    clientUse = undefined,
}: {
    projects: { projectUuid: string; name: string }[];
    /** clientUse 诊断（ViewerContentScopeDiagnostics），缺省 = 取不到 */
    clientUse?: AnyType;
}) => {
    const getAllByOrganizationUuid = jest.fn().mockResolvedValue(projects);
    const lightdashConfig = {
        mcp: {
            dashboardStrict: false,
            dashboardContact: '请联系客服开通看板访问权限。',
        },
    } as AnyType;
    const getAllExploresSummary = jest.fn().mockResolvedValue([
        { name: 'orders', label: 'Orders', groupLabel: null },
    ]);
    const getAllExploreSummaries = jest.fn().mockResolvedValue([
        { name: 'orders', label: 'Orders', groupLabel: null },
        { name: 'users', label: 'Users', groupLabel: null },
    ]);
    const getCatalog = jest.fn().mockResolvedValue({
        data: [
            {
                name: 'orders',
                label: 'Orders',
                groupLabel: null,
                type: 'table',
            },
        ],
    });
    const getViewerContentScopeDiagnostics = jest
        .fn()
        .mockResolvedValue(clientUse);

    const deps = {
        lightdashConfig,
        projectModel: {
            getAllByOrganizationUuid,
            getAllExploreSummaries,
        },
        projectService: {
            getAllExploresSummary,
        },
        catalogService: {
            getCatalog,
        },
        dashboardService: {
            getViewerContentScopeDiagnostics,
        },
    } as unknown as McpToolDeps;

    return {
        deps,
        getAllByOrganizationUuid,
        getAllExploresSummary,
        getAllExploreSummaries,
        getCatalog,
        getViewerContentScopeDiagnostics,
    };
};

const buildContext = ({
    visibleProjectUuids,
}: {
    visibleProjectUuids: string[];
}): McpToolContext => {
    const ability = {
        can: jest.fn((_action: string, subjectInstance: AnyType) =>
            visibleProjectUuids.includes(subjectInstance?.projectUuid),
        ),
    };

    return {
        user: {
            userUuid: 'user-uuid',
            email: 'demo@lightdash.com',
            firstName: 'Demo',
            lastName: 'User',
            organizationUuid: 'org-uuid',
            organizationName: 'Demo org',
            role: 'member',
            ability,
            abilityRules: [{ action: 'view', subject: 'Explore' }],
        } as unknown as McpToolContext['user'],
        account: { user: { ability } } as unknown as McpToolContext['account'],
        ability: ability as unknown as McpToolContext['ability'],
        organizationUuid: 'org-uuid',
        authType: 'pat' as McpToolContext['authType'],
        scopes: [],
    };
};

const parseResult = (result: AnyType) =>
    JSON.parse(result.content[0].text as string);

describe('registerAccessTools', () => {
    it('registers the get_my_access tool', () => {
        const { registry, registered } = buildRegistry();
        registerAccessTools(registry, buildDeps({ projects: [] }).deps);

        expect(registered).toHaveLength(1);
        expect(registered[0].name).toEqual(McpToolName.GET_MY_ACCESS);
        expect(registered[0].name).toEqual('get_my_access');
        expect(registered[0].config.description).toBeDefined();
    });

    it('derives the organisation capabilities from the ability rules', async () => {
        const { registry, registered } = buildRegistry();
        const { deps } = buildDeps({
            projects: [{ projectUuid: 'project-uuid', name: 'Demo project' }],
        });
        registerAccessTools(registry, deps);

        const context = buildContext({
            visibleProjectUuids: ['project-uuid'],
        });
        const result = parseResult(
            await registered[0].handler({ includeExplores: false }, context),
        );

        expect(result.organization.capabilities).toEqual({
            browseContent: false,
            runSavedChart: false,
            runMetricQuery: true,
            exportDashboardCode: false,
        });
        expect(result.email).toEqual('demo@lightdash.com');
        expect(result.organization.role).toEqual('member');
        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].projectUuid).toEqual('project-uuid');
        expect(result.projects[0].effectiveCapabilities.runMetricQuery).toBe(
            true,
        );
        expect(result.projects[0].explores).toBeNull();
    });

    it('excludes the projects the user cannot see', async () => {
        const { registry, registered } = buildRegistry();
        const { deps } = buildDeps({
            projects: [
                { projectUuid: 'visible', name: 'Visible' },
                { projectUuid: 'hidden', name: 'Hidden' },
            ],
        });
        registerAccessTools(registry, deps);

        const context = buildContext({ visibleProjectUuids: ['visible'] });
        const result = parseResult(
            await registered[0].handler({ includeExplores: false }, context),
        );

        expect(result.projects.map((p: AnyType) => p.projectUuid)).toEqual([
            'visible',
        ]);
    });

    it('throws when the requested project is not visible', async () => {
        const { registry, registered } = buildRegistry();
        const { deps } = buildDeps({
            projects: [{ projectUuid: 'visible', name: 'Visible' }],
        });
        registerAccessTools(registry, deps);

        const context = buildContext({ visibleProjectUuids: ['visible'] });

        await expect(
            registered[0].handler({ projectUuid: 'hidden' }, context),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('does not look up explores when includeExplores is false', async () => {
        const { registry, registered } = buildRegistry();
        const { deps, getAllExploresSummary, getCatalog, getAllExploreSummaries } =
            buildDeps({
                projects: [{ projectUuid: 'project-uuid', name: 'Demo' }],
            });
        registerAccessTools(registry, deps);

        const context = buildContext({
            visibleProjectUuids: ['project-uuid'],
        });
        await registered[0].handler({ includeExplores: false }, context);

        expect(getAllExploresSummary).not.toHaveBeenCalled();
        expect(getCatalog).not.toHaveBeenCalled();
        expect(getAllExploreSummaries).not.toHaveBeenCalled();
    });

    it('looks up explores when includeExplores is true', async () => {
        const { registry, registered } = buildRegistry();
        const { deps, getAllExploresSummary, getCatalog, getAllExploreSummaries } =
            buildDeps({
                projects: [{ projectUuid: 'project-uuid', name: 'Demo' }],
            });
        registerAccessTools(registry, deps);

        const context = buildContext({
            visibleProjectUuids: ['project-uuid'],
        });
        const result = parseResult(
            await registered[0].handler({ includeExplores: true }, context),
        );

        expect(getAllExploresSummary).toHaveBeenCalledTimes(1);
        expect(getCatalog).toHaveBeenCalledTimes(1);
        expect(getAllExploreSummaries).toHaveBeenCalledTimes(1);

        const { explores } = result.projects[0];
        expect(explores.queryable.map((e: AnyType) => e.name)).toEqual([
            'orders',
        ]);
        expect(explores.metadataOnly).toEqual([]);
        expect(explores.attributeDenied.map((e: AnyType) => e.name)).toEqual([
            'users',
        ]);
    });

    const buildClientUseDiagnostics = (
        overrides: AnyType = {},
    ): AnyType => ({
        projectUuid: 'project-uuid',
        clientUseEnabled: true,
        rpcConfigured: true,
        effectiveProjectRole: 'viewer',
        roleSource: 'project_membership',
        scopeApplied: true,
        restrictedRole: true,
        status: 'rpc_ok',
        reason: '客户授权接口返回该手机号（13800000000）在本项目下有授权看板。',
        mobile: '13800000000',
        allowedDashboardCount: 1,
        allowedDashboardUuids: ['dashboard-uuid-1'],
        allowedDashboardNames: ['类目看板'],
        scopeCounts: { dashboards: 1, charts: 2, spaces: 1, explores: 1 },
        ...overrides,
    });

    it('exposes the clientUse diagnostic per project without dashboard metadata', async () => {
        const { registry, registered } = buildRegistry();
        const { deps, getViewerContentScopeDiagnostics } = buildDeps({
            projects: [{ projectUuid: 'project-uuid', name: 'Demo' }],
            clientUse: buildClientUseDiagnostics(),
        });
        registerAccessTools(registry, deps);

        const context = buildContext({
            visibleProjectUuids: ['project-uuid'],
        });
        const result = parseResult(
            await registered[0].handler({ includeExplores: true }, context),
        );

        expect(getViewerContentScopeDiagnostics).toHaveBeenCalledWith(
            expect.objectContaining({
                userUuid: 'user-uuid',
                email: 'demo@lightdash.com',
            }),
            'project-uuid',
        );

        const project = result.projects[0];
        // rpc_ok 的 reason 内嵌手机号，只给 status 不透出原文（v1 口径）
        expect(project.clientUse).toEqual({
            scopeApplied: true,
            restrictedRole: true,
            status: 'rpc_ok',
            effectiveProjectRole: 'viewer',
            reason: null,
        });
        // 看板清单 / 数量 / scope 统计 / 手机号都不外发（v1 刻意不泄看板元数据）
        const serialized = JSON.stringify(result);
        expect(serialized).not.toMatch(
            /类目看板|dashboard-uuid-1|13800000000|allowedDashboard|scopeCounts|mobile/,
        );
        // explores 分类的 scope 与 clientUse 同源
        expect(project.explores.scope).toEqual({
            scopeApplied: true,
            clientUseStatus: 'rpc_ok',
        });
    });

    it('keeps the clientUse reason when the status does not embed the mobile number', async () => {
        const { registry, registered } = buildRegistry();
        const { deps } = buildDeps({
            projects: [{ projectUuid: 'project-uuid', name: 'Demo' }],
            clientUse: buildClientUseDiagnostics({
                scopeApplied: false,
                status: 'not_client_use',
                reason: '项目未开启客户使用模式，不启用内容范围限制。',
                mobile: null,
                allowedDashboardCount: 0,
                allowedDashboardUuids: [],
                allowedDashboardNames: [],
                scopeCounts: null,
            }),
        });
        registerAccessTools(registry, deps);

        const context = buildContext({
            visibleProjectUuids: ['project-uuid'],
        });
        const result = parseResult(
            await registered[0].handler({ includeExplores: false }, context),
        );

        expect(result.projects[0].clientUse).toEqual({
            scopeApplied: false,
            restrictedRole: false,
            status: 'not_client_use',
            effectiveProjectRole: 'viewer',
            reason: '项目未开启客户使用模式，不启用内容范围限制。',
        });
    });

    it('sets clientUse to null and the explores scope to unknown when the diagnostics call fails', async () => {
        const { registry, registered } = buildRegistry();
        const { deps, getViewerContentScopeDiagnostics } = buildDeps({
            projects: [{ projectUuid: 'project-uuid', name: 'Demo' }],
        });
        getViewerContentScopeDiagnostics.mockRejectedValue(
            new Error('rpc down'),
        );
        registerAccessTools(registry, deps);

        const context = buildContext({
            visibleProjectUuids: ['project-uuid'],
        });
        const result = parseResult(
            await registered[0].handler({ includeExplores: true }, context),
        );

        expect(result.projects[0].clientUse).toBeNull();
        expect(result.projects[0].explores.scope).toEqual({
            scopeApplied: null,
            clientUseStatus: null,
        });
    });
});

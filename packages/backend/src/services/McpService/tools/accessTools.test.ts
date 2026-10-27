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
}: {
    projects: { projectUuid: string; name: string }[];
}) => {
    const getAllByOrganizationUuid = jest.fn().mockResolvedValue(projects);
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

    const deps = {
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
    } as unknown as McpToolDeps;

    return {
        deps,
        getAllByOrganizationUuid,
        getAllExploresSummary,
        getAllExploreSummaries,
        getCatalog,
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

        const explores = result.projects[0].explores;
        expect(explores.queryable.map((e: AnyType) => e.name)).toEqual([
            'orders',
        ]);
        expect(explores.metadataOnly).toEqual([]);
        expect(explores.attributeDenied.map((e: AnyType) => e.name)).toEqual([
            'users',
        ]);
    });
});

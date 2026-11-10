import { subject } from '@casl/ability';
import {
    CatalogType,
    ForbiddenError,
    ViewerContentScopeDiagnostics,
} from '@lightdash/common';
import { z } from 'zod';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { McpToolName } from '../McpToolName';
import {
    accessLevelFromCapabilities,
    capabilitiesFromRules,
    mergeCapabilities,
    parseAbilityRules,
    AccessCapabilities,
    AccessLevel,
} from './access/abilityFromRules';
import {
    classifyExplores,
    collectExploreAccessItems,
    ClassifiedExplores,
    ExploreScopeInfo,
    toExploreScopeInfo,
} from './access/classifyExplores';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

const getMyAccessArgsSchema = z.object({
    projectUuid: z
        .string()
        .optional()
        .describe(
            'Optional project uuid. When provided, only the access of this project is returned.',
        ),
    includeExplores: z
        .boolean()
        .optional()
        .describe(
            'When true, each project also lists its explores, split into queryable, metadataOnly and attributeDenied. Defaults to false.',
        ),
});

type ProjectAccess = {
    projectUuid: string;
    name: string;
    projectRole: AccessLevel | null;
    effectiveAccessLevel: AccessLevel | null;
    effectiveCapabilities: AccessCapabilities;
    explores: ClassifiedExplores | null;
    clientUse: ClientUseDiagnostics | null;
};

/**
 * client-use（客户使用模式）诊断里可安全外发的字段（v1 对齐移植，见
 * packages/lightdash-mcp/src/mcp/tools/registerAccessTools.ts 的
 * `toClientUseDiagnostics`）。
 *
 * 刻意不透出 allowedDashboardUuids / allowedDashboardNames /
 * allowedDashboardCount / scopeCounts 等看板元数据（v1 不泄看板清单）。
 */
export type ClientUseDiagnostics = {
    /** 白名单（看板授权）是否对当前用户生效 */
    scopeApplied: boolean;
    /** 受控角色（viewer / interactive_viewer 且白名单生效口径，v1 对齐） */
    restrictedRole: boolean;
    /** 后端诊断状态（rpc_ok / not_client_use / …） */
    status: string;
    /** 有效项目角色（project membership > group > organization） */
    effectiveProjectRole: string | null;
    /** 客服排查用说明；rpc_ok / rpc_empty 时为 null（原文内嵌手机号） */
    reason: string | null;
};

/** 后端 reason 内嵌手机号（email 前缀）的状态，只给 status 不透出原文 */
const CLIENT_USE_REDACTED_REASONS = new Set(['rpc_ok', 'rpc_empty']);

/**
 * 从 client-use 诊断里抽可安全外发的字段；诊断缺失（进程内取数失败
 * catch → undefined，等价 v1 未带 projectUuid / 老后端）时返回 null。
 */
export const toClientUseDiagnostics = (
    clientUse: ViewerContentScopeDiagnostics | undefined,
): ClientUseDiagnostics | null => {
    if (!clientUse) {
        return null;
    }
    return {
        scopeApplied: clientUse.scopeApplied,
        // v1 对齐：restrictedRole = isRestrictedScope(toExploreScopeInfo(clientUse))，
        // 与 scopeApplied 同源但保留独立字段（前向兼容）
        restrictedRole: clientUse.scopeApplied === true,
        status: clientUse.status,
        effectiveProjectRole: clientUse.effectiveProjectRole,
        reason: CLIENT_USE_REDACTED_REASONS.has(clientUse.status)
            ? null
            : clientUse.reason,
    };
};

/**
 * 进程内取 client-use 诊断（与预检 assertExploreQueryable 同源）。
 * 失败时按「未知」处理（catch → undefined），不阻断工具。
 */
const getProjectClientUseDiagnostics = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
): Promise<ViewerContentScopeDiagnostics | undefined> =>
    deps.dashboardService
        .getViewerContentScopeDiagnostics(context.user, projectUuid)
        .catch(() => undefined);

/**
 * Lists the explores of a project and classifies them by what the user is
 * allowed to do with them.
 */
const getProjectExplores = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
    canRunQueries: boolean,
    scope: ExploreScopeInfo,
): Promise<ClassifiedExplores> => {
    const { user, account } = context;

    const [allowedExplores, catalog] = await Promise.all([
        deps.projectService.getAllExploresSummary(
            account,
            projectUuid,
            false,
            true,
        ),
        deps.catalogService.getCatalog(
            user,
            projectUuid,
            { type: CatalogType.Table },
            CatalogSearchContext.MCP,
        ),
    ]);

    const allowedExploreNames = new Set(
        allowedExplores.map((explore) => explore.name),
    );

    // Explores that exist in the project but that the user cannot access
    // because of user attribute restrictions
    const allExploreSummaries =
        await deps.projectModel.getAllExploreSummaries(projectUuid);
    const deniedExplores = allExploreSummaries.filter(
        (explore) => !allowedExploreNames.has(explore.name),
    );

    const catalogTables = catalog.data.filter(
        (item) => item.type === CatalogType.Table,
    );

    return classifyExplores(
        collectExploreAccessItems(deniedExplores),
        collectExploreAccessItems(catalogTables),
        canRunQueries,
        scope,
    );
};

/**
 * Registers the tool that tells an agent what the current user is allowed to
 * do in the organisation and in each project.
 */
export const registerAccessTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.GET_MY_ACCESS,
        {
            description:
                'Get the access of the current user: organisation role and capabilities, plus the effective access level and capabilities of every project the user can see. Pass includeExplores=true to also list the explores of each project, split into queryable (the user can run queries), metadataOnly (only metadata is visible) and attributeDenied (hidden by user attribute restrictions). Each project also carries a clientUse diagnostic (scopeApplied, status, effectiveProjectRole, reason) telling whether the client-use dashboard allow-list applies to this user; it is null when the diagnostics cannot be resolved and never includes the allow-listed dashboard ids or names.',
            inputSchema: {
                projectUuid: z
                    .string()
                    .optional()
                    .describe(
                        'Optional project uuid. When provided, only the access of this project is returned.',
                    ),
                includeExplores: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, each project also lists its explores, split into queryable, metadataOnly and attributeDenied. Defaults to false.',
                    ),
            },
        },
        async (args, context) => {
            const { projectUuid, includeExplores } = getMyAccessArgsSchema.parse(
                args ?? {},
            );

            const { user, organizationUuid } = context;
            const rules = parseAbilityRules(user.abilityRules);
            const organizationCapabilities = capabilitiesFromRules(rules, {
                type: 'org',
            });

            const organizationProjects =
                await deps.projectModel.getAllByOrganizationUuid(
                    organizationUuid,
                );

            // Only keep the projects the user is allowed to see
            const visibleProjects = organizationProjects.filter((project) =>
                context.ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ),
            );

            let projects = visibleProjects;
            if (projectUuid) {
                const requestedProject = visibleProjects.find(
                    (project) => project.projectUuid === projectUuid,
                );
                if (!requestedProject) {
                    throw new ForbiddenError(
                        `You do not have access to project ${projectUuid}`,
                    );
                }
                projects = [requestedProject];
            }

            const projectAccess: ProjectAccess[] = await Promise.all(
                projects.map(async (project) => {
                    const projectCapabilities = capabilitiesFromRules(rules, {
                        type: 'project',
                        projectUuid: project.projectUuid,
                    });
                    const effectiveCapabilities = mergeCapabilities(
                        organizationCapabilities,
                        projectCapabilities,
                    );

                    // client-use 诊断每个项目都取（缓存过 Admin RPC，开销小），
                    // explores 分类与 clientUse 字段同源
                    const clientUseDiagnostics =
                        await getProjectClientUseDiagnostics(
                            deps,
                            context,
                            project.projectUuid,
                        );

                    const base: ProjectAccess = {
                        projectUuid: project.projectUuid,
                        name: project.name,
                        projectRole: accessLevelFromCapabilities(
                            projectCapabilities,
                        ),
                        effectiveAccessLevel: accessLevelFromCapabilities(
                            effectiveCapabilities,
                        ),
                        effectiveCapabilities,
                        explores: null,
                        clientUse: toClientUseDiagnostics(
                            clientUseDiagnostics,
                        ),
                    };

                    if (includeExplores !== true) {
                        return base;
                    }

                    return {
                        ...base,
                        explores: await getProjectExplores(
                            deps,
                            context,
                            project.projectUuid,
                            effectiveCapabilities.runMetricQuery,
                            toExploreScopeInfo(clientUseDiagnostics),
                        ),
                    };
                }),
            );

            return jsonToolResult({
                email: user.email ?? null,
                firstName: user.firstName ?? null,
                lastName: user.lastName ?? null,
                userUuid: user.userUuid,
                // 强制看板模式策略（让 agent 一次问清，避免靠失败试错；v1 对齐）
                dashboardStrict: deps.lightdashConfig.mcp.dashboardStrict,
                dashboardContact: deps.lightdashConfig.mcp.dashboardContact,
                organization: {
                    organizationUuid,
                    name: user.organizationName ?? null,
                    role: user.role ?? null,
                    capabilities: organizationCapabilities,
                },
                projects: projectAccess,
            });
        },
    );
};

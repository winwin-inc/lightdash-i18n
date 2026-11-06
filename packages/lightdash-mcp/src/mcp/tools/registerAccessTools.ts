import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LightdashMcpEnvConfig } from '../../config';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import {
    accessLevelFromCapabilities,
    capabilitiesFromRules,
    mergeCapabilities,
    parseAbilityRules,
    type AccessCapabilities,
} from '../access/abilityFromRules';
import {
    classifyExplores,
    collectExploreAccessItems,
    isRestrictedScope,
    toExploreScopeInfo,
    unknownExploreScope,
    type ClassifiedExplores,
    type ExploreScopeInfo,
} from '../access/classifyExplores';
import { listAllCatalogTables } from '../access/listCatalogTables';
import { resolveCoreToolsApiKey } from '../coreToolsContext';
import { registerToolTyped } from '../registerToolTyped';

type ProjectSummary = {
    projectUuid: string;
    name: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function collectProjects(value: unknown): ProjectSummary[] {
    let rows: unknown[] = [];
    if (Array.isArray(value)) {
        rows = value;
    } else {
        const nested = asRecord(value)?.data;
        if (Array.isArray(nested)) {
            rows = nested;
        }
    }
    return rows
        .map((item) => {
            const row = asRecord(item);
            const projectUuid = stringOrNull(row?.projectUuid);
            if (!projectUuid) {
                return null;
            }
            return {
                projectUuid,
                name: stringOrNull(row?.name) ?? projectUuid,
            };
        })
        .filter((item): item is ProjectSummary => item !== null);
}

type ProjectAccessBase = {
    projectUuid: string;
    name: string;
    projectRole: ReturnType<typeof accessLevelFromCapabilities>;
    effectiveAccessLevel: ReturnType<typeof accessLevelFromCapabilities>;
    effectiveCapabilities: AccessCapabilities;
};

export function withOptionalExplores(
    project: ProjectAccessBase,
    includeExplores: boolean,
    explores: ClassifiedExplores | null,
): ProjectAccessBase | (ProjectAccessBase & { explores: ClassifiedExplores }) {
    if (!includeExplores || explores === null) {
        return project;
    }
    return { ...project, explores };
}

/**
 * 从 `clientUse` 诊断里抽可安全外发的字段。
 *
 * 不透出 allowedDashboardNames 等看板元数据；保留 `reason`（客服排查用的中文说明）。
 */
export function toClientUseDiagnostics(
    clientUse: unknown,
    restrictedScope: boolean,
): {
    scopeApplied: boolean | null;
    restrictedRole: boolean;
    status: string | null;
    effectiveProjectRole: string | null;
    reason: string | null;
} | null {
    const row = asRecord(clientUse);
    if (!row) {
        return null;
    }
    const status = stringOrNull(row.status);
    return {
        scopeApplied:
            typeof row.scopeApplied === 'boolean' ? row.scopeApplied : null,
        restrictedRole: restrictedScope,
        status,
        effectiveProjectRole: stringOrNull(row.effectiveProjectRole),
        // 后端 reason 在 rpc_ok / rpc_empty 里内嵌手机号（email 前缀），
        // 这两种状态只给 status，不透出原文；其余状态是纯状态说明。
        reason:
            status === 'rpc_ok' || status === 'rpc_empty'
                ? null
                : stringOrNull(row.reason),
    };
}

async function buildProjectAccess(
    api: LightdashRestClient,
    apiKey: string,
    project: ProjectSummary,
    rules: ReturnType<typeof parseAbilityRules>,
    organizationCapabilities: AccessCapabilities,
    includeExplores: boolean,
    scope: ExploreScopeInfo = unknownExploreScope(),
) {
    const projectCapabilities = capabilitiesFromRules(rules, {
        type: 'project',
        projectUuid: project.projectUuid,
    });
    const effectiveCapabilities = mergeCapabilities(
        organizationCapabilities,
        projectCapabilities,
    );
    const base: ProjectAccessBase = {
        projectUuid: project.projectUuid,
        name: project.name,
        projectRole: accessLevelFromCapabilities(projectCapabilities),
        effectiveAccessLevel: accessLevelFromCapabilities(effectiveCapabilities),
        effectiveCapabilities,
    };
    if (!includeExplores) {
        return withOptionalExplores(base, false, null);
    }
    const [exploresRaw, catalogRaw] = await Promise.all([
        api.listExplores(apiKey, project.projectUuid, true),
        listAllCatalogTables(api, apiKey, project.projectUuid),
    ]);
    return withOptionalExplores(
        base,
        true,
        classifyExplores(
            collectExploreAccessItems(exploresRaw),
            collectExploreAccessItems(catalogRaw),
            effectiveCapabilities.runMetricQuery,
            scope,
        ),
    );
}

export function registerAccessTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
): void {
    registerToolTyped(
        server,
        'core-tool',
        'get_my_access',
        '返回当前 PAT 的组织角色和各项目有效能力。默认不返回 explores。要表名单时传 includeExplores=true，建议同时带 projectUuid。',
        {
            projectUuid: z.string().optional(),
            includeExplores: z
                .boolean()
                .optional()
                .describe(
                    '默认 false：不返回 explores，也不拉表名单。true 时返回 queryable / metadataOnly / attributeDenied。建议同时传 projectUuid。',
                ),
        },
        async (args) => {
            const apiKey = resolveCoreToolsApiKey(config);
            const requestedProjectUuid = stringOrNull(args.projectUuid);
            const [userRaw, projectsRaw] = await Promise.all([
                // 带 projectUuid 才会返回 clientUse 诊断（受控角色 / 白名单是否生效）
                api.getAuthenticatedUser(
                    apiKey,
                    requestedProjectUuid ?? undefined,
                ),
                api.listProjects(apiKey),
            ]);
            const user = asRecord(userRaw) ?? {};
            const rules = parseAbilityRules(user.abilityRules);
            const organizationCapabilities = capabilitiesFromRules(rules, {
                type: 'org',
            });
            const includeExplores = args.includeExplores === true;
            const projects = collectProjects(projectsRaw).filter((project) =>
                requestedProjectUuid
                    ? project.projectUuid === requestedProjectUuid
                    : true,
            );
            const scope = toExploreScopeInfo(user.clientUse);
            const projectAccess = await Promise.all(
                projects.map((project) =>
                    buildProjectAccess(
                        api,
                        apiKey,
                        project,
                        rules,
                        organizationCapabilities,
                        includeExplores,
                        scope,
                    ),
                ),
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                email: stringOrNull(user.email),
                                firstName: stringOrNull(user.firstName),
                                lastName: stringOrNull(user.lastName),
                                userUuid: stringOrNull(user.userUuid),
                                // 强制看板模式策略（让 agent 一次问清，避免靠失败试错）
                                dashboardStrict: config.dashboardStrict,
                                dashboardContact: config.dashboardContact,
                                // 客户使用模式诊断：受控角色白名单生效时，
                                // 「查不到表」要按「没权限」解释，而不是「表不存在」
                                clientUse: toClientUseDiagnostics(
                                    user.clientUse,
                                    isRestrictedScope(scope),
                                ),
                                organization: {
                                    organizationUuid: stringOrNull(
                                        user.organizationUuid,
                                    ),
                                    name: stringOrNull(user.organizationName),
                                    role: stringOrNull(user.role),
                                    capabilities: organizationCapabilities,
                                },
                                projects: projectAccess,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );
}

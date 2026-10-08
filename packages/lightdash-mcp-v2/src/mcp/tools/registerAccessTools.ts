import { McpServer } from '@modelcontextprotocol/server';
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
    type ClassifiedExplores,
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

async function buildProjectAccess(
    api: LightdashRestClient,
    apiKey: string,
    project: ProjectSummary,
    rules: ReturnType<typeof parseAbilityRules>,
    organizationCapabilities: AccessCapabilities,
    includeExplores: boolean,
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
        '返回当前令牌的组织角色和各项目有效能力。默认不返回 explores。要表名单时传 includeExplores=true，建议同时带 projectUuid。',
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
            const [userRaw, projectsRaw] = await Promise.all([
                api.getAuthenticatedUser(apiKey),
                api.listProjects(apiKey),
            ]);
            const user = asRecord(userRaw) ?? {};
            const rules = parseAbilityRules(user.abilityRules);
            const organizationCapabilities = capabilitiesFromRules(rules, {
                type: 'org',
            });
            const requestedProjectUuid = stringOrNull(args.projectUuid);
            const includeExplores = args.includeExplores === true;
            const projects = collectProjects(projectsRaw).filter((project) =>
                requestedProjectUuid
                    ? project.projectUuid === requestedProjectUuid
                    : true,
            );
            const projectAccess = await Promise.all(
                projects.map((project) =>
                    buildProjectAccess(
                        api,
                        apiKey,
                        project,
                        rules,
                        organizationCapabilities,
                        includeExplores,
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

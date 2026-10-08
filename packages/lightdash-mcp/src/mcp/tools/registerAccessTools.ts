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

async function buildProjectAccess(
    api: LightdashRestClient,
    apiKey: string,
    project: ProjectSummary,
    rules: ReturnType<typeof parseAbilityRules>,
    organizationCapabilities: AccessCapabilities,
) {
    const projectCapabilities = capabilitiesFromRules(rules, {
        type: 'project',
        projectUuid: project.projectUuid,
    });
    const effectiveCapabilities = mergeCapabilities(
        organizationCapabilities,
        projectCapabilities,
    );
    const [exploresRaw, catalogRaw] = await Promise.all([
        api.listExplores(apiKey, project.projectUuid, true),
        listAllCatalogTables(api, apiKey, project.projectUuid),
    ]);
    return {
        projectUuid: project.projectUuid,
        name: project.name,
        projectRole: accessLevelFromCapabilities(projectCapabilities),
        effectiveAccessLevel: accessLevelFromCapabilities(effectiveCapabilities),
        effectiveCapabilities,
        explores: classifyExplores(
            collectExploreAccessItems(exploresRaw),
            collectExploreAccessItems(catalogRaw),
            effectiveCapabilities.runMetricQuery,
        ),
    };
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
        '返回当前 PAT 的组织角色、各项目有效能力和可查表。可选 projectUuid；不传则列出全部可访问项目。',
        { projectUuid: z.string().optional() },
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

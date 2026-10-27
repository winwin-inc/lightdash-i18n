import { subject } from '@casl/ability';
import { CatalogType, ForbiddenError } from '@lightdash/common';
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
};

/**
 * Lists the explores of a project and classifies them by what the user is
 * allowed to do with them.
 */
const getProjectExplores = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
    canRunQueries: boolean,
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
                'Get the access of the current user: organisation role and capabilities, plus the effective access level and capabilities of every project the user can see. Pass includeExplores=true to also list the explores of each project, split into queryable (the user can run queries), metadataOnly (only metadata is visible) and attributeDenied (hidden by user attribute restrictions).',
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
                        ),
                    };
                }),
            );

            return jsonToolResult({
                email: user.email ?? null,
                firstName: user.firstName ?? null,
                lastName: user.lastName ?? null,
                userUuid: user.userUuid,
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

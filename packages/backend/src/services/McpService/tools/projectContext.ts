import { ForbiddenError } from '@lightdash/common';
import { McpToolDeps } from './deps';
import { McpToolContext } from './types';

/**
 * Shared description of the optional `projectUuid` argument exposed by the
 * project-scoped MCP tools.
 */
export const PROJECT_UUID_PARAM_DESCRIPTION =
    'Project UUID to use for this call. When omitted, resolves to the default ' +
    'project for the current user and organization, then the organization ' +
    'default, then the server default. An explicit value always takes precedence.';

/**
 * Error message returned when no project could be resolved at any level of
 * the fallback chain.
 */
export const NO_DEFAULT_PROJECT_ERROR =
    'No default project available. Call set_project to set one, or pass projectUuid explicitly.';

/**
 * Hint appended to `NO_DEFAULT_PROJECT_ERROR` explaining the resolution
 * order of the fallback chain.
 */
export const NO_DEFAULT_PROJECT_HINT =
    'Resolution order: explicit projectUuid > user default (set_project) > ' +
    'organization default > server default (LIGHTDASH_PROJECT_UUID).';

/**
 * Where a resolved project came from.
 *
 * - `argument`: the caller passed an explicit `projectUuid`.
 * - `user_default`: the per-user default stored with `set_project`.
 * - `organization_default`: `organizations.default_project_uuid`.
 * - `server_default`: `LIGHTDASH_PROJECT_UUID` (`mcp.defaultProjectUuid`).
 */
export type ProjectResolutionSource =
    | 'argument'
    | 'user_default'
    | 'organization_default'
    | 'server_default';

export type ResolvedProjectContext = {
    projectUuid: string;
    source: ProjectResolutionSource;
};

/**
 * Validates that the account may view the project.
 *
 * `ProjectService.getProject` already runs the CASL `view Project` check
 * against `account.user.ability` and throws `ForbiddenError` (or
 * `NotFoundError` when the project does not exist).
 */
const assertProjectVisible = async (
    deps: McpToolDeps,
    context: McpToolContext,
    projectUuid: string,
): Promise<void> => {
    await deps.projectService.getProject(projectUuid, context.account);
};

/**
 * Reads the per-user, per-organization default project stored by
 * `set_project`.
 */
const getUserDefaultProjectUuid = async (
    deps: McpToolDeps,
    context: McpToolContext,
): Promise<string | undefined> => {
    const contextRow = await deps.mcpContextModel.getContext(
        context.user.userUuid,
        context.organizationUuid,
    );
    return contextRow?.context.projectUuid || undefined;
};

/**
 * Reads the organization-level default project configured by an admin.
 */
const getOrganizationDefaultProjectUuid = async (
    deps: McpToolDeps,
    context: McpToolContext,
): Promise<string | undefined> => {
    const organization = await deps.organizationModel.get(
        context.organizationUuid,
    );
    return organization.defaultProjectUuid || undefined;
};

/**
 * Reads the deployment-level default project (`LIGHTDASH_PROJECT_UUID`).
 */
const getServerDefaultProjectUuid = (
    deps: McpToolDeps,
): string | undefined =>
    deps.lightdashConfig?.mcp?.defaultProjectUuid || undefined;

/**
 * Attempts one implicit fallback level. Returns `undefined` when the level
 * is unset or when its project fails the permission check, so the chain
 * falls through to the next level instead of failing.
 */
const tryResolveImplicitLevel = async (
    deps: McpToolDeps,
    context: McpToolContext,
    source: ProjectResolutionSource,
    resolve: () => Promise<string | undefined>,
): Promise<ResolvedProjectContext | undefined> => {
    try {
        const projectUuid = await resolve();
        if (!projectUuid) {
            return undefined;
        }
        await assertProjectVisible(deps, context, projectUuid);
        return { projectUuid, source };
    } catch {
        // The level is unavailable or the account cannot view its project:
        // degrade to the next level instead of failing.
        return undefined;
    }
};

/**
 * Resolves the project to use for a tool call through the four level
 * fallback chain:
 *
 * ① explicit `projectUuid` argument — always the highest priority; when it
 *    fails the permission check the error is thrown as-is, never silently
 *    replaced with another project.
 * ② the user-level default stored with `set_project` (`mcp_context`).
 * ③ the organization-level default (`organizations.default_project_uuid`).
 * ④ the deployment-level default (`LIGHTDASH_PROJECT_UUID`).
 *
 * The implicit levels ②③④ fall through to the next level when they are
 * unset **or** when they fail the permission check: a default may have
 * become stale (project deleted, access revoked) and should degrade
 * gracefully instead of failing the whole chain. When no level resolves,
 * a `ForbiddenError` carrying `NO_DEFAULT_PROJECT_ERROR` and
 * `NO_DEFAULT_PROJECT_HINT` is thrown.
 */
export const resolveProjectContext = async (
    deps: McpToolDeps,
    context: McpToolContext,
    explicitProjectUuid?: string,
): Promise<ResolvedProjectContext> => {
    // ① Explicit argument: validation failure must not fall back.
    if (explicitProjectUuid) {
        await assertProjectVisible(deps, context, explicitProjectUuid);
        return { projectUuid: explicitProjectUuid, source: 'argument' };
    }

    // ②③④ Implicit defaults: missing or invalid levels fall through.
    const resolved =
        (await tryResolveImplicitLevel(
            deps,
            context,
            'user_default',
            () => getUserDefaultProjectUuid(deps, context),
        )) ??
        (await tryResolveImplicitLevel(
            deps,
            context,
            'organization_default',
            () => getOrganizationDefaultProjectUuid(deps, context),
        )) ??
        (await tryResolveImplicitLevel(
            deps,
            context,
            'server_default',
            async () => getServerDefaultProjectUuid(deps),
        ));

    if (resolved) {
        return resolved;
    }

    throw new ForbiddenError(
        `${NO_DEFAULT_PROJECT_ERROR} ${NO_DEFAULT_PROJECT_HINT}`,
    );
};

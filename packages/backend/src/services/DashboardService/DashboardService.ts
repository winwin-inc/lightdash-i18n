import { subject } from '@casl/ability';
import {
    AbilityAction,
    assertUnreachable,
    BulkActionable,
    convertOrganizationRoleToProjectRole,
    CreateDashboard,
    CreateDashboardWithCharts,
    CreateSavedChart,
    CreateSchedulerAndTargetsWithoutIds,
    Dashboard,
    DashboardDAO,
    DashboardTab,
    DashboardTileTypes,
    DashboardVersionedFields,
    ExploreType,
    ForbiddenError,
    generateSlug,
    hasChartsInDashboard,
    isChartScheduler,
    isClientUseRestrictedProjectRole,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    PROJECT_OPERATION_LOG_ACTIONS,
    ProjectMemberRole,
    SCHEDULER_TASKS,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    TogglePinnedItemInfo,
    UpdateDashboard,
    UpdateMultipleDashboards,
    type ChartFieldUpdates,
    type DashboardBasicDetailsWithTileTypes,
    type DashboardConfig,
    type DashboardFilterRule,
    type DashboardQueryContext,
    type DuplicateDashboardParams,
    type Explore,
    type ExploreError,
    type ExportContentPayload,
    type ExportContentRequest,
    type MemberAbility,
    type SchedulerCsvOptions,
    type UserDashboardsSummary,
    type UUID,
    type ViewerContentScope,
    type ViewerContentScopeDiagnostics,
    type ViewerContentScopeStatus,
    type ViewerProjectRoleSource,
} from '@lightdash/common';

import cronstrue from 'cronstrue';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import {
    CreateDashboardOrVersionEvent,
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { CategoryRpcClient } from '../../clients/CategoryRpcClient/CategoryRpcClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { getChartFieldUsageChanges } from '../../models/CatalogModel/utils';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserDashboardCategoryModel } from '../../models/UserDashboardCategoryModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { createTwoColumnTiles } from '../../utils/dashboardTileUtils';
import { assertDashboardSchedulerFilterRequirementsMet } from '../../utils/schedulerFilterRequirements';
import { BaseService } from '../BaseService';
import { ProjectOperationLogService } from '../ProjectOperationLogService/ProjectOperationLogService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { hasDirectAccessToSpace } from '../SpaceService/SpaceService';
import { diffDashboardVersionedContent } from './dashboardOperationLogDiff';

/** Fields needed to resolve client-use dashboard / explore allow-lists. */
export type DashboardAllowListUser = Pick<SessionUser, 'userUuid' | 'email'>;

/**
 * User information needed to resolve a dashboard context.
 *
 * It is deliberately narrower than `SessionUser` so that the same resolution
 * can be done for accounts that are not session users (eg: a personal access
 * token), where the user is only available through the account.
 */
export type DashboardContextUser = {
    userUuid: string;
    email: string | undefined;
    organizationUuid?: string;
    ability: MemberAbility;
};

/**
 * Result of the client-use allow-list resolution.
 *
 * - `uuids: undefined`: the allow-list does not apply (not a client-use
 *   project, or the user is not a restricted role).
 * - `uuids: Set`: the allowed dashboards (an empty set means fail-closed).
 * - `failed`: the Admin RPC failed. The result stays fail-closed but is only
 *   cached briefly so the next request retries as soon as the RPC recovers.
 */
type AllowedDashboardUuidsResult = {
    uuids: Set<string> | undefined;
    failed: boolean;
    /**
     * Why the allow-list is (not) applied. Kept next to the result so the
     * diagnostic endpoint does not need a second Admin RPC call.
     */
    status: ViewerContentScopeStatus;
    /** Effective project role (project membership > group > organization) */
    effectiveProjectRole: string | null;
    roleSource: ViewerProjectRoleSource;
    /** Mobile number derived from the user email */
    mobile: string | null;
    /** `projects.is_client_use` */
    clientUseEnabled: boolean;
    /** `ADMIN_API_HOST` + `ADMIN_API_KEY` are both configured */
    rpcConfigured: boolean;
};

type DashboardServiceArguments = {
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    savedChartModel: SavedChartModel;
    savedChartService: SavedChartService;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    projectModel: ProjectModel;
    catalogModel: CatalogModel;
    userDashboardCategoryModel: UserDashboardCategoryModel;
    categoryRpcClient: CategoryRpcClient;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    projectOperationLogService: ProjectOperationLogService;
};

/**
 * Human readable explanation of the client-use allow-list resolution.
 * Used by the diagnostic endpoint / the client-use diagnostic panel.
 */
const describeViewerContentScopeStatus = (
    result: AllowedDashboardUuidsResult,
): string => {
    switch (result.status) {
        case 'not_client_use':
            return '项目未开启客户使用模式，不启用内容范围限制。';
        case 'role_not_restricted':
            return `项目开启了客户使用模式，但该用户的有效项目角色为 ${
                result.effectiveProjectRole ?? '未知'
            }（不属于 viewer / interactive_viewer），因此不启用内容范围限制。`;
        case 'user_not_found':
            return '用户在 users 表中不存在（通常是 SSO 首次登录未同步），无法查询授权看板。';
        case 'no_email':
            return '用户没有邮箱（或邮箱不含手机号前缀），无法映射到客户授权接口，手机号无法查询授权。';
        case 'rpc_not_configured':
            return '客户授权接口（Admin RPC）未配置（缺少 ADMIN_API_HOST 或 ADMIN_API_KEY），未启用内容范围限制。';
        case 'rpc_error':
            return '客户授权接口（Admin RPC）调用失败，已按 fail-closed 处理：当前看不到任何看板，请检查接口可用性。';
        case 'rpc_empty':
            return `客户授权接口返回该手机号（${
                result.mobile ?? '未知'
            }）在本项目下没有任何授权看板，属于正常的“未授权”状态。`;
        case 'rpc_ok':
            return `客户授权接口返回该手机号（${
                result.mobile ?? '未知'
            }）在本项目下有授权看板。`;
        default:
            return assertUnreachable(
                result.status,
                'Unknown viewer content scope status',
            );
    }
};

export class DashboardService
    extends BaseService
    implements BulkActionable<Knex>
{
    /**
     * The client-use allow-list comes from the customer's Admin RPC (a network
     * round trip) and is consulted by content lists, chart reads and every query
     * execution. Without a cache, opening a dashboard would trigger dozens of
     * RPC calls (one or two per tile).
     *
     * The TTL bounds how long a permission change can take to be applied, so it
     * is kept short and aligned with the customer's permission sync expectation.
     */
    private static readonly ALLOW_LIST_CACHE_TTL_MS = 30_000;

    /**
     * When the Admin RPC fails the result is an empty allow-list (fail closed).
     * Cache it only briefly so the next request retries quickly.
     */
    private static readonly ALLOW_LIST_CACHE_ERROR_TTL_MS = 5_000;

    private static readonly SCOPE_CACHE_TTL_MS = 30_000;

    private static readonly MAX_VIEWER_CACHE_ENTRIES = 1000;

    analytics: LightdashAnalytics;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    analyticsModel: AnalyticsModel;

    pinnedListModel: PinnedListModel;

    schedulerModel: SchedulerModel;

    savedChartModel: SavedChartModel;

    savedChartService: SavedChartService;

    catalogModel: CatalogModel;

    projectModel: ProjectModel;

    schedulerClient: SchedulerClient;

    slackClient: SlackClient;

    userDashboardCategoryModel: UserDashboardCategoryModel;

    categoryRpcClient: CategoryRpcClient;

    organizationMemberProfileModel: OrganizationMemberProfileModel;

    projectOperationLogService: ProjectOperationLogService;

    /**
     * Cached allow-list per `projectUuid:userUuid`.
     * The promise is cached (not only its result) so concurrent requests share
     * a single RPC call instead of racing each other.
     */
    private readonly allowListCache = new Map<
        string,
        { expiresAt: number; promise: Promise<AllowedDashboardUuidsResult> }
    >();

    /**
     * Cached content scope per `projectUuid:userUuid`.
     */
    private readonly viewerScopeCache = new Map<
        string,
        { expiresAt: number; promise: Promise<ViewerContentScope | undefined> }
    >();

    constructor({
        analytics,
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        savedChartModel,
        savedChartService,
        schedulerClient,
        slackClient,
        projectModel,
        catalogModel,
        userDashboardCategoryModel,
        categoryRpcClient,
        organizationMemberProfileModel,
        projectOperationLogService,
    }: DashboardServiceArguments) {
        super();
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.savedChartModel = savedChartModel;
        this.savedChartService = savedChartService;
        this.projectModel = projectModel;
        this.catalogModel = catalogModel;
        this.schedulerClient = schedulerClient;
        this.slackClient = slackClient;
        this.userDashboardCategoryModel = userDashboardCategoryModel;
        this.categoryRpcClient = categoryRpcClient;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.projectOperationLogService = projectOperationLogService;
    }

    static getCreateEventProperties(
        dashboard: DashboardDAO,
    ): CreateDashboardOrVersionEvent['properties'] {
        return {
            title: dashboard.name,
            description: dashboard.description,

            projectId: dashboard.projectUuid,
            dashboardId: dashboard.uuid,
            filtersCount: dashboard.filters
                ? dashboard.filters.metrics.length +
                  dashboard.filters.dimensions.length
                : 0,
            tilesCount: dashboard.tiles.length,
            chartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SAVED_CHART,
            ).length,
            sqlChartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SQL_CHART,
            ).length,
            markdownTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.MARKDOWN,
            ).length,
            loomTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.LOOM,
            ).length,
            tabsCount: dashboard.tabs.length,
            parametersCount: Object.keys(dashboard.parameters || {}).length,
        };
    }

    private async deleteOrphanedChartsInDashboards(
        user: SessionUser,
        dashboardUuid: string,
    ) {
        const orphanedCharts = await this.dashboardModel.getOrphanedCharts(
            dashboardUuid,
        );

        await Promise.all(
            orphanedCharts.map(async (chart) => {
                const deletedChart = await this.savedChartModel.delete(
                    chart.uuid,
                );
                this.analytics.track({
                    event: 'saved_chart.deleted',
                    userId: user.userUuid,
                    properties: {
                        savedQueryId: deletedChart.uuid,
                        projectId: deletedChart.projectUuid,
                    },
                });
            }),
        );
    }

    /**
     * Get allowed dashboard UUIDs for viewer / interactive_viewer in client-use projects.
     * Session and personal access token use the same whitelist (mobile from user email).
     * Returns undefined if filtering is not needed, or a Set of allowed dashboard UUIDs.
     *
     * The result is cached (promise included, so concurrent requests share a
     * single Admin RPC call) for a short period: the allow-list is consulted by
     * content lists, chart reads and every query execution.
     */
    async getAllowedDashboardUuidsForViewer(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<Set<string> | undefined> {
        const result = await this.getAllowedDashboardUuidsResult(
            user,
            projectUuid,
        );
        return result.uuids;
    }

    /**
     * Same as {@link getAllowedDashboardUuidsForViewer} but keeps the
     * diagnostic metadata (why the allow-list does or does not apply).
     *
     * The result is cached (promise included, so concurrent requests share a
     * single Admin RPC call) for a short period: the allow-list is consulted by
     * content lists, chart reads and every query execution.
     */
    async getAllowedDashboardUuidsResult(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<AllowedDashboardUuidsResult> {
        const cacheKey = `${projectUuid}:${user.userUuid}`;
        const cached = this.allowListCache.get(cacheKey);
        if (cached !== undefined && cached.expiresAt > Date.now()) {
            return cached.promise;
        }

        const promise = this.fetchAllowedDashboardUuids(user, projectUuid);
        const entry = {
            expiresAt: Date.now() + DashboardService.ALLOW_LIST_CACHE_TTL_MS,
            promise,
        };
        this.allowListCache.set(cacheKey, entry);
        promise.then(
            (result) => {
                entry.expiresAt =
                    Date.now() +
                    (result.failed
                        ? DashboardService.ALLOW_LIST_CACHE_ERROR_TTL_MS
                        : DashboardService.ALLOW_LIST_CACHE_TTL_MS);
            },
            () => {
                // The promise never rejects (fail-closed), this is only a
                // safety net
                entry.expiresAt =
                    Date.now() + DashboardService.ALLOW_LIST_CACHE_ERROR_TTL_MS;
            },
        );
        DashboardService.pruneViewerCache(this.allowListCache);

        return promise;
    }

    /**
     * Drop the cached client-use allow-list and content scope.
     *
     * The allow-list itself comes from the customer's Admin RPC and cannot be
     * invalidated from the outside, but the derived content scope depends on
     * the content of the project: it is dropped when a dashboard changes.
     */
    clearViewerContentCache(projectUuid?: string): void {
        if (projectUuid === undefined) {
            this.allowListCache.clear();
            this.viewerScopeCache.clear();
            return;
        }

        const prefix = `${projectUuid}:`;
        [...this.allowListCache.keys()]
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => this.allowListCache.delete(key));
        [...this.viewerScopeCache.keys()]
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => this.viewerScopeCache.delete(key));
    }

    /**
     * Drop the oldest entries when the cache grows past its maximum size.
     */
    private static pruneViewerCache<T>(cache: Map<string, T>): void {
        if (cache.size <= DashboardService.MAX_VIEWER_CACHE_ENTRIES) {
            return;
        }
        const toRemove = cache.size - DashboardService.MAX_VIEWER_CACHE_ENTRIES;
        let removed = 0;
        for (const key of cache.keys()) {
            cache.delete(key);
            removed += 1;
            if (removed >= toRemove) {
                break;
            }
        }
    }

    /**
     * Resolve the allow-list of a client-use project for a restricted role.
     *
     * `failed` marks an Admin RPC failure: the result is still fail-closed
     * (empty allow-list) but it is only cached for a short time so the next
     * request retries as soon as the RPC recovers.
     */
    private async fetchAllowedDashboardUuids(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<AllowedDashboardUuidsResult> {
        const db = this.userDashboardCategoryModel.getDatabase();

        // Get project info
        const project = await db
            .from('projects')
            .where('project_uuid', projectUuid)
            .select('project_id', 'is_client_use', 'organization_id')
            .first();
        if (!project) {
            this.logger.warn(
                `Project ${projectUuid} not found in projects table, skipping RPC filtering`,
            );
            return {
                uuids: undefined,
                failed: false,
                status: 'not_client_use',
                effectiveProjectRole: null,
                roleSource: 'none',
                mobile: null,
                clientUseEnabled: false,
                rpcConfigured: this.categoryRpcClient.isConfigured(),
            };
        }

        const isClientUse = project.is_client_use ?? false;
        if (!isClientUse) {
            this.logger.warn(
                `Project ${projectUuid} is not in client use mode, skipping RPC filtering`,
            );
            return {
                uuids: undefined,
                failed: false,
                status: 'not_client_use',
                effectiveProjectRole: null,
                roleSource: 'none',
                mobile: null,
                clientUseEnabled: false,
                rpcConfigured: this.categoryRpcClient.isConfigured(),
            };
        }

        // Get user's userId (needed for group_memberships query)
        const userRecord = await db
            .from('users')
            .where('user_uuid', user.userUuid)
            .select('user_id')
            .first();

        if (!userRecord) {
            this.logger.warn(
                `User ${user.userUuid} not found in users table, skipping RPC filtering`,
            );
            return {
                uuids: undefined,
                failed: false,
                status: 'user_not_found',
                effectiveProjectRole: null,
                roleSource: 'none',
                mobile: null,
                clientUseEnabled: true,
                rpcConfigured: this.categoryRpcClient.isConfigured(),
            };
        }

        // Get user's project role from direct membership
        const directMembership = await db
            .from('project_memberships')
            .where('project_memberships.project_id', project.project_id)
            .where('project_memberships.user_id', userRecord.user_id)
            .select('project_memberships.role')
            .first();

        // Get user's project role from group membership
        const groupMembership = await db
            .from('group_memberships')
            .innerJoin(
                'project_group_access',
                'project_group_access.group_uuid',
                'group_memberships.group_uuid',
            )
            .where('group_memberships.organization_id', project.organization_id)
            .where('group_memberships.user_id', userRecord.user_id)
            .where('project_group_access.project_uuid', projectUuid)
            .select('project_group_access.role')
            .first();

        // Get user's organization role (fallback if no project-level role)
        const orgMembership = await db
            .from('organization_memberships')
            .where(
                'organization_memberships.organization_id',
                project.organization_id,
            )
            .where('organization_memberships.user_id', userRecord.user_id)
            .select('organization_memberships.role')
            .first();

        // Determine user's role:
        // 1. Direct project membership (highest priority)
        // 2. Group membership
        // 3. Organization role converted to project role (fallback)
        let userRole = directMembership?.role || groupMembership?.role;
        let roleSource: ViewerProjectRoleSource = directMembership?.role
            ? 'project_membership'
            : 'group_membership';
        if (!userRole && orgMembership?.role) {
            userRole = convertOrganizationRoleToProjectRole(
                orgMembership.role as OrganizationMemberRole,
            );
            roleSource = 'organization';
        }
        if (!userRole) {
            roleSource = 'none';
        }

        const shouldApplyRpcDashboardFilter =
            isClientUseRestrictedProjectRole(userRole);

        // Only filter if user is viewer / interactive_viewer and project has client use enabled
        if (!shouldApplyRpcDashboardFilter) {
            this.logger.warn(
                `User ${user.userUuid} is ${userRole} in project ${projectUuid}, skipping RPC filtering`,
            );
            return {
                uuids: undefined,
                failed: false,
                status: 'role_not_restricted',
                effectiveProjectRole: userRole ?? null,
                roleSource,
                mobile: null,
                clientUseEnabled: true,
                rpcConfigured: this.categoryRpcClient.isConfigured(),
            };
        }

        // For viewer / interactive_viewer in client use mode, RPC interface is required
        // If user.email is missing, cannot verify permissions via RPC
        // Return empty Set to filter out all dashboards (cannot verify = no access)
        if (!user.email) {
            this.logger.warn(
                `User ${user.userUuid} (viewer / interactive_viewer) has no email in client use project ${projectUuid}, filtering out all dashboards.`,
            );
            return {
                uuids: new Set<string>(),
                failed: false,
                status: 'no_email',
                effectiveProjectRole: userRole ?? null,
                roleSource,
                mobile: null,
                clientUseEnabled: true,
                rpcConfigured: this.categoryRpcClient.isConfigured(),
            };
        }

        // Extract mobile number from email (remove @ and everything after it)
        const normalizedEmail = user.email.trim().toLowerCase();
        const mobile = normalizedEmail.split('@')[0];

        if (!mobile) {
            this.logger.warn(
                `User ${user.userUuid} (viewer / interactive_viewer) email ${normalizedEmail} has no mobile part in client use project ${projectUuid}, skipping RPC filtering`,
            );
            return {
                uuids: undefined,
                failed: false,
                status: 'no_email',
                effectiveProjectRole: userRole ?? null,
                roleSource,
                mobile: null,
                clientUseEnabled: true,
                rpcConfigured: this.categoryRpcClient.isConfigured(),
            };
        }

        if (!this.categoryRpcClient.isConfigured()) {
            this.logger.warn(
                `Admin RPC is not configured, skipping dashboard RPC filtering for project ${projectUuid}`,
            );
            return {
                uuids: undefined,
                failed: false,
                status: 'rpc_not_configured',
                effectiveProjectRole: userRole ?? null,
                roleSource,
                mobile,
                clientUseEnabled: true,
                rpcConfigured: false,
            };
        }

        try {
            // Call RPC interface to get dashboards by mobile
            const dashboardsByMobile =
                await this.categoryRpcClient.findAllDashboardByMobile(mobile);

            // Filter dashboards by projectUuid
            // All returned dashboards are authorized (including those without categories)
            // Dashboards without categories: categoryLevel = 0 and leafCategories = []
            const allowedUuids = new Set(
                dashboardsByMobile
                    .filter(
                        (dashboard) => dashboard.projectUuid === projectUuid,
                    )
                    .map((dashboard) => dashboard.dashboardUuid)
                    .filter(Boolean),
            );

            // If no matching dashboards found, return empty Set to filter out all dashboards
            if (allowedUuids.size === 0) {
                this.logger.warn(
                    `No dashboards found for mobile ${mobile} in project ${projectUuid}, filtering out all dashboards`,
                );
            }

            return {
                uuids: allowedUuids,
                failed: false,
                status: allowedUuids.size > 0 ? 'rpc_ok' : 'rpc_empty',
                effectiveProjectRole: userRole ?? null,
                roleSource,
                mobile,
                clientUseEnabled: true,
                rpcConfigured: true,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching dashboards by mobile ${mobile} in project ${projectUuid}: ${
                    error instanceof Error ? error.message : String(error)
                }. Returning empty allow-list; viewer / interactive_viewer will see no dashboards until RPC recovers.`,
            );
            return {
                uuids: new Set<string>(),
                failed: true,
                status: 'rpc_error',
                effectiveProjectRole: userRole ?? null,
                roleSource,
                mobile,
                clientUseEnabled: true,
                rpcConfigured: true,
            };
        }
    }

    /**
     * Explores used by allow-listed dashboards for client-use viewer / interactive_viewer.
     * undefined: skip this layer. Set (including empty): restrict list and ad-hoc query.
     */
    async getAllowedExploreNamesForViewer(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<Set<string> | undefined> {
        const allowedDashboardUuids =
            await this.getAllowedDashboardUuidsForViewer(user, projectUuid);
        if (allowedDashboardUuids === undefined) {
            return undefined;
        }
        return this.dashboardModel.getExploreNamesByDashboardUuids([
            ...allowedDashboardUuids,
        ]);
    }

    /**
     * Resolve a trusted dashboard context (slug + name) for metadata queries.
     *
     * The slug sent by the client is verified against the database so the dbt
     * `sql_filter` (row level security) always receives the canonical slug of a
     * dashboard the user is actually allowed to open. A client cannot spoof the
     * context to bypass the row level filter (e.g. by sending `NA`).
     *
     * Returns undefined when the slug does not belong to the project.
     * Throws ForbiddenError when the user cannot see the dashboard.
     *
     * `filterTableNames` are the tables the dashboard filters on. They are not
     * necessarily covered by the explore allow-list (a dashboard can filter on
     * a table that none of its tiles uses), but the user has to be able to
     * read their values to use the dashboard filters.
     */
    /**
     * Resolves the dashboard context used for metadata queries (eg: field value
     * searches) so that the dbt `sql_filter` (row level security) can be
     * applied with the canonical dashboard slug.
     *
     * The dashboard can be referenced by uuid (globally unique, preferred) or by
     * slug (only unique within a project, so the lookup is scoped to the
     * project). As a last resort the dashboard name is used, still scoped to
     * the project, so that a stale slug cannot silently disable the row filter.
     */
    async resolveDashboardContextForMetadata(
        user: DashboardContextUser,
        projectUuid: string,
        dashboardUuidOrSlug?: string,
        dashboardName?: string,
    ): Promise<
        | {
              dashboardSlug: string;
              dashboardName: string;
              filterTableNames: string[];
          }
        | undefined
    > {
        let dashboard: DashboardDAO | undefined;
        try {
            // Scope the lookup to the project: slugs are only unique within a
            // project, so an unscoped lookup can resolve a dashboard that
            // belongs to another project and silently drop the row filter.
            if (dashboardUuidOrSlug) {
                dashboard = await this.dashboardModel.getByIdOrSlug(
                    dashboardUuidOrSlug,
                    projectUuid,
                );
            }
        } catch (error) {
            // A missing dashboard is a valid answer, any other error is not
            if (!(error instanceof NotFoundError)) {
                throw error;
            }
            dashboard = undefined;
        }

        if (!dashboard && dashboardName) {
            // Fallback: resolve the dashboard by name within the project, so a
            // stale/duplicated slug still resolves to the right dashboard.
            const matchingDashboardUuids =
                await this.dashboardModel.getUuidsByNameInProject(
                    projectUuid,
                    dashboardName,
                );
            if (matchingDashboardUuids.length === 1) {
                try {
                    dashboard = await this.dashboardModel.getByIdOrSlug(
                        matchingDashboardUuids[0],
                        projectUuid,
                    );
                } catch (error) {
                    if (!(error instanceof NotFoundError)) {
                        throw error;
                    }
                    dashboard = undefined;
                }
            }
        }

        if (!dashboard || dashboard.projectUuid !== projectUuid) {
            this.logger.warn(
                `[DASHBOARD_CONTEXT][DashboardService.resolveDashboardContextForMetadata] Dashboard context could not be verified, ignoring client context ${JSON.stringify(
                    {
                        projectUuid,
                        dashboardUuidOrSlug,
                        dashboardName,
                        dashboardProjectUuid: dashboard?.projectUuid,
                        userUuid: user.userUuid,
                    },
                )}`,
            );
            return undefined;
        }

        const space = await this.spaceModel.getSpaceSummary(
            dashboard.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboard.spaceUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Dashboard', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        // Client-use projects: the dashboard must also be in the allow-list
        const allowedDashboardUuids =
            await this.getAllowedDashboardUuidsForViewer(user, projectUuid);
        if (
            allowedDashboardUuids !== undefined &&
            typeof user.organizationUuid === 'string' &&
            !allowedDashboardUuids.has(dashboard.uuid)
        ) {
            throw new ForbiddenError("You don't have access to this dashboard");
        }

        return {
            dashboardSlug: dashboard.slug,
            dashboardName: dashboard.name,
            filterTableNames: [
                ...new Set(
                    [
                        ...dashboard.filters.dimensions,
                        ...dashboard.filters.metrics,
                    ]
                        .map((filter) => filter.target.tableName)
                        .filter((tableName): tableName is string =>
                            Boolean(tableName),
                        ),
                ),
            ],
        };
    }

    /**
     * Visible content scope for client-use viewer / interactive_viewer.
     *
     * Everything is derived from the dashboard allow-list (Admin RPC), so spaces,
     * saved charts and explores stay consistent with the dashboards the customer
     * is allowed to open:
     * - dashboards: the allow-listed dashboards (other dashboards of the same
     *   space stay hidden)
     * - charts: the tiles of the allow-listed dashboards
     * - spaces: the spaces that hold an allow-listed dashboard (a space without
     *   an allow-listed dashboard is removed, even when it holds one of the
     *   tiles of an allow-listed dashboard)
     * - explores: the explores used by those charts
     *
     * Returns undefined when the allow-list does not apply (project is not
     * client-use or the role is not restricted). Returns a scope with empty
     * lists when the customer has no visible dashboard (fail-closed).
     */
    async getViewerContentScope(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<ViewerContentScope | undefined> {
        const cacheKey = `${projectUuid}:${user.userUuid}`;
        const cached = this.viewerScopeCache.get(cacheKey);
        if (cached !== undefined && cached.expiresAt > Date.now()) {
            return cached.promise;
        }

        const promise = this.fetchViewerContentScope(user, projectUuid);
        this.viewerScopeCache.set(cacheKey, {
            expiresAt: Date.now() + DashboardService.SCOPE_CACHE_TTL_MS,
            promise,
        });
        DashboardService.pruneViewerCache(this.viewerScopeCache);

        return promise;
    }

    /**
     * Build the visible content scope of a client-use project for a restricted
     * role. See {@link getViewerContentScope}.
     */
    private async fetchViewerContentScope(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<ViewerContentScope | undefined> {
        const allowedDashboardUuids =
            await this.getAllowedDashboardUuidsForViewer(user, projectUuid);
        if (allowedDashboardUuids === undefined) {
            return undefined;
        }

        const dashboardUuids = [...allowedDashboardUuids];
        if (dashboardUuids.length === 0) {
            return {
                dashboardUuids: [],
                chartUuids: [],
                spaceUuids: [],
                exploreNames: [],
            };
        }

        const [chartUuids, dashboardSpaceUuids, exploreNames] =
            await Promise.all([
                this.dashboardModel.getChartUuidsByDashboardUuids(
                    dashboardUuids,
                ),
                this.dashboardModel.getSpaceUuidsByDashboardUuids(
                    dashboardUuids,
                ),
                this.dashboardModel.getExploreNamesByDashboardUuids(
                    dashboardUuids,
                ),
            ]);

        // The spaces of the visible charts are visible too: a chart that the
        // user can see always belongs to a visible space.
        const chartSpaceUuids =
            await this.dashboardModel.getSpaceUuidsByChartUuids([
                ...chartUuids,
            ]);

        // A space is visible when it holds visible content, plus the
        // ancestors of those spaces so the space tree stays navigable.
        const contentSpaceUuids = new Set([
            ...dashboardSpaceUuids,
            ...chartSpaceUuids,
        ]);
        const spaceUuids = await this.spaceModel.getSpaceUuidsWithAncestors([
            ...contentSpaceUuids,
        ]);

        return {
            dashboardUuids,
            chartUuids: [...chartUuids],
            spaceUuids: [...spaceUuids],
            exploreNames: [...exploreNames],
        };
    }

    /**
     * Explain the client-use content scope of a user in a project.
     *
     * This is a read-only diagnostic: it answers "why can this user not see
     * any dashboard?". It never grants more access than the scope itself and
     * it reuses the cached allow-list, so it does not add an Admin RPC call.
     */
    async getViewerContentScopeDiagnostics(
        user: DashboardAllowListUser,
        projectUuid: string,
    ): Promise<ViewerContentScopeDiagnostics> {
        const allowList = await this.getAllowedDashboardUuidsResult(
            user,
            projectUuid,
        );
        const scope = await this.getViewerContentScope(user, projectUuid);

        const allowedDashboardUuids = allowList.uuids
            ? [...allowList.uuids]
            : [];
        const dashboardNames = await this.dashboardModel.getNamesForUuids(
            allowedDashboardUuids,
        );

        return {
            projectUuid,
            clientUseEnabled: allowList.clientUseEnabled,
            rpcConfigured: allowList.rpcConfigured,
            effectiveProjectRole: allowList.effectiveProjectRole,
            roleSource: allowList.roleSource,
            scopeApplied: allowList.uuids !== undefined,
            status: allowList.status,
            reason: describeViewerContentScopeStatus(allowList),
            mobile: allowList.mobile,
            allowedDashboardCount: allowedDashboardUuids.length,
            allowedDashboardUuids,
            allowedDashboardNames: allowedDashboardUuids
                .map((uuid) => dashboardNames[uuid])
                .filter((name): name is string => !!name),
            scopeCounts: scope
                ? {
                      dashboards: scope.dashboardUuids.length,
                      charts: scope.chartUuids.length,
                      spaces: scope.spaceUuids.length,
                      explores: scope.exploreNames.length,
                  }
                : null,
        };
    }

    /**
     * Count dashboards per space that are in the viewer allow-list.
     * Call only when the allow-list is a Set; undefined means keep the SQL count.
     * Spaces are not removed when the visible count is 0.
     */
    async getVisibleDashboardCountBySpaceUuid(
        spaceUuids: string[],
        allowedDashboardUuids: Set<string>,
    ): Promise<Map<string, number>> {
        const counts = new Map<string, number>(
            spaceUuids.map((spaceUuid) => [spaceUuid, 0]),
        );
        if (spaceUuids.length === 0) {
            return counts;
        }

        const dashboards = await this.spaceModel.getSpaceDashboards(spaceUuids);
        dashboards.forEach((dashboard) => {
            if (allowedDashboardUuids.has(dashboard.uuid)) {
                counts.set(
                    dashboard.spaceUuid,
                    (counts.get(dashboard.spaceUuid) ?? 0) + 1,
                );
            }
        });
        return counts;
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: string,
        chartUuid?: string,
        includePrivate?: boolean,
        appUuid?: string,
    ): Promise<DashboardBasicDetailsWithTileTypes[]> {
        const dashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            chartUuid,
            appUuid,
        );
        const spaceUuids = [
            ...new Set(dashboards.map((dashboard) => dashboard.spaceUuid)),
        ];
        const spaces = await Promise.all(
            spaceUuids.map((spaceUuid) =>
                this.spaceModel.getSpaceSummary(spaceUuid),
            ),
        );
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        // Get allowed dashboard UUIDs for viewer / interactive_viewer in client-use projects
        const allowedDashboardUuids =
            await this.getAllowedDashboardUuidsForViewer(user, projectUuid);

        return dashboards.filter((dashboard) => {
            const dashboardSpace = spaces.find(
                (space) => space.uuid === dashboard.spaceUuid,
            );
            const hasAbility = user.ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboardSpace?.organizationUuid,
                    projectUuid: dashboardSpace?.projectUuid,
                    isPrivate: dashboardSpace?.isPrivate,
                    access: spacesAccess[dashboard.spaceUuid] ?? [],
                }),
            );

            // Filter by RPC if viewer / interactive_viewer and client use enabled
            // If allowedDashboardUuids is undefined, skip RPC filtering (e.g., non-restricted roles or non-client-use projects)
            // If allowedDashboardUuids is defined (not undefined), it means RPC filtering is required
            // - If it's an empty Set, user has no dashboard access (RPC returned no dashboards)
            // - If it has values, check if this dashboard is in the allowed list
            // Only apply filtering if user has joined organization, otherwise let CASL check handle it
            if (allowedDashboardUuids !== undefined && isUserWithOrg(user)) {
                // Empty Set means no access at all (RPC returned no dashboards for this user)
                if (allowedDashboardUuids.size === 0) {
                    return false;
                }
                // Check if dashboard is in allowed list
                if (!allowedDashboardUuids.has(dashboard.uuid)) {
                    return false;
                }
            }

            return (
                dashboardSpace &&
                (includePrivate
                    ? hasAbility
                    : hasAbility &&
                      hasDirectAccessToSpace(user, dashboardSpace))
            );
        });
    }

    async getDashboardContexts(
        user: SessionUser,
        projectUuid: string,
        filters: {
            exploreName?: string;
            chartUuid?: string;
        },
        includePrivate: boolean = true,
    ): Promise<DashboardQueryContext[]> {
        if (!filters.exploreName && !filters.chartUuid) {
            throw new ParameterError('exploreName or chartUuid is required');
        }

        const rows = await this.dashboardModel.findDashboardContexts(
            projectUuid,
            filters,
        );
        const spaceUuids = [...new Set(rows.map((row) => row.spaceUuid))];
        const spaces = await Promise.all(
            spaceUuids.map((spaceUuid) =>
                this.spaceModel.getSpaceSummary(spaceUuid),
            ),
        );
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );
        const allowedDashboardUuids =
            await this.getAllowedDashboardUuidsForViewer(user, projectUuid);

        const filtered = rows.filter((row) => {
            const dashboardSpace = spaces.find(
                (space) => space.uuid === row.spaceUuid,
            );
            const hasAbility = user.ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboardSpace?.organizationUuid,
                    projectUuid: dashboardSpace?.projectUuid,
                    isPrivate: dashboardSpace?.isPrivate,
                    access: spacesAccess[row.spaceUuid] ?? [],
                }),
            );

            if (allowedDashboardUuids !== undefined && isUserWithOrg(user)) {
                if (allowedDashboardUuids.size === 0) {
                    return false;
                }
                if (!allowedDashboardUuids.has(row.dashboardUuid)) {
                    return false;
                }
            }

            return (
                dashboardSpace &&
                (includePrivate
                    ? hasAbility
                    : hasAbility &&
                      hasDirectAccessToSpace(user, dashboardSpace))
            );
        });

        return filtered
            .map((row) => ({
                dashboardUuid: row.dashboardUuid,
                dashboardSlug: row.dashboardSlug,
                dashboardName: row.dashboardName,
                chartUuids: row.chartUuids,
            }))
            .sort((a, b) => {
                const byName = a.dashboardName.localeCompare(b.dashboardName);
                if (byName !== 0) return byName;
                const bySlug = a.dashboardSlug.localeCompare(b.dashboardSlug);
                if (bySlug !== 0) return bySlug;
                return a.dashboardUuid.localeCompare(b.dashboardUuid);
            });
    }

    async getByIdOrSlug(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        // Optional project scoping (upstream); ignored until model supports it.
        _options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
        );

        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
        );
        const dashboard = {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };

        // Check dashboard permission for viewer / interactive_viewer in client-use projects
        // This check should happen before CASL ability check
        const allowedDashboardUuids =
            await this.getAllowedDashboardUuidsForViewer(
                user,
                dashboard.projectUuid,
            );

        // If allowedDashboardUuids is defined (not undefined), it means we need to check permissions
        // If it's an empty Set, user has no dashboard access at all
        // If it's a Set with values, check if this dashboard is in the allowed list
        // Only throw error if user has joined organization and has identity
        // Otherwise, let other logic handle it (e.g., redirect to join organization)
        if (allowedDashboardUuids !== undefined) {
            if (
                allowedDashboardUuids.size === 0 ||
                !allowedDashboardUuids.has(dashboard.uuid)
            ) {
                // Only throw permission error if user has joined organization and has identity
                // Otherwise, let the CASL check handle it
                if (isUserWithOrg(user)) {
                    throw new ForbiddenError(
                        "You don't have permission to view this dashboard. Please contact your administrator to configure dashboard access permissions.",
                    );
                }
                // If user hasn't joined organization, let the CASL check handle it
            }
        }

        // TODO: normally this would be pre-constructed (perhaps in the Service Repository or on the user object when we create the CASL type)
        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        if (auditedAbility.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.analyticsModel.addDashboardViewEvent(
            dashboard.uuid,
            user.userUuid,
        );

        this.analytics.track({
            event: 'dashboard.view',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboard.uuid,
                organizationId: dashboard.organizationUuid,
                projectId: dashboard.projectUuid,
                parametersCount: Object.keys(dashboard.parameters || {}).length,
            },
        });

        return dashboard;
    }

    static findChartsThatBelongToDashboard(
        dashboard: Pick<Dashboard, 'tiles'>,
    ): string[] {
        return dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (
                isDashboardChartTileType(tile) &&
                !!tile.properties.belongsToDashboard &&
                !!tile.properties.savedChartUuid
            ) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);
    }

    private async updateChartFieldUsage(
        projectUuid: string,
        chartExplore: Explore | ExploreError,
        chartFields: ChartFieldUpdates,
    ) {
        const fieldUsageChanges = await getChartFieldUsageChanges(
            projectUuid,
            chartExplore,
            chartFields,
            this.catalogModel.findTablesCachedExploreUuid.bind(
                this.catalogModel,
            ),
        );

        await this.catalogModel.updateFieldsChartUsage(
            projectUuid,
            fieldUsageChanges,
        );
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const getFirstSpace = async () => {
            const space = await this.spaceModel.getFirstAccessibleSpace(
                projectUuid,
                user.userUuid,
            );
            return {
                organizationUuid: space.organization_uuid,
                uuid: space.space_uuid,
                isPrivate: space.is_private,
                name: space.name,
            };
        };
        const space = dashboard.spaceUuid
            ? await this.spaceModel.get(dashboard.spaceUuid)
            : await getFirstSpace();

        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        if (dashboard.ownerUserUuid) {
            // Throws NotFoundError when the user is not an org member
            await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                space.organizationUuid,
                dashboard.ownerUserUuid,
            );
        }
        const createDashboard = {
            ...dashboard,
            slug: generateSlug(dashboard.name),
        };
        const newDashboard = await this.dashboardModel.create(
            space.uuid,
            createDashboard,
            user,
            projectUuid,
        );
        this.analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: DashboardService.getCreateEventProperties(newDashboard),
        });

        await this.projectOperationLogService.record({
            organizationUuid: space.organizationUuid,
            projectUuid,
            actor: user,
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_CREATED,
            resourceType: 'dashboard',
            resourceUuid: newDashboard.uuid,
            resourceName: newDashboard.name,
        });

        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            newDashboard.uuid,
        );

        return {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
    }

    async duplicate(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
        data: DuplicateDashboardParams,
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
        );
        const dashboard = {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };

        if (user.ability.cannot('create', subject('Dashboard', dashboard))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const newTabsMap = dashboard.tabs.map((tab) => ({
            uuid: tab.uuid,
            newUuid: uuidv4(), // generate new uuid for copied tabs
        }));

        const remapTabConfigProperty = <T>(
            property?: Record<string, T>,
        ): Record<string, T> | undefined => {
            if (!property) return property;
            return Object.entries(property).reduce<Record<string, T>>(
                (acc, [tabUuid, value]) => {
                    const newUuid = newTabsMap.find(
                        (tabMap) => tabMap.uuid === tabUuid,
                    )?.newUuid;
                    if (!newUuid) return acc;
                    return {
                        ...acc,
                        [newUuid]: value,
                    };
                },
                {},
            );
        };

        const remapDashboardConfig = (
            config?: DashboardConfig,
        ): DashboardConfig | undefined => {
            if (!config) return config;
            return {
                ...config,
                tabFilterEnabled: remapTabConfigProperty(
                    config.tabFilterEnabled,
                ),
                showTabAddFilterButton: remapTabConfigProperty(
                    config.showTabAddFilterButton,
                ),
            };
        };

        const newTabs: DashboardTab[] = dashboard.tabs.map((tab) => ({
            ...tab,
            uuid: newTabsMap.find((tabMap) => tabMap.uuid === tab.uuid)
                ?.newUuid!,
        }));

        const duplicatedDashboard = {
            ...dashboard,
            tiles: dashboard.tiles.map((tile) => ({
                ...tile,
                tabUuid: newTabsMap.find((tab) => tab.uuid === tile.tabUuid)
                    ?.newUuid!,
            })),
            description: data.dashboardDesc,
            name: data.dashboardName,
            slug: generateSlug(dashboard.name),
            tabs: newTabs,
            config: remapDashboardConfig(dashboard.config),
        };

        const newDashboard = await this.dashboardModel.create(
            dashboard.spaceUuid,
            duplicatedDashboard,
            user,
            projectUuid,
        );

        if (hasChartsInDashboard(newDashboard)) {
            const updatedTiles = await Promise.all(
                newDashboard.tiles.map(async (tile) => {
                    if (
                        isDashboardChartTileType(tile) &&
                        tile.properties.savedChartUuid
                    ) {
                        const chartInDashboard = await this.savedChartModel.get(
                            tile.properties.savedChartUuid,
                        );
                        const duplicatedChart =
                            await this.savedChartModel.create(
                                newDashboard.projectUuid,
                                user.userUuid,
                                {
                                    ...chartInDashboard,
                                    spaceUuid: null,
                                    dashboardUuid: newDashboard.uuid,
                                    updatedByUser: {
                                        userUuid: user.userUuid,
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                    },
                                    slug: generateSlug(
                                        `${
                                            chartInDashboard.name
                                        } ${Date.now()}-${tile.uuid}`,
                                    ),
                                },
                            );
                        const cachedExplore =
                            await this.projectModel.getExploreFromCache(
                                projectUuid,
                                duplicatedChart.tableName,
                            );

                        try {
                            await this.updateChartFieldUsage(
                                projectUuid,
                                cachedExplore,
                                {
                                    oldChartFields: {
                                        metrics: [],
                                        dimensions: [],
                                    },
                                    newChartFields: {
                                        metrics:
                                            duplicatedChart.metricQuery.metrics,
                                        dimensions:
                                            duplicatedChart.metricQuery
                                                .dimensions,
                                    },
                                },
                            );
                        } catch (error) {
                            this.logger.error(
                                `Error updating chart field usage for chart ${duplicatedChart.uuid}`,
                                error,
                            );
                        }

                        this.analytics.track({
                            event: 'saved_chart.created',
                            userId: user.userUuid,
                            properties: {
                                ...SavedChartService.getCreateEventProperties(
                                    duplicatedChart,
                                ),
                                dashboardId:
                                    duplicatedChart.dashboardUuid ?? undefined,
                                duplicated: true,
                                virtualViewId:
                                    cachedExplore?.type === ExploreType.VIRTUAL
                                        ? cachedExplore.name
                                        : undefined,
                            },
                        });

                        return {
                            ...tile,
                            uuid: uuidv4(),
                            properties: {
                                ...tile.properties,
                                savedChartUuid: duplicatedChart.uuid,
                            },
                        };
                    }
                    return tile;
                }),
            );

            await this.dashboardModel.addVersion(
                newDashboard.uuid,
                {
                    tiles: [...updatedTiles],
                    filters: newDashboard.filters,
                    tabs: newTabs,
                    parameters: newDashboard.parameters,
                    config: newDashboard.config,
                },
                user,
                projectUuid,
            );
        }

        const dashboardProperties =
            DashboardService.getCreateEventProperties(newDashboard);
        this.analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: { ...dashboardProperties, duplicated: true },
        });

        await this.projectOperationLogService.record({
            organizationUuid: dashboard.organizationUuid,
            projectUuid,
            actor: user,
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_DUPLICATED,
            resourceType: 'dashboard',
            resourceUuid: newDashboard.uuid,
            resourceName: newDashboard.name,
            summary: {
                sourceDashboardUuid: dashboard.uuid,
                sourceDashboardName: dashboard.name,
            },
        });

        this.analytics.track({
            event: 'duplicated_dashboard_created',
            userId: user.userUuid,
            properties: {
                ...dashboardProperties,
                newDashboardId: newDashboard.uuid,
                duplicateOfDashboardId: dashboard.uuid,
            },
        });

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
            newDashboard.uuid,
        );

        return {
            ...updatedNewDashboard,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
    }

    async update(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        const existingDashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
        );

        const canUpdateDashboardInCurrentSpace = user.ability.can(
            'update',
            subject('Dashboard', {
                ...(await this.spaceModel.getSpaceSummary(
                    existingDashboardDao.spaceUuid,
                )),
                access: await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    existingDashboardDao.spaceUuid,
                ),
            }),
        );

        if (!canUpdateDashboardInCurrentSpace) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (isDashboardUnversionedFields(dashboard)) {
            if (dashboard.spaceUuid) {
                const canUpdateDashboardInNewSpace = user.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...(await this.spaceModel.getSpaceSummary(
                            dashboard.spaceUuid,
                        )),
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            dashboard.spaceUuid,
                        ),
                    }),
                );
                if (!canUpdateDashboardInNewSpace) {
                    throw new ForbiddenError(
                        "You don't have access to the space this dashboard is being moved to",
                    );
                }
            }

            if (dashboard.ownerUserUuid) {
                // Throws NotFoundError when the user is not an org member
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    existingDashboardDao.organizationUuid,
                    dashboard.ownerUserUuid,
                );
            }

            const updatedDashboard = await this.dashboardModel.update(
                existingDashboardDao.uuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
                    spaceUuid: dashboard.spaceUuid,
                    ownerUserUuid: dashboard.ownerUserUuid,
                },
            );

            this.analytics.track({
                event: 'dashboard.updated',
                userId: user.userUuid,
                properties: {
                    dashboardId: updatedDashboard.uuid,
                    projectId: updatedDashboard.projectUuid,
                    tilesCount: updatedDashboard.tiles.length,
                    chartTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                    ).length,
                    markdownTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.MARKDOWN,
                    ).length,
                    loomTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.LOOM,
                    ).length,
                    filtersCount:
                        updatedDashboard.filters.dimensions.length +
                        updatedDashboard.filters.metrics.length,
                },
            });
        }

        if (isDashboardVersionedFields(dashboard)) {
            const dashboardTileTypes = Array.from(
                new Set(dashboard.tiles.map((t) => t.type)),
            );

            const updatedDashboard = await this.dashboardModel.addVersion(
                existingDashboardDao.uuid,
                {
                    tiles: dashboard.tiles,
                    filters: dashboard.filters,
                    parameters: dashboard.parameters,
                    tabs: dashboard.tabs || [],
                    config: dashboard.config,
                },
                user,
                existingDashboardDao.projectUuid,
            );
            this.analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                properties:
                    DashboardService.getCreateEventProperties(updatedDashboard),
            });
            await this.deleteOrphanedChartsInDashboards(
                user,
                existingDashboardDao.uuid,
            );
        }

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
            existingDashboardDao.uuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            updatedNewDashboard.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            updatedNewDashboard.spaceUuid,
        );

        const spaceMoved =
            isDashboardUnversionedFields(dashboard) &&
            !!dashboard.spaceUuid &&
            dashboard.spaceUuid !== existingDashboardDao.spaceUuid;

        const baseLog = {
            organizationUuid: existingDashboardDao.organizationUuid,
            projectUuid: existingDashboardDao.projectUuid,
            actor: user,
            resourceType: 'dashboard' as const,
            resourceUuid: existingDashboardDao.uuid,
            resourceName: updatedNewDashboard.name,
        };

        if (spaceMoved) {
            await this.projectOperationLogService.record({
                ...baseLog,
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_MOVED,
                summary: {
                    previousSpaceUuid: existingDashboardDao.spaceUuid,
                    newSpaceUuid: dashboard.spaceUuid,
                },
            });
        }

        const clientEvents =
            'clientEvents' in dashboard
                ? (dashboard as UpdateDashboard).clientEvents
                : undefined;
        const hasClientEvents =
            Array.isArray(clientEvents) && clientEvents.length > 0;

        type MergedOperationChange = {
            action: string;
            resourceType?: string;
            resourceUuid?: string | null;
            resourceName?: string | null;
            summary?: Record<string, unknown> | null;
        };

        const mergedChanges: MergedOperationChange[] = [];

        if (hasClientEvents) {
            for (const event of clientEvents!) {
                mergedChanges.push({
                    action: String(event.action),
                    resourceType: event.resourceType,
                    resourceUuid: event.resourceUuid,
                    resourceName: event.resourceName,
                    summary: {
                        ...(event.summary ?? {}),
                        source: 'client',
                        schemaVersion: event.schemaVersion,
                        scope: event.scope,
                        tabUuid: event.tabUuid,
                        tabName: event.tabName,
                        changeKind: event.changeKind,
                        occurredAt: event.occurredAt,
                    },
                });
            }
        }

        if (isDashboardVersionedFields(dashboard)) {
            let fineEvents = diffDashboardVersionedContent(
                existingDashboardDao,
                {
                    filters: dashboard.filters ?? existingDashboardDao.filters,
                    tiles: dashboard.tiles ?? existingDashboardDao.tiles,
                    tabs: dashboard.tabs ?? existingDashboardDao.tabs ?? [],
                    parameters:
                        dashboard.parameters ?? existingDashboardDao.parameters,
                    config: dashboard.config ?? existingDashboardDao.config,
                },
            );

            // FE semantic events cover filters; also drop incidental
            // config/parameters "dashboard.updated" noise on the same save.
            if (hasClientEvents) {
                fineEvents = fineEvents.filter(
                    (event) =>
                        !String(event.action).startsWith(
                            'dashboard.filters.',
                        ) &&
                        event.action !==
                            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_UPDATED,
                );
            }

            for (const event of fineEvents) {
                mergedChanges.push({
                    action: String(event.action),
                    summary: {
                        ...(event.summary ?? {}),
                        source: 'diff',
                    },
                });
            }

            const dashboardContext = {
                dashboardUuid: baseLog.resourceUuid,
                dashboardName: baseLog.resourceName,
            };

            if (mergedChanges.length === 1) {
                const only = mergedChanges[0];
                await this.projectOperationLogService.record({
                    ...baseLog,
                    action: only.action,
                    resourceType: only.resourceType ?? baseLog.resourceType,
                    resourceUuid: only.resourceUuid ?? baseLog.resourceUuid,
                    resourceName: only.resourceName ?? baseLog.resourceName,
                    summary: {
                        ...(only.summary ?? {}),
                        ...dashboardContext,
                    },
                });
            } else if (mergedChanges.length > 1) {
                await this.projectOperationLogService.record({
                    ...baseLog,
                    action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_UPDATED,
                    summary: {
                        kind: 'save',
                        changeCount: mergedChanges.length,
                        changeKinds: mergedChanges.map((c) => c.action),
                        changes: mergedChanges.map((change) => ({
                            ...change,
                            summary: {
                                ...(change.summary ?? {}),
                                ...dashboardContext,
                            },
                        })),
                        ...dashboardContext,
                    },
                });
            }
        } else if (isDashboardUnversionedFields(dashboard) && !spaceMoved) {
            await this.projectOperationLogService.record({
                ...baseLog,
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_UPDATED,
                summary: {
                    kind: 'unversioned',
                    name: dashboard.name,
                    description: dashboard.description,
                    ownerUserUuid: dashboard.ownerUserUuid,
                },
            });
        }

        return {
            ...updatedNewDashboard,
            isPrivate: space.isPrivate,
            access,
        };
    }

    async togglePinning(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<TogglePinnedItemInfo> {
        const existingDashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            existingDashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            existingDashboardDao.spaceUuid,
        );
        const existingDashboard = {
            ...existingDashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };

        const { projectUuid, organizationUuid, pinnedListUuid, spaceUuid } =
            existingDashboard;
        if (
            user.ability.cannot(
                'manage',
                subject('PinnedItems', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            user.ability.cannot('view', subject('Dashboard', existingDashboard))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid,
                dashboardUuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                dashboardUuid,
            });
        }

        const pinnedList = await this.pinnedListModel.getPinnedListAndItems(
            existingDashboard.projectUuid,
        );

        this.analytics.track({
            event: 'pinned_list.updated',
            userId: user.userUuid,
            properties: {
                projectId: existingDashboard.projectUuid,
                organizationId: existingDashboard.organizationUuid,
                location: 'homepage',
                pinnedListId: pinnedList.pinnedListUuid,
                pinnedItems: pinnedList.items,
            },
        });

        return {
            projectUuid,
            spaceUuid,
            pinnedListUuid: pinnedList.pinnedListUuid,
            isPinned: !!pinnedList.items.find(
                (item) => item.dashboardUuid === dashboardUuid,
            ),
        };
    }

    /**
     * Summary of dashboards owned by a user across all projects, used by the
     * offboarding flow when deleting an organization member. The caller must
     * be able to manage dashboards in every project where the user owns any.
     */
    async getUserDashboardsSummary(
        user: SessionUser,
        targetUserUuid: UUID,
    ): Promise<UserDashboardsSummary> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = user;

        // Throws NotFoundError when the user is not an org member
        const targetMember =
            await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                organizationUuid,
                targetUserUuid,
            );

        const summary = await this.dashboardModel.getDashboardsSummaryByOwner(
            targetUserUuid,
        );

        const projectsWithoutPermission = summary.byProject
            .filter(
                (project) =>
                    !user.ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: targetMember.organizationUuid,
                            projectUuid: project.projectUuid,
                        }),
                    ),
            )
            .map((project) => project.projectName);

        if (projectsWithoutPermission.length > 0) {
            throw new ForbiddenError(
                `You do not have permission to manage dashboards in: ${projectsWithoutPermission.join(
                    ', ',
                )}`,
            );
        }

        return summary;
    }

    /**
     * Transfers ownership of all dashboards owned by one user to another,
     * used to keep ownership continuity when deleting an organization member.
     */
    async reassignUserDashboards(
        user: SessionUser,
        fromUserUuid: UUID,
        newOwnerUserUuid: UUID,
    ): Promise<{ reassignedCount: number }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = user;

        // Also validates fromUser membership and the caller's per-project access
        const summary = await this.getUserDashboardsSummary(user, fromUserUuid);

        if (summary.totalCount === 0) {
            return { reassignedCount: 0 };
        }

        // Throws NotFoundError when the new owner is not an org member
        await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
            organizationUuid,
            newOwnerUserUuid,
        );

        const reassignedCount = await this.dashboardModel.updateOwnerByUser(
            fromUserUuid,
            newOwnerUserUuid,
            summary.byProject.map((project) => project.projectUuid),
        );

        this.analytics.track({
            event: 'dashboard.ownership_reassigned',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                fromUserUuid,
                newOwnerUserUuid,
                reassignedCount,
            },
        });

        return { reassignedCount };
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: string,
        dashboards: UpdateMultipleDashboards[],
    ): Promise<Dashboard[]> {
        const userHasAccessToDashboards = await Promise.all(
            dashboards.map(async (dashboardToUpdate) => {
                const dashboard = await this.dashboardModel.getByIdOrSlug(
                    dashboardToUpdate.uuid,
                );
                const canUpdateDashboardInCurrentSpace = user.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...(await this.spaceModel.getSpaceSummary(
                            dashboard.spaceUuid,
                        )),
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            dashboard.spaceUuid,
                        ),
                    }),
                );
                const canUpdateDashboardInNewSpace = user.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...(await this.spaceModel.getSpaceSummary(
                            dashboardToUpdate.spaceUuid,
                        )),
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            dashboardToUpdate.spaceUuid,
                        ),
                    }),
                );
                return (
                    canUpdateDashboardInCurrentSpace &&
                    canUpdateDashboardInNewSpace
                );
            }),
        );

        if (userHasAccessToDashboards.some((hasAccess) => !hasAccess)) {
            throw new ForbiddenError(
                "You don't have access to some of the dashboards you are trying to update.",
            );
        }

        this.analytics.track({
            event: 'dashboard.updated_multiple',
            userId: user.userUuid,
            properties: {
                dashboardIds: dashboards.map((dashboard) => dashboard.uuid),
                projectId: projectUuid,
            },
        });

        const updatedDashboards = await this.dashboardModel.updateMultiple(
            projectUuid,
            dashboards,
        );

        const { organizationUuid: projectOrganizationUuid } =
            await this.projectModel.get(projectUuid);
        await Promise.all(
            updatedDashboards.map((dashboard) =>
                this.projectOperationLogService.record({
                    organizationUuid:
                        dashboard.organizationUuid ?? projectOrganizationUuid,
                    projectUuid,
                    actor: user,
                    action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_UPDATED,
                    resourceType: 'dashboard',
                    resourceUuid: dashboard.uuid,
                    resourceName: dashboard.name,
                }),
            ),
        );

        const updatedDashboardsWithSpacesAccess = updatedDashboards.map(
            async (dashboard) => {
                const dashboardSpace = await this.spaceModel.getSpaceSummary(
                    dashboard.spaceUuid,
                );
                const dashboardSpaceAccess =
                    await this.spaceModel.getUserSpaceAccess(
                        user.userUuid,
                        dashboard.spaceUuid,
                    );
                return {
                    ...dashboard,
                    isPrivate: dashboardSpace.isPrivate,
                    access: dashboardSpaceAccess,
                };
            },
        );

        return Promise.all(updatedDashboardsWithSpacesAccess);
    }

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        const dashboardToDelete = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );
        const { organizationUuid, projectUuid, spaceUuid, tiles } =
            dashboardToDelete;
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        if (
            user.ability.cannot(
                'delete',
                subject('Dashboard', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (hasChartsInDashboard(dashboardToDelete)) {
            try {
                await Promise.all(
                    tiles.map(async (tile) => {
                        if (
                            isDashboardChartTileType(tile) &&
                            tile.properties.belongsToDashboard &&
                            tile.properties.savedChartUuid
                        ) {
                            const chartInDashboard =
                                await this.savedChartModel.get(
                                    tile.properties.savedChartUuid,
                                );

                            const cachedExplore =
                                await this.projectModel.getExploreFromCache(
                                    projectUuid,
                                    chartInDashboard.tableName,
                                );

                            await this.updateChartFieldUsage(
                                projectUuid,
                                cachedExplore,
                                {
                                    oldChartFields: {
                                        metrics:
                                            chartInDashboard.metricQuery
                                                .metrics,
                                        dimensions:
                                            chartInDashboard.metricQuery
                                                .dimensions,
                                    },
                                    newChartFields: {
                                        metrics: [],
                                        dimensions: [],
                                    },
                                },
                            );
                        }
                    }),
                );
            } catch (error) {
                this.logger.error(
                    `Error updating chart field usage for dashboard ${dashboardUuid}`,
                    error,
                );
            }
        }

        const deletedDashboard = await this.dashboardModel.delete(
            dashboardUuid,
        );

        this.analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            properties: {
                dashboardId: deletedDashboard.uuid,
                projectId: deletedDashboard.projectUuid,
            },
        });

        await this.projectOperationLogService.record({
            organizationUuid,
            projectUuid,
            actor: user,
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_DELETED,
            resourceType: 'dashboard',
            resourceUuid: deletedDashboard.uuid,
            resourceName: dashboardToDelete.name,
        });
    }

    async getSchedulers(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        await this.checkCreateScheduledDeliveryAccess(user, dashboardUuid);
        return this.schedulerModel.getDashboardSchedulers(dashboardUuid);
    }

    /**
     * Schedule a one-click dashboard content export (CSV or XLSX zip/workbook).
     * Image export continues to use the legacy /export screenshot route.
     */
    async scheduleExportContent(
        user: SessionUser,
        dashboardUuid: string,
        data: ExportContentRequest,
    ): Promise<{ jobId: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        if (
            data.format !== SchedulerFormat.CSV &&
            data.format !== SchedulerFormat.XLSX
        ) {
            throw new ParameterError('Unsupported export format');
        }

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const options: SchedulerCsvOptions = {
            formatted: data.options?.formatted ?? true,
            limit: data.options?.limit ?? 'table',
            xlsxFileLayout: data.options?.xlsxFileLayout,
        };

        const payload: ExportContentPayload = {
            resourceType: 'dashboard',
            resourceUuid: dashboard.uuid,
            format: data.format,
            options,
            dashboardFilters: data.dashboardFilters,
            dateZoomGranularity: data.dateZoomGranularity,
            customViewportWidth: data.customViewportWidth,
            selectedTabs: data.selectedTabs ?? null,
            parameters: data.parameters,
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            userUuid: user.userUuid,
            schedulerUuid: undefined,
        };

        const { jobId } = await this.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.EXPORT_CONTENT,
            payload,
        );

        return { jobId };
    }

    async createScheduler(
        user: SessionUser,
        dashboardUuid: string,
        newScheduler: CreateSchedulerAndTargetsWithoutIds,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        if (!isValidFrequency(newScheduler.cron)) {
            throw new ParameterError(
                'Frequency not allowed, custom input is limited to hourly',
            );
        }

        if (!isValidTimezone(newScheduler.timezone)) {
            throw new ParameterError('Timezone string is not valid');
        }

        const dashboard = await this.checkCreateScheduledDeliveryAccess(
            user,
            dashboardUuid,
        );
        const { projectUuid, organizationUuid } = dashboard;
        assertDashboardSchedulerFilterRequirementsMet({
            savedDashboardFilters: dashboard.filters,
            // Dashboard create path always carries optional dimension overrides
            schedulerFilters: (
                newScheduler as { filters?: DashboardFilterRule[] }
            ).filters,
        });

        const scheduler = await this.schedulerModel.createScheduler({
            ...newScheduler,
            createdBy: user.userUuid,
            dashboardUuid,
            savedChartUuid: null,
        });
        const createSchedulerData: SchedulerDashboardUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.created',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                resourceType: isChartScheduler(scheduler)
                    ? 'chart'
                    : 'dashboard',
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
                resourceId: isChartScheduler(scheduler)
                    ? scheduler.savedChartUuid
                    : scheduler.dashboardUuid,
                targets:
                    scheduler.format === SchedulerFormat.GSHEETS
                        ? []
                        : scheduler.targets.map(getSchedulerTargetType),
                filtersUpdatedNum:
                    isDashboardScheduler(scheduler) && scheduler.filters
                        ? scheduler.filters.length
                        : 0,
                timeZone: scheduler.timezone,
                includeLinks: scheduler.includeLinks,
            },
        };
        this.analytics.track(createSchedulerData);

        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        const { schedulerTimezone: defaultTimezone } =
            await this.projectModel.get(projectUuid);

        await this.schedulerClient.generateDailyJobsForScheduler(
            scheduler,
            {
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
            },
            defaultTimezone,
        );
        return scheduler;
    }

    private async checkCreateScheduledDeliveryAccess(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
        );
        const dashboard = {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
        const { organizationUuid, projectUuid } = dashboard;
        if (
            user.ability.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (user.ability.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        return {
            ...dashboard,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
    }

    private async hasAccess(
        action: AbilityAction,
        actor: {
            user: SessionUser;
            projectUuid: string;
        },
        resource: {
            dashboardUuid: string;
            spaceUuid?: string;
        },
    ) {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            resource.dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            dashboard.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            actor.user.userUuid,
            dashboard.spaceUuid,
        );

        const isActorAllowedToPerformAction = actor.user.ability.can(
            action,
            subject('Dashboard', {
                organizationUuid: actor.user.organizationUuid,
                projectUuid: actor.projectUuid,
                isPrivate: space.isPrivate,
                access: spaceAccess,
            }),
        );

        if (!isActorAllowedToPerformAction) {
            throw new ForbiddenError(
                `You don't have access to ${action} this dashboard`,
            );
        }

        if (resource.spaceUuid && dashboard.spaceUuid !== resource.spaceUuid) {
            const newSpace = await this.spaceModel.getSpaceSummary(
                resource.spaceUuid,
            );
            const newSpaceAccess = await this.spaceModel.getUserSpaceAccess(
                actor.user.userUuid,
                resource.spaceUuid,
            );

            const isActorAllowedToPerformActionInNewSpace =
                actor.user.ability.can(
                    action,
                    subject('Dashboard', {
                        organizationUuid: newSpace.organizationUuid,
                        projectUuid: actor.projectUuid,
                        isPrivate: newSpace.isPrivate,
                        access: newSpaceAccess,
                    }),
                );

            if (!isActorAllowedToPerformActionInNewSpace) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this dashboard in the new space`,
                );
            }
        }
    }

    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: dashboardUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ) {
        if (!targetSpaceUuid) {
            throw new ParameterError(
                'You cannot move a dashboard outside of a space',
            );
        }

        if (checkForAccess) {
            await this.hasAccess(
                'update',
                { user, projectUuid },
                { dashboardUuid, spaceUuid: targetSpaceUuid },
            );
        }
        await this.dashboardModel.moveToSpace(
            {
                projectUuid,
                itemUuid: dashboardUuid,
                targetSpaceUuid,
            },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'dashboard.moved',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    dashboardId: dashboardUuid,
                    targetSpaceId: targetSpaceUuid,
                },
            });
        }
    }

    async createDashboardWithCharts(
        user: SessionUser,
        projectUuid: string,
        data: CreateDashboardWithCharts,
    ): Promise<Dashboard> {
        // 1. Create empty dashboard
        const emptyDashboard: CreateDashboard = {
            name: data.name,
            description: data.description,
            spaceUuid: data.spaceUuid,
            tiles: [],
            tabs: [],
        };

        // Permissions are checked in the create method
        const dashboard = await this.create(user, projectUuid, emptyDashboard);

        try {
            const chartPromises = data.charts.map(
                (chartData: CreateSavedChart) => {
                    const chartDataWithDashboard: CreateSavedChart = {
                        ...chartData,
                        dashboardUuid: dashboard.uuid,
                        spaceUuid: undefined,
                    };

                    return this.savedChartService.create(
                        user,
                        projectUuid,
                        chartDataWithDashboard,
                    );
                },
            );

            const savedCharts = await Promise.all(chartPromises);

            const tiles = createTwoColumnTiles(
                savedCharts,
                dashboard.tabs?.[0]?.uuid,
            );

            const updateFields: DashboardVersionedFields = {
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                tiles,
                tabs: dashboard.tabs || [],
            };

            await this.update(user, dashboard.uuid, updateFields);

            return await this.getByIdOrSlug(user, dashboard.uuid);
        } catch (error) {
            try {
                await this.delete(user, dashboard.uuid);
            } catch (deleteError) {
                this.logger.error(
                    'Failed to cleanup dashboard after creation error',
                    deleteError,
                );
            }
            throw error;
        }
    }

    /**
     * (comment encoding fixed)
     */
    private async getUserProjectRole(
        user: SessionUser,
        projectId: number,
        organizationId: number,
        projectUuid: string,
    ): Promise<ProjectMemberRole | null> {
        const db = this.userDashboardCategoryModel.getDatabase();

        // Get user's userId (needed for group_memberships query)
        const userRecord = await db
            .from('users')
            .where('user_uuid', user.userUuid)
            .select('user_id')
            .first();

        if (!userRecord) {
            return null;
        }

        // Get user's project role from direct membership
        const directMembership = await db
            .from('project_memberships')
            .where('project_memberships.project_id', projectId)
            .where('project_memberships.user_id', userRecord.user_id)
            .select('project_memberships.role')
            .first();

        // Get user's project role from group membership
        const groupMembership = await db
            .from('group_memberships')
            .innerJoin(
                'project_group_access',
                'project_group_access.group_uuid',
                'group_memberships.group_uuid',
            )
            .where('group_memberships.organization_id', organizationId)
            .where('group_memberships.user_id', userRecord.user_id)
            .where('project_group_access.project_uuid', projectUuid)
            .select('project_group_access.role')
            .first();

        // Get user's organization role (fallback if no project-level role)
        const orgMembership = await db
            .from('organization_memberships')
            .where('organization_memberships.organization_id', organizationId)
            .where('organization_memberships.user_id', userRecord.user_id)
            .select('organization_memberships.role')
            .first();

        // Determine user's role:
        // 1. Direct project membership (highest priority)
        // 2. Group membership
        // 3. Organization role converted to project role (fallback)
        let userRole = directMembership?.role || groupMembership?.role;
        if (!userRole && orgMembership?.role) {
            userRole = convertOrganizationRoleToProjectRole(
                orgMembership.role as OrganizationMemberRole,
            );
        }

        return userRole || null;
    }
}

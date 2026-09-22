import { subject } from '@casl/ability';
import { PROJECT_OPERATION_LOG_ACTIONS } from '@lightdash/common';
import {
    AbilityAction,
    BulkActionable,
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
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    TogglePinnedItemInfo,
    UpdateDashboard,
    UpdateMultipleDashboards,
    convertOrganizationRoleToProjectRole,
    generateSlug,
    hasChartsInDashboard,
    isChartScheduler,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    SCHEDULER_TASKS,
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
    type SchedulerCsvOptions,
    type UserDashboardsSummary,
    type UUID,
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
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { ProjectOperationLogService } from '../ProjectOperationLogService/ProjectOperationLogService';
import { diffDashboardVersionedContent } from './dashboardOperationLogDiff';
import { hasDirectAccessToSpace } from '../SpaceService/SpaceService';

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

export class DashboardService
    extends BaseService
    implements BulkActionable<Knex>
{
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
     * Get allowed dashboard UUIDs for viewer users in customer use projects
     * Returns undefined if filtering is not needed, or a Set of allowed dashboard UUIDs
     * Can be used for a single project or multiple projects
     */
    async getAllowedDashboardUuidsForViewer(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Set<string> | undefined> {
        // If this is an API token request, skip RPC filtering and let CASL handle permissions
        if (user.isApiTokenRequest) {
            this.logger.warn(
                `API token request detected for user ${user.userUuid} in project ${projectUuid}, skipping RPC filtering.`,
            );
            return undefined;
        }

        const db = this.userDashboardCategoryModel.getDatabase();

        // Get project info
        const project = await db
            .from('projects')
            .where('project_uuid', projectUuid)
            .select('project_id', 'is_customer_use', 'organization_id')
            .first();
        if (!project) {
            this.logger.warn(
                `Project ${projectUuid} not found in projects table, skipping RPC filtering`,
            );
            return undefined;
        }

        const isCustomerUse = project.is_customer_use ?? false;
        if (!isCustomerUse) {
            this.logger.warn(
                `Project ${projectUuid} is not in customer use mode, skipping RPC filtering`,
            );
            return undefined;
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
            return undefined;
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
        if (!userRole && orgMembership?.role) {
            userRole = convertOrganizationRoleToProjectRole(
                orgMembership.role as OrganizationMemberRole,
            );
        }

        const isViewer = userRole === ProjectMemberRole.VIEWER;

        // Only filter if user is viewer and project has customer use enabled
        if (!isViewer) {
            this.logger.warn(
                `User ${user.userUuid} is ${userRole} in project ${projectUuid}, skipping RPC filtering`,
            );
            return undefined;
        }

        // For VIEWER users in customer use mode, RPC interface is required
        // If user.email is missing, cannot verify permissions via RPC
        // Return empty Set to filter out all dashboards (cannot verify = no access)
        if (!user.email) {
            this.logger.warn(
                `User ${user.userUuid} (VIEWER) has no email in customer use project ${projectUuid}, filtering out all dashboards.`,
            );
            return new Set<string>();
        }

        // Extract mobile number from email (remove @ and everything after it)
        const normalizedEmail = user.email.trim().toLowerCase();
        const mobile = normalizedEmail.split('@')[0];

        if (!mobile) {
            this.logger.warn(
                `User ${user.userUuid} (VIEWER) email ${normalizedEmail} has no mobile part in customer use project ${projectUuid}, skipping RPC filtering`,
            );
            return undefined;
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

            return allowedUuids;
        } catch (error) {
            this.logger.error(
                `Error fetching dashboards by mobile ${mobile}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            // On error, return empty Set to filter out all dashboards
            // For VIEWER users in customer use mode, RPC interface is required
            return new Set<string>();
        }
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

        // Get allowed dashboard UUIDs for viewer users in customer use projects
        // API token requests are handled inside getAllowedDashboardUuidsForViewer
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

            // Filter by RPC interface if viewer and customer use enabled
            // If allowedDashboardUuids is undefined, skip RPC filtering (e.g., API token users without email, non-VIEWER users, or non-customer-use projects)
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

        // Check dashboard permission for viewer users in customer use projects
        // This check should happen before CASL ability check
        // API token requests are handled inside getAllowedDashboardUuidsForViewer
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
        } else if (
            isDashboardUnversionedFields(dashboard) &&
            !spaceMoved
        ) {
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

        const summary =
            await this.dashboardModel.getDashboardsSummaryByOwner(
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

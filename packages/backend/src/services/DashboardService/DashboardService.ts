import { subject } from '@casl/ability';
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
    type ChartFieldUpdates,
    type DashboardBasicDetailsWithTileTypes,
    type DashboardConfig,
    type DuplicateDashboardParams,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import {
    CreateDashboardOrVersionEvent,
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { getChartFieldUsageChanges } from '../../models/CatalogModel/utils';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserDashboardCategoryModel } from '../../models/UserDashboardCategoryModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { createTwoColumnTiles } from '../../utils/dashboardTileUtils';
import { BaseService } from '../BaseService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
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
        const db = this.userDashboardCategoryModel.getDatabase();

        // Get project info
        const project = await db
            .from('projects')
            .where('project_uuid', projectUuid)
            .select('project_id', 'is_customer_use', 'organization_id')
            .first();
        if (!project) {
            return undefined;
        }

        const isCustomerUse = project.is_customer_use ?? false;
        if (!isCustomerUse) {
            return undefined;
        }

        // Get user's userId (needed for group_memberships query)
        const userRecord = await db
            .from('users')
            .where('user_uuid', user.userUuid)
            .select('user_id')
            .first();

        if (!userRecord) {
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
            return undefined;
        }

        // Get allowed dashboards from user_dashboard_category table
        // If user.email is missing, return empty Set to filter out all dashboards
        if (!user.email) {
            this.logger.warn(
                `User ${user.userUuid} has no email, filtering out all dashboards for project ${projectUuid}`,
            );
            return new Set<string>();
        }

        const normalizedEmail = user.email.trim().toLowerCase();
        const userCategories = await this.userDashboardCategoryModel.find({
            email: normalizedEmail,
        });

        const allowedUuids = new Set(
            userCategories.map((cat) => cat.dashboard_uuid).filter(Boolean),
        );

        // If no matching categories found, return empty Set to filter out all dashboards
        if (allowedUuids.size === 0) {
            this.logger.warn(
                `No dashboard categories found for user ${normalizedEmail} in project ${projectUuid}, filtering out all dashboards`,
            );
        }

        return allowedUuids;
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: string,
        chartUuid?: string,
        includePrivate?: boolean,
    ): Promise<DashboardBasicDetailsWithTileTypes[]> {
        const dashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            chartUuid,
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

            // Filter by user_dashboard_category if viewer and customer use enabled
            // If allowedDashboardUuids is an empty Set, all dashboards will be filtered out
            // (which is correct: if no records in user_dashboard_category, user sees nothing)
            if (
                allowedDashboardUuids &&
                !allowedDashboardUuids.has(dashboard.uuid)
            ) {
                return false;
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

    async getByIdOrSlug(
        user: SessionUser,
        dashboardUuidOrSlug: string,
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
                        tile.properties.belongsToDashboard &&
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
                                        } ${Date.now()}`,
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

            const updatedDashboard = await this.dashboardModel.update(
                existingDashboardDao.uuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
                    spaceUuid: dashboard.spaceUuid,
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
    }

    async getSchedulers(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        await this.checkCreateScheduledDeliveryAccess(user, dashboardUuid);
        return this.schedulerModel.getDashboardSchedulers(dashboardUuid);
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

        const { projectUuid, organizationUuid } =
            await this.checkCreateScheduledDeliveryAccess(user, dashboardUuid);
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
}

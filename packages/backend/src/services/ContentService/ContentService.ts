import { subject } from '@casl/ability';
import {
    ApiContentActionBody,
    ApiContentBulkActionBody,
    assertUnreachable,
    ChartSourceType,
    ContentActionMove,
    ContentType,
    ForbiddenError,
    isUserWithOrg,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotExistsError,
    SessionUser,
    SummaryContent,
    type ViewerContentScope,
} from '@lightdash/common';
import { intersection } from 'lodash';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import {
    ContentArgs,
    ContentFilters,
} from '../../models/ContentModel/ContentModelTypes';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SavedSqlService } from '../SavedSqlService/SavedSqlService';
import {
    hasViewAccessToSpace,
    SpaceService,
} from '../SpaceService/SpaceService';

type ContentServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    contentModel: ContentModel;
    spaceModel: SpaceModel;
    spaceService: SpaceService;
    dashboardService: DashboardService;
    savedChartService: SavedChartService;
    savedSqlService: SavedSqlService;
};

export class ContentService extends BaseService {
    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    contentModel: ContentModel;

    spaceModel: SpaceModel;

    spaceService: SpaceService;

    dashboardService: DashboardService;

    savedChartService: SavedChartService;

    savedSqlService: SavedSqlService;

    constructor(args: ContentServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.contentModel = args.contentModel;

        this.spaceModel = args.spaceModel;

        this.spaceService = args.spaceService;
        this.dashboardService = args.dashboardService;
        this.savedChartService = args.savedChartService;
        this.savedSqlService = args.savedSqlService;
    }

    async find(
        user: SessionUser,
        filters: ContentFilters,
        queryArgs: ContentArgs,
        paginateArgs: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<SummaryContent[]>> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const projectUuids = (
            await this.projectModel.getAllByOrganizationUuid(organizationUuid)
        )
            .filter((project) =>
                user.ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ),
            )
            .map((p) => p.projectUuid);
        const allowedProjectUuids = filters.projectUuids
            ? intersection(filters.projectUuids, projectUuids)
            : projectUuids; // todo: move this filter to project model query

        const spaces = await this.spaceModel.find({
            projectUuids: allowedProjectUuids,
            spaceUuids: filters.spaceUuids,
        });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((p) => p.uuid),
        );
        const visibleSpaces = spaces.filter((space) =>
            hasViewAccessToSpace(user, space, spacesAccess[space.uuid] ?? []),
        );

        // Client-use projects: the dashboard allow-list is the only source of
        // truth. Spaces, saved charts and explores are derived from it, so a
        // customer can only reach the content of the dashboards they are
        // allowed to open.
        const contentScopes = new Map<string, ViewerContentScope>();
        await Promise.all(
            allowedProjectUuids.map(async (projectUuid) => {
                const scope = await this.dashboardService.getViewerContentScope(
                    user,
                    projectUuid,
                );
                if (scope !== undefined) {
                    contentScopes.set(projectUuid, scope);
                }
            }),
        );

        // The `spaceUuids` filter is shared by the space, dashboard and chart
        // queries, so it must only contain the spaces the user has access to.
        // The client-use scope is applied to the content items themselves
        // (see below): narrowing this list would also drop allow-listed
        // dashboards and their charts from the results.
        const allowedSpaceUuids = visibleSpaces.map((space) => space.uuid);

        const shouldApplyDashboardAllowList =
            !filters.contentTypes ||
            filters.contentTypes.includes(ContentType.DASHBOARD) ||
            filters.contentTypes.includes(ContentType.SPACE);

        const allowedDashboardUuidsMap = new Map<string, Set<string>>();
        if (shouldApplyDashboardAllowList) {
            const allowedDashboardEntries = await Promise.all(
                allowedProjectUuids.map(async (projectUuid) => {
                    const allowedUuids =
                        await this.dashboardService.getAllowedDashboardUuidsForViewer(
                            user,
                            projectUuid,
                        );
                    if (allowedUuids !== undefined) {
                        return { projectUuid, allowedUuids };
                    }
                    return undefined;
                }),
            );
            allowedDashboardEntries.forEach((entry) => {
                if (entry) {
                    allowedDashboardUuidsMap.set(
                        entry.projectUuid,
                        entry.allowedUuids,
                    );
                }
            });
        }

        // undefined allow-list: keep DB pagination. Set (including empty):
        // load the full match set, filter, then slice so totalResults is
        // the post-filter count. Only when the viewer allow-list applies.
        const shouldFilterInMemory =
            (allowedDashboardUuidsMap.size > 0 || contentScopes.size > 0) &&
            (isUserWithOrg(user) || contentScopes.size > 0);

        const result = await this.contentModel.findSummaryContents(
            {
                ...filters,
                projectUuids: allowedProjectUuids,
                spaceUuids: allowedSpaceUuids,
                space: {
                    rootSpaces:
                        !filters.spaceUuids || filters.spaceUuids.length === 0,
                },
            },
            queryArgs,
            shouldFilterInMemory ? undefined : paginateArgs,
        );

        if (!shouldFilterInMemory) {
            return result;
        }

        // Root space of the spaces returned by the query. The client-use scope
        // holds root spaces (nested spaces inherit access from their root), so
        // the returned spaces have to be compared with their root.
        const returnedSpaceRoots =
            contentScopes.size > 0
                ? await this.spaceModel.getSpaceRoots(
                      result.data
                          .filter(
                              (content) =>
                                  content.contentType === ContentType.SPACE,
                          )
                          .map((content) => content.uuid),
                  )
                : new Map<string, string>();

        const filtered = result.data.filter((content) => {
            if (content.contentType === ContentType.SPACE) {
                // Client-use: only the spaces of the allow-listed dashboards
                // (and of their charts) are visible
                const scope = contentScopes.get(content.project.uuid);
                if (scope === undefined) {
                    return true;
                }
                const rootSpaceUuid =
                    returnedSpaceRoots.get(content.uuid) ?? content.uuid;
                return scope.spaceUuids.includes(rootSpaceUuid);
            }

            if (content.contentType === ContentType.CHART) {
                // Client-use: only the charts mounted on an allow-listed
                // dashboard are visible
                const scope = contentScopes.get(content.project.uuid);
                if (scope === undefined) {
                    return true;
                }
                return scope.chartUuids.includes(content.uuid);
            }

            if (content.contentType !== ContentType.DASHBOARD) {
                return true;
            }

            const allowedUuids = allowedDashboardUuidsMap.get(
                content.project.uuid,
            );
            if (allowedUuids === undefined) {
                return true;
            }

            return allowedUuids.has(content.uuid);
        });

        // Recount SPACE dashboardCount from the same allow-list; count may be 0.
        const spaceUuidsByProject = new Map<string, string[]>();
        filtered.forEach((content) => {
            if (content.contentType !== ContentType.SPACE) {
                return;
            }
            const projectUuid = content.project.uuid;
            const spaceUuids = spaceUuidsByProject.get(projectUuid) ?? [];
            spaceUuids.push(content.uuid);
            spaceUuidsByProject.set(projectUuid, spaceUuids);
        });

        const spaceCountsByUuid = new Map<string, number>();
        const spaceChartCountsByUuid = new Map<string, number>();
        await Promise.all(
            [...spaceUuidsByProject.entries()].map(
                async ([projectUuid, spaceUuids]) => {
                    const allowedUuids =
                        allowedDashboardUuidsMap.get(projectUuid);
                    if (allowedUuids !== undefined) {
                        const counts =
                            await this.dashboardService.getVisibleDashboardCountBySpaceUuid(
                                spaceUuids,
                                allowedUuids,
                            );
                        counts.forEach((count, spaceUuid) => {
                            spaceCountsByUuid.set(spaceUuid, count);
                        });
                    }

                    // Recount chartCount from the same scope, so hidden charts
                    // are not leaked through the space counters
                    const scope = contentScopes.get(projectUuid);
                    if (scope !== undefined) {
                        const chartCounts =
                            await this.spaceModel.getVisibleChartCountsBySpaceUuids(
                                spaceUuids,
                                scope.chartUuids,
                            );
                        chartCounts.forEach((count, spaceUuid) => {
                            spaceChartCountsByUuid.set(spaceUuid, count);
                        });
                    }
                },
            ),
        );

        const recounted = filtered.map((content) => {
            if (content.contentType !== ContentType.SPACE) {
                return content;
            }
            const hasDashboardCount = spaceCountsByUuid.has(content.uuid);
            const hasChartCount = spaceChartCountsByUuid.has(content.uuid);
            if (!hasDashboardCount && !hasChartCount) {
                return content;
            }
            return {
                ...content,
                dashboardCount: spaceCountsByUuid.get(content.uuid) ?? 0,
                chartCount: spaceChartCountsByUuid.get(content.uuid) ?? 0,
            };
        });

        const { page, pageSize } = paginateArgs;
        const totalResults = recounted.length;
        const start = (page - 1) * pageSize;

        return {
            data: recounted.slice(start, start + pageSize),
            pagination: {
                page,
                pageSize,
                totalResults,
                totalPageCount: Math.ceil(totalResults / pageSize),
            },
        };
    }

    async bulkMove(
        user: SessionUser,
        projectUuid: string,
        content: ApiContentBulkActionBody<ContentActionMove>['content'],
        targetSpaceUuid: string | null,
    ) {
        if (user.organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const database = this.contentModel.getDatabase();

        await database.transaction(async (tx) => {
            const updates = content.map((c) => {
                const moveToSpaceArgs = {
                    projectUuid,
                    itemUuid: c.uuid,
                    targetSpaceUuid,
                };

                const moveToSpaceOptions = {
                    tx,
                    checkForAccess: true,
                    trackEvent: false,
                };

                switch (c.contentType) {
                    case ContentType.CHART:
                        switch (c.source) {
                            case ChartSourceType.DBT_EXPLORE:
                                return this.savedChartService.moveToSpace(
                                    user,
                                    moveToSpaceArgs,
                                    moveToSpaceOptions,
                                );
                            case ChartSourceType.SQL:
                                return this.savedSqlService.moveToSpace(
                                    user,
                                    moveToSpaceArgs,
                                    moveToSpaceOptions,
                                );
                            default:
                                return assertUnreachable(
                                    c.source,
                                    `Unknown chart source in bulk move: ${c.source}`,
                                );
                        }

                    case ContentType.DASHBOARD:
                        return this.dashboardService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    case ContentType.SPACE:
                        return this.spaceService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    case ContentType.DATA_APP:
                        // STUB: wire AppGenerateService.moveToSpace when EE DI is complete
                        throw new NotExistsError(
                            'Moving data apps is not available in this build',
                        );
                    default:
                        return assertUnreachable(c, 'Unknown content type');
                }
            });

            await Promise.all(updates);
        });

        this.analytics.track({
            event: 'content.bulk_move',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                targetSpaceId: targetSpaceUuid,
                contentCount: content.length,
            },
        });
    }

    async move(
        user: SessionUser,
        projectUuid: string,
        item: ApiContentActionBody<ContentActionMove>['item'],
        targetSpaceUuid: string | null,
    ) {
        if (user.organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const moveToSpaceArgs = {
            projectUuid,
            itemUuid: item.uuid,
            targetSpaceUuid,
        };

        const moveToSpaceOptions = {
            checkForAccess: true,
            trackEvent: true,
        };

        switch (item.contentType) {
            case ContentType.CHART:
                switch (item.source) {
                    case ChartSourceType.DBT_EXPLORE:
                        return this.savedChartService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    case ChartSourceType.SQL:
                        return this.savedSqlService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    default:
                        return assertUnreachable(
                            item.source,
                            `Unknown chart source in bulk move: ${item.source}`,
                        );
                }

            case ContentType.DASHBOARD:
                return this.dashboardService.moveToSpace(
                    user,
                    moveToSpaceArgs,
                    moveToSpaceOptions,
                );
            case ContentType.SPACE:
                return this.spaceService.moveToSpace(
                    user,
                    moveToSpaceArgs,
                    moveToSpaceOptions,
                );
            case ContentType.DATA_APP:
                // STUB: wire AppGenerateService.moveToSpace when EE DI is complete
                throw new NotExistsError(
                    'Moving data apps is not available in this build',
                );
            default:
                return assertUnreachable(item, 'Unknown content type');
        }
    }
}

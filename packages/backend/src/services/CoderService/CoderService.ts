import { subject } from '@casl/ability';
import {
    ApiChartAsCodeListResponse,
    ApiDashboardAsCodeListResponse,
    ApiSpaceAsCodeListResponse,
    ApiSqlChartAsCodeListResponse,
    ApiVirtualViewAsCodeListResponse,
    ChartAsCode,
    ChartAsCodeInternalization,
    ChartSummary,
    ContentAsCodeType,
    CreateSavedChart,
    createTemporaryVirtualView,
    currentVersion,
    DashboardAsCode,
    DashboardAsCodeInternalization,
    DashboardAsCodeUpsertResult,
    DashboardDAO,
    DashboardTab,
    DashboardTile,
    DashboardTileAsCode,
    DashboardTileTarget,
    DashboardTileTypes,
    ExploreType,
    ForbiddenError,
    friendlyName,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    isExploreError,
    NotFoundError,
    Project,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    Space,
    SpaceAsCode,
    SpaceAsCodeAction,
    SpaceMemberRole,
    SpaceSummary,
    SqlChartAsCode,
    UpdatedByUser,
    VirtualViewAsCode,
    type DashboardTileWithSlug,
    type MetricQuery,
    type WarehouseClient,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { PromoteService } from '../PromoteService/PromoteService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';
import {
    applyResolvedTabUuidsToTiles,
    getConfigWithLocalRefs,
    getConfigWithPortableRefs,
    getDashboardTabSlug,
    getFiltersWithLocalLockedTabs,
    getFiltersWithPortableLockedTabs,
    getTileTabSlug,
    isEmptyDashboardFilters,
    resolveDashboardTabs,
    toAsCodeTabs,
} from './dashboardAsCodeReferences';

type CoderServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
    promoteService: PromoteService;
    savedSqlModel: SavedSqlModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    groupsModel: GroupsModel;
};

const isAnyChartTile = (
    tile: DashboardTileAsCode | DashboardTile,
): tile is DashboardTile & {
    properties: { chartSlug: string; hideTitle: boolean; chartName?: string };
} =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART;

export class CoderService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    promoteService: PromoteService;

    savedSqlModel: SavedSqlModel;

    organizationMemberProfileModel: OrganizationMemberProfileModel;

    groupsModel: GroupsModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        savedChartModel,
        dashboardModel,
        spaceModel,
        schedulerClient,
        promoteService,
        savedSqlModel,
        organizationMemberProfileModel,
        groupsModel,
    }: CoderServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
        this.promoteService = promoteService;
        this.savedSqlModel = savedSqlModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.groupsModel = groupsModel;
    }

    private static contentAsCodeSubject(project: Project) {
        return subject('ContentAsCode', {
            projectUuid: project.projectUuid,
            organizationUuid: project.organizationUuid,
            type: project.type,
            createdByUserUuid: project.createdByUserUuid,
            upstreamProjectUuid: project.upstreamProjectUuid,
        });
    }

    private static assertCanDownload(user: SessionUser, project: Project) {
        if (
            user.ability.cannot(
                'view',
                CoderService.contentAsCodeSubject(project),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download content as code',
            );
        }
    }

    private static assertCanUpload(user: SessionUser, project: Project) {
        if (
            user.ability.cannot(
                'create',
                CoderService.contentAsCodeSubject(project),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to upload content as code',
            );
        }
    }

    private static toSpaceAsCode(
        space: Pick<SpaceSummary, 'name' | 'path'>,
        access?: SpaceAsCode['access'],
    ): SpaceAsCode {
        return {
            contentType: ContentAsCodeType.SPACE,
            version: 1,
            spaceName: space.name,
            slug: getContentAsCodePathFromLtreePath(space.path),
            ...(access ? { access } : {}),
        };
    }

    private static spacesMetadataFromSummaries(
        spaces: Pick<SpaceSummary, 'name' | 'path'>[],
    ): SpaceAsCode[] {
        const unique = new Map<string, SpaceAsCode>();
        spaces.forEach((space) => {
            const encoded = CoderService.toSpaceAsCode(space);
            unique.set(encoded.slug, encoded);
        });
        return [...unique.values()];
    }

    private static transformChart(
        chart: SavedChartDAO,
        spaceSummary: Pick<SpaceSummary, 'uuid' | 'path'>[],
        dashboardSlugs: Record<string, string>,
    ): ChartAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === chart.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${chart.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        return {
            name: chart.name,
            description: chart.description,
            tableName: chart.tableName,
            updatedAt: chart.updatedAt,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            pivotConfig: chart.pivotConfig,
            dashboardSlug: chart.dashboardUuid
                ? dashboardSlugs[chart.dashboardUuid]
                : undefined,
            slug: chart.slug,
            tableConfig: chart.tableConfig,
            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
            contentType: ContentAsCodeType.CHART,
            parameters: chart.parameters,
            merge: chart.merge,
        };
    }

    static isUuid(id: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
        );
    }

    static getChartSlugForTileUuid = (
        dashboard: DashboardDAO,
        uuid: string,
    ) => {
        const tile = dashboard.tiles.find((t) => t.uuid === uuid);
        if (tile && isAnyChartTile(tile)) {
            const hasMultipleTilesWithSameChartSlug =
                dashboard.tiles.filter(
                    (t) =>
                        isAnyChartTile(t) &&
                        t.properties.chartSlug === tile.properties.chartSlug,
                ).length > 1;
            if (hasMultipleTilesWithSameChartSlug) {
                const chartSlugIndex = dashboard.tiles
                    .filter(
                        (t) =>
                            isAnyChartTile(t) &&
                            t.properties.chartSlug ===
                                tile.properties.chartSlug,
                    )
                    .findIndex((t) => t.uuid === uuid);
                return `${tile.properties.chartSlug}-${chartSlugIndex + 1}`;
            }
            return tile.properties.chartSlug;
        }
        return undefined;
    };

    /* Convert dashboard filters from tile uuids to tile slugs
     * DashboardDAO to DashboardAsCode
     */
    static getFiltersWithTileSlugs(
        dashboard: DashboardDAO,
    ): DashboardAsCode['filters'] {
        const dimensionFiltersWithoutUuids: DashboardAsCode['filters']['dimensions'] =
            dashboard.filters.dimensions.map((filter) => {
                const tileTargets = Object.entries(
                    filter.tileTargets ?? {},
                ).reduce<Record<string, DashboardTileTarget>>(
                    (acc, [tileUuid, target]) => {
                        const tileSlug = CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tileUuid,
                        );
                        if (!tileSlug) return acc;
                        return {
                            ...acc,
                            [tileSlug]: target,
                        };
                    },
                    {},
                );
                return {
                    ...filter,
                    id: undefined,
                    tileTargets,
                };
            });

        return getFiltersWithPortableLockedTabs(dashboard, {
            ...dashboard.filters,
            dimensions: dimensionFiltersWithoutUuids,
        });
    }

    /* Convert dashboard filters from tile slugs to tile uuids
     * DashboardAsCode to DashboardDAO
     */
    static getFiltersWithTileUuids(
        dashboardAsCode: DashboardAsCode,
        tilesWithUuids: DashboardTileWithSlug[],
    ): DashboardDAO['filters'] {
        const dimensionFiltersWithUuids: DashboardDAO['filters']['dimensions'] =
            dashboardAsCode.filters.dimensions.map((filter) => {
                const tileTargets = Object.entries(
                    filter.tileTargets ?? {},
                ).reduce<Record<string, DashboardTileTarget>>(
                    (acc, [tileSlug, target]) => {
                        const tileUuid = tilesWithUuids.find(
                            (t) =>
                                isAnyChartTile(t) &&
                                // Match first by tileSlug, then by chartSlug (for the case of tile not having a slug)
                                (t.tileSlug === tileSlug ||
                                    t.properties.chartSlug === tileSlug),
                        )?.uuid;
                        if (!tileUuid) {
                            console.error(
                                `Tile with slug ${tileSlug} not found in tilesWithUuids`,
                            );
                            return acc;
                        }
                        return {
                            ...acc,
                            [tileUuid]: target,
                        };
                    },
                    {},
                );
                return {
                    ...filter,
                    id: uuidv4(),
                    tileTargets,
                };
            });
        return {
            ...dashboardAsCode.filters,
            dimensions: dimensionFiltersWithUuids,
        };
    }

    /* Convert tab filters from tile uuids to tile slugs
     * DashboardDAO to DashboardAsCode
     */
    static getTabFiltersWithTileSlugs(
        dashboard: DashboardDAO,
        tabs: DashboardDAO['tabs'],
    ): DashboardAsCode['tabs'] {
        return tabs.map((tab) => {
            if (!tab.filters || isEmptyDashboardFilters(tab.filters)) {
                return {
                    uuid: tab.uuid,
                    name: tab.name,
                    order: tab.order,
                    hidden: tab.hidden,
                };
            }

            const dimensionFiltersWithoutUuids = tab.filters.dimensions.map(
                (filter) => {
                    const tileTargets = Object.entries(
                        filter.tileTargets ?? {},
                    ).reduce<Record<string, DashboardTileTarget>>(
                        (acc, [tileUuid, target]) => {
                            const tileSlug =
                                CoderService.getChartSlugForTileUuid(
                                    dashboard,
                                    tileUuid,
                                );
                            if (!tileSlug) return acc;
                            return {
                                ...acc,
                                [tileSlug]: target,
                            };
                        },
                        {},
                    );
                    const { id, ...filterWithoutId } = filter;
                    return {
                        ...filterWithoutId,
                        tileTargets,
                    };
                },
            );

            return {
                ...tab,
                slug: getDashboardTabSlug(dashboard, tab.uuid),
                filters: getFiltersWithPortableLockedTabs(dashboard, {
                    ...tab.filters,
                    dimensions: dimensionFiltersWithoutUuids,
                }),
            } as unknown as DashboardTab; // Type assertion: id removed for export format
        }) as DashboardAsCode['tabs'];
    }

    /* Convert tab filters from tile slugs to tile uuids
     * DashboardAsCode to DashboardDAO
     */
    static getTabFiltersWithTileUuids(
        dashboardAsCode: DashboardAsCode,
        tilesWithUuids: DashboardTileWithSlug[],
        existingTabs: DashboardDAO['tabs'] = [],
    ): DashboardDAO['tabs'] {
        const resolvedTabs = resolveDashboardTabs(
            dashboardAsCode.tabs || [],
            existingTabs,
        );
        return resolvedTabs.map((tab, index): DashboardTab => {
            const incoming = dashboardAsCode.tabs?.[index];
            if (!incoming?.filters) {
                return {
                    uuid: tab.uuid,
                    name: tab.name,
                    order: tab.order,
                    hidden: tab.hidden,
                };
            }

            const convertTileTargets = (
                tileTargets: Record<string, DashboardTileTarget> | undefined,
            ): Record<string, DashboardTileTarget> => {
                if (!tileTargets) return {};
                return Object.entries(tileTargets).reduce<
                    Record<string, DashboardTileTarget>
                >((acc, [tileSlug, target]) => {
                    const matchingTile = tilesWithUuids.find(
                        (t) =>
                            isAnyChartTile(t) &&
                            // Match first by tileSlug, then by chartSlug (for the case of tile not having a slug)
                            (t.tileSlug === tileSlug ||
                                t.properties.chartSlug === tileSlug),
                    );
                    if (!matchingTile) {
                        return acc;
                    }
                    return {
                        ...acc,
                        [matchingTile.uuid]: target,
                    };
                }, {});
            };

            const incomingFilters = getFiltersWithLocalLockedTabs(
                incoming.filters,
                resolvedTabs,
                [],
            );
            const dimensionFiltersWithUuids = incomingFilters.dimensions.map(
                (filter) => ({
                    ...filter,
                    id: uuidv4(),
                    tileTargets: convertTileTargets(filter.tileTargets),
                }),
            );

            const metricFiltersWithUuids = (incomingFilters.metrics || []).map(
                (filter) => ({
                    ...filter,
                    id: uuidv4(),
                    tileTargets: convertTileTargets(filter.tileTargets),
                }),
            );

            const tableCalculationFiltersWithUuids = (
                incomingFilters.tableCalculations || []
            ).map((filter) => ({
                ...filter,
                id: uuidv4(),
                tileTargets: convertTileTargets(filter.tileTargets),
            }));

            return {
                uuid: tab.uuid,
                name: tab.name,
                order: tab.order,
                hidden: tab.hidden,
                filters: {
                    dimensions: dimensionFiltersWithUuids,
                    metrics: metricFiltersWithUuids,
                    tableCalculations: tableCalculationFiltersWithUuids,
                },
            };
        });
    }

    private static transformDashboard(
        dashboard: DashboardDAO,
        spaceSummary: Pick<SpaceSummary, 'uuid' | 'path'>[],
    ): DashboardAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === dashboard.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${dashboard.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        const tilesWithoutUuids: DashboardTileAsCode[] = dashboard.tiles.map(
            (tile): DashboardTileAsCode => {
                const tabSlug = getTileTabSlug(dashboard, tile);
                if (isAnyChartTile(tile)) {
                    return {
                        ...tile,
                        uuid: undefined,
                        tileSlug: CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tile.uuid,
                        ),
                        tabSlug,
                        tabUuid: tile.tabUuid,
                        properties: {
                            title: tile.properties.title,
                            hideTitle: tile.properties.hideTitle,
                            chartSlug: tile.properties.chartSlug,
                            chartName: tile.properties.chartName,
                        },
                    };
                }

                // Markdown and loom are returned as they are
                return {
                    ...tile,
                    tileSlug: undefined,
                    uuid: undefined,
                    tabSlug,
                    tabUuid: tile.tabUuid,
                };
            },
            [],
        );

        const dashboardAsCode: DashboardAsCode = {
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.updatedAt,
            tiles: tilesWithoutUuids,

            filters: CoderService.getFiltersWithTileSlugs(dashboard),
            tabs: toAsCodeTabs(
                dashboard,
                CoderService.getTabFiltersWithTileSlugs(
                    dashboard,
                    dashboard.tabs,
                ),
            ),
            slug: dashboard.slug,
            config: getConfigWithPortableRefs(dashboard, (tileUuid) =>
                CoderService.getChartSlugForTileUuid(dashboard, tileUuid),
            ),

            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
            contentType: ContentAsCodeType.DASHBOARD,
            parameters: dashboard.parameters,
            ownerEmail: dashboard.owner?.email ?? null,
        };

        return dashboardAsCode;
    }

    async convertTileWithSlugsToUuids(
        projectUuid: string,
        tiles: DashboardTileAsCode[],
        warnings: string[] = [],
    ): Promise<DashboardTileWithSlug[]> {
        const getAsCodeChartSlug = (
            tile: DashboardTileAsCode,
        ): string | undefined =>
            'chartSlug' in tile.properties
                ? tile.properties.chartSlug ?? undefined
                : undefined;

        const savedChartSlugs = tiles
            .filter((tile) => tile.type === DashboardTileTypes.SAVED_CHART)
            .map(getAsCodeChartSlug)
            .filter((slug): slug is string => Boolean(slug));
        const sqlChartSlugs = tiles
            .filter((tile) => tile.type === DashboardTileTypes.SQL_CHART)
            .map(getAsCodeChartSlug)
            .filter((slug): slug is string => Boolean(slug));

        const charts =
            savedChartSlugs.length > 0
                ? await this.savedChartModel.find({
                      slugs: savedChartSlugs,
                      projectUuid,
                      excludeChartsSavedInDashboard: false,
                      includeOrphanChartsWithinDashboard: true,
                  })
                : [];
        const sqlCharts =
            sqlChartSlugs.length > 0
                ? (await this.savedSqlModel.find({ projectUuid }))
                      .map((row) => SavedSqlModel.convertSelectSavedSql(row))
                      .filter((chart) => sqlChartSlugs.includes(chart.slug))
                : [];

        return tiles.map((tile) => {
            if (tile.type === DashboardTileTypes.SQL_CHART) {
                const chartSlug = getAsCodeChartSlug(tile);
                const sqlChart = sqlCharts.find(
                    (chart) => chart.slug === chartSlug,
                );
                if (!sqlChart) {
                    warnings.push(
                        `Chart "${chartSlug}" was not found in this project — the tile was saved without a chart. Upload the chart first, then re-upload the dashboard.`,
                    );
                }
                return {
                    ...tile,
                    uuid: uuidv4(),
                    tileSlug: tile.tileSlug,
                    tabUuid: tile.tabUuid,
                    tabSlug: tile.tabSlug,
                    properties: {
                        ...tile.properties,
                        savedSqlUuid: sqlChart?.savedSqlUuid ?? null,
                    },
                } as unknown as DashboardTileWithSlug;
            }

            if (isAnyChartTile(tile)) {
                const chartSlug = getAsCodeChartSlug(tile);
                const savedChart = charts.find(
                    (chart) => chart.slug === chartSlug,
                );

                if (!savedChart) {
                    warnings.push(
                        `Chart "${chartSlug}" was not found in this project — the tile was saved without a chart. Upload the chart first, then re-upload the dashboard.`,
                    );
                }
                return {
                    ...tile,
                    uuid: uuidv4(),
                    tileSlug: tile.tileSlug, // Preserve tileSlug for filter matching
                    tabUuid: tile.tabUuid,
                    tabSlug: tile.tabSlug,
                    properties: {
                        ...tile.properties,
                        savedChartUuid: savedChart?.uuid ?? null,
                    },
                } as unknown as DashboardTileWithSlug;
            }

            return {
                ...tile,
                tileSlug: tile.tileSlug, // Preserve tileSlug even for non-chart tiles
                tabUuid: tile.tabUuid,
                tabSlug: tile.tabSlug,
            } as unknown as DashboardTileWithSlug;
        });
    }

    /*
    Dashboard or chart ids can be uuids or slugs
     We need to convert uuids to slugs before making the query
    */
    async convertIdsToSlugs(
        type: 'dashboard' | 'chart',
        ids: string[] | undefined,
    ) {
        if (!ids) return ids; // return [] or undefined

        const uuids = ids?.filter((id) => CoderService.isUuid(id));
        let uuidsToSlugs: string[] = [];

        if (uuids.length > 0) {
            if (type === 'dashboard') {
                const dashboardSlugs =
                    await this.dashboardModel.getSlugsForUuids(uuids);
                uuidsToSlugs = Object.values(dashboardSlugs);
            } else if (type === 'chart') {
                uuidsToSlugs = await this.savedChartModel.getSlugsForUuids(
                    uuids,
                );
            }
        }
        const slugs = ids?.filter((id) => !CoderService.isUuid(id)) ?? [];

        return [...uuidsToSlugs, ...slugs];
    }

    static getMissingIds(
        ids: string[] | undefined,
        items: Pick<SavedChartDAO | DashboardDAO, 'slug' | 'uuid'>[],
    ) {
        return ids
            ? ids.reduce<string[]>((acc, id) => {
                  const exists = items.some(
                      (item) => id === item.uuid || id === item.slug,
                  );
                  if (!exists) {
                      acc.push(id);
                  }
                  return acc;
              }, [])
            : [];
    }

    private async filterPrivateContent<
        T extends
            | DashboardDAO
            | SavedChartDAO
            | (ChartSummary & { updatedAt: Date })
            | Pick<
                  DashboardDAO,
                  'uuid' | 'name' | 'spaceUuid' | 'description' | 'slug'
              >,
    >(
        user: SessionUser,
        project: Project,
        content: T[],
        spaces: Omit<SpaceSummary, 'userAccess'>[],
    ): Promise<T[]> {
        if (
            user.ability.can(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            // User is an admin, return all content
            return content;
        }
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        return content.filter((c) => {
            const space = spaces.find((s) => s.uuid === c.spaceUuid);
            if (!space) return false;
            return hasViewAccessToSpace(
                user,
                space,
                spacesAccess[space.uuid] ?? [],
            );
        });
    }

    /*
    @param dashboardIds: Dashboard ids can be uuids or slugs, if undefined return all dashboards, if [] we return no dashboards
    @returns: DashboardAsCode[]
    */
    async getDashboards(
        user: SessionUser,
        projectUuid: string,
        dashboardIds: string[] | undefined,
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        CoderService.assertCanDownload(user, project);

        const slugs = await this.convertIdsToSlugs('dashboard', dashboardIds);

        if (slugs?.length === 0) {
            this.logger.warn(
                `No dashboards to download for project ${projectUuid} with ids ${dashboardIds?.join(
                    ', ',
                )}`,
            );
            return {
                dashboards: [],
                languageMap: undefined,
                missingIds: dashboardIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const dashboardSummaries = await this.dashboardModel.find({
            projectUuid,
            slugs,
        });
        const spaceUuids = dashboardSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });

        const dashboardSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboardSummaries,
            spaces,
        );
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;
        const offsetIndex = offset || 0;
        const newOffset = Math.min(
            offsetIndex + maxResults,
            dashboardSummariesWithAccess.length,
        );

        const limitedDashboardSummaries = dashboardSummariesWithAccess.slice(
            offsetIndex,
            newOffset,
        );

        const dashboardPromises = limitedDashboardSummaries.map((dash) =>
            this.dashboardModel.getByIdOrSlug(dash.uuid),
        );
        const dashboards = await Promise.all(dashboardPromises);

        const missingIds = CoderService.getMissingIds(dashboardIds, dashboards);
        if (missingIds.length > 0) {
            this.logger.warn(
                `Missing filtered dashboards for project ${projectUuid} with ids ${missingIds.join(
                    ', ',
                )}`,
            );
        }

        const dashboardsWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboards,
            spaces,
        );

        const transformedDashboards = dashboardsWithAccess.map((dashboard) =>
            CoderService.transformDashboard(dashboard, spaces),
        );

        return {
            dashboards: transformedDashboards,
            languageMap: languageMap
                ? transformedDashboards.map((dashboard) => {
                      try {
                          return new DashboardAsCodeInternalization().getLanguageMap(
                              dashboard,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for dashboard ${dashboard.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            spaces: CoderService.spacesMetadataFromSummaries(spaces),
            total: dashboardSummariesWithAccess.length,
            offset: newOffset,
        };
    }

    async getCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        CoderService.assertCanDownload(user, project);

        const slugs = await this.convertIdsToSlugs('chart', chartIds);
        if (slugs?.length === 0) {
            this.logger.warn(
                `No charts to download for project ${projectUuid} with ids ${chartIds?.join(
                    ', ',
                )}`,
            );
            return {
                charts: [],
                languageMap: undefined,
                missingIds: chartIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
            slugs,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;

        // Apply offset and limit to chart summaries
        const offsetIndex = offset || 0;
        const spaceUuids = chartSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });
        const chartsSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            chartSummaries,
            spaces,
        );
        const newOffset = Math.min(
            offsetIndex + maxResults,
            chartsSummariesWithAccess.length,
        );
        const limitedChartSummaries = chartsSummariesWithAccess.slice(
            offsetIndex,
            newOffset,
        );

        const chartPromises = limitedChartSummaries.map((chart) =>
            this.savedChartModel.get(chart.uuid),
        );
        const charts = await Promise.all(chartPromises);
        const missingIds = CoderService.getMissingIds(chartIds, charts);

        // get all spaces to map  dashboardSlug
        const dashboardUuids = charts.reduce<string[]>((acc, chart) => {
            if (chart.dashboardUuid) {
                acc.push(chart.dashboardUuid);
            }
            return acc;
        }, []);
        const dashboards = await this.dashboardModel.getSlugsForUuids(
            dashboardUuids,
        );

        const transformedCharts = charts.map((chart) =>
            CoderService.transformChart(chart, spaces, dashboards),
        );

        return {
            charts: transformedCharts,
            languageMap: languageMap
                ? transformedCharts.map((chart) => {
                      try {
                          return new ChartAsCodeInternalization().getLanguageMap(
                              chart,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for chart ${chart.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            spaces: CoderService.spacesMetadataFromSummaries(spaces),
            total: chartsSummariesWithAccess.length,
            offset: newOffset,
        };
    }

    async upsertChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        chartAsCode: ChartAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        spaceNames?: Record<string, string>,
    ) {
        const project = await this.projectModel.get(projectUuid);

        CoderService.assertCanUpload(user, project);
        const [chart] = await this.savedChartModel.find({
            slug,
            projectUuid,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });

        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (chart === undefined) {
            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    chartAsCode.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                    spaceNames,
                );

            console.info(
                `Creating chart "${chartAsCode.name}" on project ${projectUuid}`,
            );

            let createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
                forceSlug: boolean;
            };

            if (chartAsCode.dashboardSlug) {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slug: chartAsCode.dashboardSlug,
                });

                let dashboardUuid: string = dashboard?.uuid;
                if (!dashboard) {
                    // Charts within dashboards need a dashboard first,
                    // so we will create a placeholder dashboard for this
                    // which we can update later
                    console.debug(
                        'Creating placeholder dashboard for chart within dashboard',
                        chartAsCode.slug,
                    );
                    const newDashboard = await this.dashboardModel.create(
                        space.uuid,
                        {
                            name: friendlyName(chartAsCode.dashboardSlug),
                            tiles: [],
                            slug: chartAsCode.dashboardSlug,
                            forceSlug: true,
                            tabs: [],
                        },
                        user,
                        projectUuid,
                    );

                    dashboardUuid = newDashboard.uuid;
                }
                createChart = {
                    ...chartAsCode,
                    metricQuery: chartAsCode.metricQuery as MetricQuery,
                    spaceUuid: null,
                    dashboardUuid,
                    updatedByUser: user,
                    forceSlug: true,
                };
            } else {
                createChart = {
                    ...chartAsCode,
                    metricQuery: chartAsCode.metricQuery as MetricQuery,
                    spaceUuid: space.uuid,
                    dashboardUuid: null,
                    updatedByUser: user,
                    forceSlug: true,
                };
            }

            const newChart = await this.savedChartModel.create(
                projectUuid,
                user.userUuid,
                createChart,
            );

            console.info(
                `Finished creating chart "${chartAsCode.name}" on project ${projectUuid}`,
            );
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newChart,
                            spaceSlug: chartAsCode.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                chartAsCode.spaceSlug,
                            ),
                            oldUuid: newChart.uuid,
                        },
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }
        console.info(
            `Updating chart "${chartAsCode.name}" on project ${projectUuid}`,
        );
        // Although, promotionService already upsertSpaces
        // We want to create a new space based on the slug, not the uuid
        // Then there is no need to do promoteService.upsertSpaces
        const { space } = await this.getOrCreateSpace(
            projectUuid,
            chartAsCode.spaceSlug,
            user,
            skipSpaceCreate,
            publicSpaceCreate,
            spaceNames,
        );

        const { promotedChart, upstreamChart } =
            await this.promoteService.getPromoteCharts(
                user,
                projectUuid, // We use the same projectUuid for both promoted and upstream
                chart.uuid,
                true, // includeOrphanChartsWithinDashboard
            );
        const updatedChart = {
            ...promotedChart,
            chart: {
                ...promotedChart.chart,
                ...chartAsCode,
                metricQuery: chartAsCode.metricQuery as MetricQuery,
                projectUuid,
                organizationUuid: project.organizationUuid,
            },
        };

        //  we force the new space on the upstreamChart
        if (upstreamChart.chart) upstreamChart.chart.spaceUuid = space.uuid;
        let promotionChanges: PromotionChanges =
            await this.promoteService.getChartChanges(
                updatedChart,
                upstreamChart,
            );
        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
        );

        console.info(
            `Finished updating chart "${chartAsCode.name}" on project ${projectUuid}: ${promotionChanges.charts[0].action}`,
        );

        return promotionChanges;
    }

    async getOrCreateSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
        skipSpaceCreate?: boolean,
        // Extra upstream args accepted for call-site compatibility; unused here.
        _publicSpaceCreate?: boolean,
        _spaceNames?: Record<string, string>,
        _allowSpaceCreate?: boolean,
    ): Promise<{ space: Omit<SpaceSummary, 'userAccess'>; created: boolean }> {
        const [existingSpace] = await this.spaceModel.find({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });

        if (existingSpace !== undefined) {
            const spacesAccess = await this.spaceModel.getUserSpacesAccess(
                user.userUuid,
                [existingSpace.uuid],
            );
            if (
                hasViewAccessToSpace(
                    user,
                    existingSpace,
                    spacesAccess[existingSpace.uuid] ?? [],
                )
            ) {
                return { space: existingSpace, created: false };
            }
            throw new ForbiddenError(
                "You don't have access to a private space",
            );
        }
        if (skipSpaceCreate) {
            throw new NotFoundError(
                `Space ${spaceSlug} does not exist, skipping creation`,
            );
        }
        const path = getLtreePathFromContentAsCodePath(spaceSlug);

        const closestAncestorSpaceUuid =
            await this.spaceModel.findClosestAncestorByPath({
                path,
                projectUuid,
            });

        const closestAncestorSpace = closestAncestorSpaceUuid
            ? await this.spaceModel.getSpaceSummary(closestAncestorSpaceUuid)
            : null;

        const remainingPath = path
            .replace(closestAncestorSpace?.path ?? '', '') // remove the closest ancestor path
            .replace(/^\./, '') // remove the leading dot
            .split('.');

        let parentSpaceUuid = closestAncestorSpaceUuid;
        let parentPath = closestAncestorSpace?.path ?? '';
        const newSpaces: Space[] = [];
        for await (const currentPath of remainingPath) {
            if (!parentPath) {
                parentPath = currentPath;
            } else {
                parentPath = `${parentPath}.${currentPath}`;
            }

            const newSpace = await this.spaceModel.createSpace(
                {
                    isPrivate: closestAncestorSpace?.isPrivate ?? true,
                    name: friendlyName(currentPath),
                    parentSpaceUuid,
                },
                {
                    projectUuid,
                    userId: user.userId,
                    path: parentPath,
                },
            );

            if (newSpace.isPrivate) {
                if (parentSpaceUuid) {
                    const newSpaceWithAccess =
                        await this.spaceModel.getFullSpace(parentSpaceUuid);

                    const userAccessPromises = newSpaceWithAccess.access
                        .filter((access) => access.hasDirectAccess)
                        .map((userAccess) =>
                            this.spaceModel.addSpaceAccess(
                                newSpace.uuid,
                                userAccess.userUuid,
                                userAccess.role,
                            ),
                        );

                    const groupAccessPromises =
                        newSpaceWithAccess.groupsAccess.map((groupAccess) =>
                            this.spaceModel.addSpaceGroupAccess(
                                newSpace.uuid,
                                groupAccess.groupUuid,
                                groupAccess.spaceRole,
                            ),
                        );

                    await Promise.all([
                        ...userAccessPromises,
                        ...groupAccessPromises,
                    ]);
                } else {
                    await this.spaceModel.addSpaceAccess(
                        newSpace.uuid,
                        user.userUuid,
                        SpaceMemberRole.ADMIN,
                    );
                }
            }

            parentSpaceUuid = newSpace.uuid;

            newSpaces.push(newSpace);
        }

        return {
            space: {
                ...newSpaces[newSpaces.length - 1],
                chartCount: 0,
                dashboardCount: 0,
                access: [],
            },
            created: true,
        };
    }

    async upsertDashboard(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        dashboardAsCode: DashboardAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        spaceNames?: Record<string, string>,
    ): Promise<DashboardAsCodeUpsertResult> {
        const project = await this.projectModel.get(projectUuid);

        CoderService.assertCanUpload(user, project);
        const [dashboardSummary] = await this.dashboardModel.find({
            slug,
            projectUuid,
        });
        const existingDashboard = dashboardSummary
            ? await this.dashboardModel.getByIdOrSlug(dashboardSummary.uuid)
            : undefined;
        const warnings: string[] = [];
        const resolvedTiles = await this.convertTileWithSlugsToUuids(
            projectUuid,
            dashboardAsCode.tiles,
            warnings,
        );
        const resolvedTabs = resolveDashboardTabs(
            dashboardAsCode.tabs || [],
            existingDashboard?.tabs,
        );
        const tilesWithUuids = applyResolvedTabUuidsToTiles(
            resolvedTiles,
            resolvedTabs,
        );

        const dashboardFilters = getFiltersWithLocalLockedTabs(
            CoderService.getFiltersWithTileUuids(
                dashboardAsCode,
                tilesWithUuids,
            ),
            resolvedTabs,
            warnings,
        );
        const tabsWithUuids = CoderService.getTabFiltersWithTileUuids(
            dashboardAsCode,
            tilesWithUuids,
            existingDashboard?.tabs,
        );
        const dashboardConfig = getConfigWithLocalRefs(
            dashboardAsCode.config,
            resolvedTabs,
            tilesWithUuids,
            warnings,
        );

        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (dashboardSummary === undefined) {
            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    dashboardAsCode.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                    spaceNames,
                );

            const newDashboard = await this.dashboardModel.create(
                space.uuid,
                {
                    ...dashboardAsCode,
                    tiles: tilesWithUuids,
                    tabs: tabsWithUuids,
                    forceSlug: true,
                    filters: dashboardFilters,
                    config: dashboardConfig,
                },
                user,
                projectUuid,
            );

            return {
                dashboards: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newDashboard,
                            spaceSlug: dashboardAsCode.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                dashboardAsCode.spaceSlug,
                            ),
                        },
                    },
                ],
                charts: [],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                ...(warnings.length > 0 ? { warnings } : {}),
            };
        }
        // Use promote service to update existing dashboard
        const dashboard = existingDashboard!;

        this.logger.info(
            `Updating dashboard "${dashboard.name}" on project ${projectUuid}`,
        );

        const dashboardWithUuids = {
            ...dashboardAsCode,
            tiles: tilesWithUuids,
            tabs: tabsWithUuids,
            config: dashboardConfig,
        };
        const mergedDashboard = {
            ...dashboard,
            ...dashboardWithUuids,
            filters: dashboardFilters,
            config: dashboardConfig,
            projectUuid,
            organizationUuid: project.organizationUuid,
        };
        const { promotedDashboard, upstreamDashboard } =
            await this.promoteService.getPromotedDashboard(
                user,
                mergedDashboard,
                projectUuid, // We use the same projectUuid for both promoted and upstream
            );

        PromoteService.checkPromoteDashboardPermissions(
            user,
            promotedDashboard,
            upstreamDashboard,
        );

        // Although, promotionService already upsertSpaces
        // We want to create a new space based on the slug, not the uuid
        const { space } = await this.getOrCreateSpace(
            projectUuid,
            dashboardAsCode.spaceSlug,
            user,
            skipSpaceCreate,
            publicSpaceCreate,
            spaceNames,
        );

        //  we force the new space on the upstreamDashboard
        if (upstreamDashboard.dashboard)
            upstreamDashboard.dashboard.spaceUuid = space.uuid;

        // TODO: Check permissions for all chart tiles
        // eslint-disable-next-line prefer-const
        let [promotionChanges, promotedCharts] =
            await this.promoteService.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
                true, // includeOrphanChartsWithinDashboard
            );

        // TODO: Right now dashboards on promote service always update dashboards
        // See isDashboardUpdated for more details

        promotionChanges = await this.promoteService.getOrCreateDashboard(
            user,
            promotionChanges,
        );

        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
            promotionChanges.dashboards[0].data.uuid,
        );

        promotionChanges = await this.promoteService.updateDashboard(
            user,
            promotionChanges,
        );

        this.logger.info(
            `Finished updating dashboard "${dashboard.name}" on project ${projectUuid}: ${promotionChanges.dashboards[0].action}`,
        );
        return warnings.length > 0
            ? { ...promotionChanges, warnings }
            : promotionChanges;
    }

    async getSpaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ApiSpaceAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        CoderService.assertCanDownload(user, project);

        const projectSpaces = await this.spaceModel.find({ projectUuid });
        const skipped: ApiSpaceAsCodeListResponse['results']['skipped'] = [];
        const spaces: SpaceAsCode[] = [];

        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            projectSpaces.map((space) => space.uuid),
        );

        const exported = await Promise.all(
            projectSpaces.map(async (space) => {
                if (
                    !hasViewAccessToSpace(
                        user,
                        space,
                        spacesAccess[space.uuid] ?? [],
                    )
                ) {
                    return {
                        skipped: {
                            slug: getContentAsCodePathFromLtreePath(space.path),
                            reason: 'No view access',
                        },
                        space: undefined,
                    };
                }

                let access: SpaceAsCode['access'];
                try {
                    const fullSpace = await this.spaceModel.getFullSpace(
                        space.uuid,
                    );
                    access = {
                        inheritParentPermissions:
                            space.parentSpaceUuid !== null,
                        projectMemberAccessRole: null,
                        users: fullSpace.access
                            .filter(
                                (member) =>
                                    member.hasDirectAccess && member.email,
                            )
                            .map((member) => ({
                                email: member.email,
                                role: member.role,
                            })),
                        groups: fullSpace.groupsAccess
                            .filter((group) => group.groupName)
                            .map((group) => ({
                                name: group.groupName,
                                role: group.spaceRole,
                            })),
                    };
                } catch (error) {
                    this.logger.warn(
                        `Could not export access for space ${space.uuid}: ${error}`,
                    );
                }

                return {
                    skipped: undefined,
                    space: CoderService.toSpaceAsCode(space, access),
                };
            }),
        );

        exported.forEach((item) => {
            if (item.skipped) {
                skipped.push(item.skipped);
            }
            if (item.space) {
                spaces.push(item.space);
            }
        });

        return { spaces, skipped };
    }

    async upsertSpace(
        user: SessionUser,
        projectUuid: string,
        spaceAsCode: SpaceAsCode,
        options?: {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
        },
    ): Promise<{
        action: SpaceAsCodeAction;
        warnings?: string[];
    }> {
        const project = await this.projectModel.get(projectUuid);
        CoderService.assertCanUpload(user, project);

        const warnings: string[] = [];
        let created = false;
        try {
            const result = await this.getOrCreateSpace(
                projectUuid,
                spaceAsCode.slug,
                user,
                options?.skipSpaceCreate,
                options?.publicSpaceCreate,
            );
            created = result.created;

            if (result.space.name !== spaceAsCode.spaceName) {
                await this.spaceModel.update(result.space.uuid, {
                    name: spaceAsCode.spaceName,
                });
            }

            if (spaceAsCode.access) {
                await this.applySpaceAccess(
                    project.organizationUuid,
                    result.space.uuid,
                    spaceAsCode,
                    warnings,
                );
            }
        } catch (error) {
            if (error instanceof NotFoundError && options?.skipSpaceCreate) {
                warnings.push(error.message);
                return { action: SpaceAsCodeAction.NO_CHANGES, warnings };
            }
            throw error;
        }

        return {
            action: created
                ? SpaceAsCodeAction.CREATE
                : SpaceAsCodeAction.UPDATE,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    private async applySpaceAccess(
        organizationUuid: string,
        spaceUuid: string,
        spaceAsCode: SpaceAsCode,
        warnings: string[],
    ): Promise<void> {
        const { access } = spaceAsCode;
        if (!access) return;

        const userWarnings = await Promise.all(
            access.users.map(async (userAccess) => {
                try {
                    const member =
                        await this.organizationMemberProfileModel.getOrganizationMemberByEmail(
                            organizationUuid,
                            userAccess.email,
                        );
                    await this.spaceModel.addSpaceAccess(
                        spaceUuid,
                        member.userUuid,
                        userAccess.role,
                    );
                    return undefined;
                } catch {
                    return `Skipped user access for ${userAccess.email} in space "${spaceAsCode.slug}"`;
                }
            }),
        );

        const groupWarnings = await Promise.all(
            access.groups.map(async (groupAccess) => {
                try {
                    const { data: groups } = await this.groupsModel.find({
                        organizationUuid,
                        name: groupAccess.name,
                    });
                    if (groups.length !== 1) {
                        return `Skipped group access for "${groupAccess.name}" in space "${spaceAsCode.slug}"`;
                    }
                    await this.spaceModel.addSpaceGroupAccess(
                        spaceUuid,
                        groups[0].uuid,
                        groupAccess.role,
                    );
                    return undefined;
                } catch {
                    return `Skipped group access for "${groupAccess.name}" in space "${spaceAsCode.slug}"`;
                }
            }),
        );

        [...userWarnings, ...groupWarnings].forEach((warning) => {
            if (warning) {
                warnings.push(warning);
            }
        });
    }

    async getSqlCharts(
        user: SessionUser,
        projectUuid: string,
        ids?: string[],
        offset?: number,
    ): Promise<ApiSqlChartAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        CoderService.assertCanDownload(user, project);

        const rows = await this.savedSqlModel.find({ projectUuid });
        const charts = rows.map((row) =>
            SavedSqlModel.convertSelectSavedSql(row),
        );
        const filteredByIds = charts.filter((chart) => {
            if (!ids || ids.length === 0) return true;
            return ids.some(
                (id) => id === chart.slug || id === chart.savedSqlUuid,
            );
        });
        const spaceUuids = [
            ...new Set(filteredByIds.map((chart) => chart.space.uuid)),
        ];
        const spaces = await this.spaceModel.find({ spaceUuids });
        const spacesByUuid = new Map(
            spaces.map((space) => [space.uuid, space]),
        );
        const chartsWithAccess = await this.filterPrivateContent(
            user,
            project,
            filteredByIds.map((chart) => ({
                uuid: chart.savedSqlUuid,
                name: chart.name,
                spaceUuid: chart.space.uuid,
                description: chart.description ?? undefined,
                slug: chart.slug,
            })),
            spaces,
        );
        const accessibleSlugs = new Set(
            chartsWithAccess.map((chart) => chart.slug),
        );
        const filtered = filteredByIds.filter((chart) =>
            accessibleSlugs.has(chart.slug),
        );
        const accessibleSpaces = spaces.filter((space) =>
            filtered.some((chart) => chart.space.uuid === space.uuid),
        );

        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;
        const offsetIndex = offset || 0;
        const newOffset = Math.min(offsetIndex + maxResults, filtered.length);
        const page = filtered.slice(offsetIndex, newOffset);

        const sqlCharts: SqlChartAsCode[] = page.map((chart) => {
            const space = spacesByUuid.get(chart.space.uuid);
            return {
                name: chart.name,
                description: chart.description,
                slug: chart.slug,
                sql: chart.sql,
                limit: chart.limit,
                config: chart.config,
                chartKind: chart.chartKind,
                version: currentVersion,
                contentType: ContentAsCodeType.SQL_CHART,
                spaceSlug: space
                    ? getContentAsCodePathFromLtreePath(space.path)
                    : chart.space.name,
                updatedAt: chart.lastUpdatedAt,
                downloadedAt: new Date(),
            };
        });

        return {
            sqlCharts,
            missingIds: CoderService.getMissingIds(
                ids,
                page.map((chart) => ({
                    slug: chart.slug,
                    uuid: chart.savedSqlUuid,
                })),
            ),
            spaces: CoderService.spacesMetadataFromSummaries(accessibleSpaces),
            total: filtered.length,
            offset: newOffset,
        };
    }

    async upsertSqlChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        sqlChartAsCode: SqlChartAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        _force?: boolean,
        spaceNames?: Record<string, string>,
    ): Promise<PromotionChanges> {
        const project = await this.projectModel.get(projectUuid);
        CoderService.assertCanUpload(user, project);

        const { space, created: spaceCreated } = await this.getOrCreateSpace(
            projectUuid,
            sqlChartAsCode.spaceSlug,
            user,
            skipSpaceCreate,
            publicSpaceCreate,
            spaceNames,
        );

        const existing = await this.savedSqlModel.find({
            projectUuid,
            slug,
        });
        const [existingRow] = existing;

        if (!existingRow) {
            const created = await this.savedSqlModel.create(
                user.userUuid,
                projectUuid,
                {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                    spaceUuid: space.uuid,
                    slug,
                },
            );
            return {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            uuid: created.savedSqlUuid,
                            name: sqlChartAsCode.name,
                            slug,
                            spaceSlug: sqlChartAsCode.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                sqlChartAsCode.spaceSlug,
                            ),
                            oldUuid: created.savedSqlUuid,
                        } as PromotionChanges['charts'][number]['data'],
                    },
                ],
                dashboards: [],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
            };
        }

        const existingChart = SavedSqlModel.convertSelectSavedSql(existingRow);
        await this.savedSqlModel.update({
            userUuid: user.userUuid,
            savedSqlUuid: existingChart.savedSqlUuid,
            sqlChart: {
                unversionedData: {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    spaceUuid: space.uuid,
                },
                versionedData: {
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                },
            },
        });

        return {
            charts: [
                {
                    action: PromotionAction.UPDATE,
                    data: {
                        uuid: existingChart.savedSqlUuid,
                        name: sqlChartAsCode.name,
                        slug,
                        spaceSlug: sqlChartAsCode.spaceSlug,
                        spacePath: getContentAsCodePathFromLtreePath(
                            sqlChartAsCode.spaceSlug,
                        ),
                        oldUuid: existingChart.savedSqlUuid,
                    } as PromotionChanges['charts'][number]['data'],
                },
            ],
            dashboards: [],
            spaces: [],
        };
    }

    async getVirtualViews(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
    ): Promise<ApiVirtualViewAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        CoderService.assertCanDownload(user, project);

        const cached = await this.projectModel.findVirtualViewsFromCache(
            projectUuid,
        );
        const missingSlugs: string[] = [];
        const skipped: ApiVirtualViewAsCodeListResponse['results']['skipped'] =
            [];
        const requested = slugs && slugs.length > 0 ? new Set(slugs) : null;

        if (requested) {
            requested.forEach((slug) => {
                if (!cached[slug]) {
                    missingSlugs.push(slug);
                }
            });
        }

        const virtualViews: VirtualViewAsCode[] = Object.values(cached)
            .filter((explore) => !requested || requested.has(explore.name))
            .flatMap((explore) => {
                if (
                    isExploreError(explore) ||
                    explore.type !== ExploreType.VIRTUAL
                ) {
                    skipped.push({
                        slug: explore.name,
                        reason: 'Virtual view could not be compiled',
                    });
                    return [];
                }
                const table = explore.tables[explore.baseTable];
                const wrappedSql = table?.sqlTable ?? '';
                const sql =
                    wrappedSql.startsWith('(') && wrappedSql.endsWith(')')
                        ? wrappedSql.slice(1, -1)
                        : wrappedSql;
                const columns = Object.values(table?.dimensions ?? {}).map(
                    (dimension) => ({
                        reference: dimension.name,
                        type: dimension.type,
                    }),
                );
                return [
                    {
                        contentType: ContentAsCodeType.VIRTUAL_VIEW,
                        version: currentVersion,
                        slug: explore.name,
                        name: explore.label,
                        sql,
                        columns,
                    },
                ];
            });

        return { virtualViews, skipped, missingSlugs };
    }

    async upsertVirtualView(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        virtualView: VirtualViewAsCode,
    ): Promise<{
        action: PromotionAction.CREATE | PromotionAction.UPDATE;
    }> {
        const project = await this.projectModel.get(projectUuid);
        CoderService.assertCanUpload(user, project);

        const cached = await this.projectModel.findVirtualViewsFromCache(
            projectUuid,
        );
        const exists = Boolean(cached[slug]);
        const compiled = createTemporaryVirtualView(
            slug,
            virtualView.sql,
            virtualView.columns,
        );
        const warehouseClient = {
            getAdapterType: () => compiled.targetDatabase,
            getFieldQuoteChar: () => '"',
            getStringQuoteChar: () => "'",
            getEscapeStringQuoteChar: () => "''",
            getFloatingType: () => 'FLOAT',
            getMetricSql: () => '',
            concatString: (...args: string[]) => args.join(''),
            getStartOfWeek: () => undefined,
            credentials: { type: 'bigquery' },
            getCatalog: async () => ({}),
            streamQuery: async () => undefined,
            runQuery: async () => ({ fields: {}, rows: [] }),
            test: async () => undefined,
            getAllTables: async () => [],
            getFields: async () => ({}),
            executeAsyncQuery: async () => ({
                queryId: null,
                queryMetadata: null,
                totalRows: 0,
                durationMs: 0,
            }),
            getAsyncQueryResults: async () => ({
                queryId: null,
                queryMetadata: null,
                totalRows: 0,
                durationMs: 0,
                fields: {},
                pageCount: 0,
                rows: [],
            }),
        } as unknown as WarehouseClient;

        if (exists) {
            await this.projectModel.updateVirtualView(
                projectUuid,
                slug,
                {
                    name: virtualView.name,
                    sql: virtualView.sql,
                    columns: virtualView.columns,
                },
                warehouseClient,
            );
            return { action: PromotionAction.UPDATE };
        }

        await this.projectModel.createVirtualView(
            projectUuid,
            {
                name: slug,
                sql: virtualView.sql,
                columns: virtualView.columns,
            },
            warehouseClient,
        );
        return { action: PromotionAction.CREATE };
    }
}

import { subject } from '@casl/ability';
import {
    DashboardSearchResult,
    DashboardTabResult,
    FieldSearchResult,
    ForbiddenError,
    isTableErrorSearchResult,
    isUserWithOrg,
    SavedChartSearchResult,
    SearchFilters,
    SearchResults,
    SessionUser,
    SpaceSearchResult,
    TableErrorSearchResult,
    TableSearchResult,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';
import { hasUserAttributes } from '../UserAttributesService/UserAttributeUtils';

type SearchServiceArguments = {
    analytics: LightdashAnalytics;
    searchModel: SearchModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    userAttributesModel: UserAttributesModel;
    dashboardService: DashboardService;
};

export class SearchService extends BaseService {
    private readonly searchModel: SearchModel;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly dashboardService: DashboardService;

    constructor(args: SearchServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.searchModel = args.searchModel;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.userAttributesModel = args.userAttributesModel;
        this.dashboardService = args.dashboardService;
    }

    async getSearchResults(
        user: SessionUser,
        projectUuid: string,
        query: string,
        source: 'omnibar' | 'ai_search_box' = 'omnibar',
        filters?: SearchFilters,
    ): Promise<SearchResults> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const results = await this.searchModel.search(
            projectUuid,
            query,
            filters,
        );

        const spaceUuids = [
            ...new Set([
                ...results.dashboards.map((dashboard) => dashboard.spaceUuid),
                ...results.dashboardTabs.map(
                    (dashboardTab) => dashboardTab.spaceUuid,
                ),
                ...results.sqlCharts.map((sqlChart) => sqlChart.spaceUuid),
                ...results.savedCharts.map(
                    (savedChart) => savedChart.spaceUuid,
                ),
                ...results.spaces.map((space) => space.uuid),
            ]),
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

        const filterItem = async (
            item:
                | DashboardSearchResult
                | SpaceSearchResult
                | SavedChartSearchResult
                | DashboardTabResult,
        ) => {
            const spaceUuid: string =
                'spaceUuid' in item ? item.spaceUuid : item.uuid;
            const itemSpace = spaces.find((s) => s.uuid === spaceUuid);
            return (
                itemSpace &&
                hasViewAccessToSpace(
                    user,
                    itemSpace,
                    spacesAccess[spaceUuid] ?? [],
                )
            );
        };

        const hasExploreAccess = user.ability.can(
            'manage',
            subject('Explore', {
                organizationUuid,
                projectUuid,
            }),
        );

        const dimensionsHaveUserAttributes = results.fields.some(
            (field) =>
                field.requiredAttributes !== undefined ||
                Object.values(field.tablesRequiredAttributes || {}).some(
                    (tableHaveUserAttributes) =>
                        tableHaveUserAttributes !== undefined,
                ),
        );
        const tablesHaveUserAttributes = results.tables.some(
            (table) =>
                !isTableErrorSearchResult(table) &&
                table.requiredAttributes !== undefined,
        );
        let filteredFields: FieldSearchResult[] = [];
        let filteredTables: (TableSearchResult | TableErrorSearchResult)[] = [];
        if (hasExploreAccess) {
            if (dimensionsHaveUserAttributes || tablesHaveUserAttributes) {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );
                filteredFields = results.fields.filter(
                    (field) =>
                        hasUserAttributes(
                            field.requiredAttributes,
                            userAttributes,
                        ) &&
                        Object.values(
                            field.tablesRequiredAttributes || {},
                        ).every((tableHaveUserAttributes) =>
                            hasUserAttributes(
                                tableHaveUserAttributes,
                                userAttributes,
                            ),
                        ),
                );
                filteredTables = results.tables.filter(
                    (table) =>
                        isTableErrorSearchResult(table) ||
                        hasUserAttributes(
                            table.requiredAttributes,
                            userAttributes,
                        ),
                );
            } else {
                filteredFields = results.fields;
                filteredTables = results.tables;
            }
        }

        const hasDashboardAccess = await Promise.all(
            results.dashboards.map(filterItem),
        );

        // Filter dashboards for viewer users in customer use projects
        const allowedDashboardUuids =
            await this.dashboardService.getAllowedDashboardUuidsForViewer(
                user,
                projectUuid,
            );

        const hasDashboardTabAccess = await Promise.all(
            results.dashboardTabs.map(filterItem),
        );
        const hasSavedChartAccess = await Promise.all(
            results.savedCharts.map(filterItem),
        );

        const hasSqlChartAccess = await Promise.all(
            results.sqlCharts.map(filterItem),
        );

        const hasSpaceAccess = await Promise.all(
            results.spaces.map(filterItem),
        );

        // Apply dashboard filtering based on RPC interface
        let filteredDashboards = results.dashboards.filter(
            (_, index) => hasDashboardAccess[index],
        );

        // If filtering is needed (allowedDashboardUuids is not undefined),
        // filter by allowed dashboard UUIDs
        // Only filter if user has joined organization and has identity
        // Otherwise, let CASL check handle it (e.g., for users who need to join organization)
        if (allowedDashboardUuids !== undefined && isUserWithOrg(user)) {
            filteredDashboards = filteredDashboards.filter((dashboard) =>
                allowedDashboardUuids.has(dashboard.uuid),
            );
        }

        const filteredResults = {
            ...results,
            tables: filteredTables,
            fields: filteredFields,
            dashboards: filteredDashboards,
            dashboardTabs: results.dashboardTabs.filter(
                (_, index) => hasDashboardTabAccess[index],
            ),
            savedCharts: results.savedCharts.filter(
                (_, index) => hasSavedChartAccess[index],
            ),
            sqlCharts: results.sqlCharts.filter(
                (_, index) => hasSqlChartAccess[index],
            ),
            spaces: results.spaces.filter((_, index) => hasSpaceAccess[index]),
            pages: user.ability.can(
                'view',
                subject('Analytics', {
                    organizationUuid,
                }),
            )
                ? results.pages
                : [], // For now there is only 1 page and it is for admins only
        };

        this.analytics.track({
            event: 'project.search',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                spacesResultsCount: filteredResults.spaces.length,
                dashboardsResultsCount: filteredResults.dashboards.length,
                savedChartsResultsCount: filteredResults.savedCharts.length,
                sqlChartsResultsCount: filteredResults.sqlCharts.length,
                tablesResultsCount: filteredResults.tables.length,
                fieldsResultsCount: filteredResults.fields.length,
                dashboardTabsResultsCount: filteredResults.dashboardTabs.length,
                source,
            },
        });

        return filteredResults;
    }
}

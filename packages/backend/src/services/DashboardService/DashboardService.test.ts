import { Ability } from '@casl/ability';
import {
    ChartKind,
    type Dashboard,
    type DashboardChartTile,
    type DashboardSqlChartTile,
    type DashboardTab,
    type DashboardTile,
    DashboardTileTypes,
    defineUserAbility,
    type Explore,
    FilterOperator,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    ProjectMemberRole,
    SessionUser,
    ViewerContentScope,
} from '@lightdash/common';

import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { CategoryRpcClient } from '../../clients/CategoryRpcClient/CategoryRpcClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserDashboardCategoryModel } from '../../models/UserDashboardCategoryModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectOperationLogService } from '../ProjectOperationLogService/ProjectOperationLogService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { DashboardAllowListUser, DashboardService } from './DashboardService';
import {
    chart,
    createDashboard,
    createDashboardWithSlug,
    createDashboardWithTileIds,
    dashboard,
    dashboardsDetails,
    privateSpace,
    publicSpace,
    space,
    updateDashboard,
    updateDashboardDetailsAndTiles,
    updateDashboardTiles,
    updateDashboardTilesWithIds,
    user,
} from './DashboardService.mock';

const dashboardModel = {
    getAllByProject: jest.fn(async () => dashboardsDetails),

    getByIdOrSlug: jest.fn(async () => dashboard),

    create: jest.fn(async () => dashboard),

    update: jest.fn(async () => dashboard),

    delete: jest.fn(async () => dashboard),

    addVersion: jest.fn(async () => dashboard),

    getOrphanedCharts: jest.fn(async () => []),

    getOrphanedSqlCharts: jest.fn(async () => []),

    getExploreNamesByDashboardUuids: jest.fn(async () => new Set<string>()),

    getChartUuidsByDashboardUuids: jest.fn(async () => new Set<string>()),

    getSpaceUuidsByDashboardUuids: jest.fn(async () => new Set<string>()),

    getSpaceUuidsByChartUuids: jest.fn(async () => new Set<string>()),
};

const spaceModel = {
    getFullSpace: jest.fn(async () => publicSpace),
    getSpaceSummary: jest.fn(async () => publicSpace),
    getFirstAccessibleSpace: jest.fn(async () => space),
    getUserSpaceAccess: jest.fn(async () => []),
    getUserSpacesAccess: jest.fn(async () => ({})),
    getSpaceUuidsWithAncestors: jest.fn(
        async (uuids: string[]) => new Set(uuids),
    ),
};
const analyticsModel = {
    addDashboardViewEvent: jest.fn(async () => null),
};
const savedChartModel = {
    get: jest.fn(async () => chart),
    delete: jest.fn(async () => ({
        uuid: 'chart_uuid',
        projectUuid: 'project_uuid',
    })),
    create: jest.fn(async () => chart),
};
const projectModel = {
    getExploreFromCache: jest.fn(async () => ({}) as unknown as Explore),
};
const catalogModel = {
    findTablesCachedExploreUuid: jest.fn(async () => ({})),
    updateFieldsChartUsage: jest.fn(async () => undefined),
};
const userDashboardCategoryModel = {
    getDatabase: jest.fn(),
};
const savedSqlModel = {
    getByUuid: jest.fn(async () => ({
        savedSqlUuid: 'savedSqlUuid',
        name: 'sql chart name',
        description: null,
        slug: 'sql-chart-slug',
        sql: 'select 1',
        limit: 100,
        config: { type: ChartKind.TABLE },
        chartKind: ChartKind.TABLE,
        space: {
            uuid: 'spaceUuid',
            name: 'space name',
            isPrivate: false,
        },
        project: { projectUuid: 'projectUuid' },
        dashboard: null,
        organization: { organizationUuid: 'organizationUuid' },
    })),
    create: jest.fn(async () => ({
        savedSqlUuid: 'newSavedSqlUuid',
        slug: 'new-sql-chart-slug',
        savedSqlVersionUuid: 'newSavedSqlVersionUuid',
    })),
    delete: jest.fn(async () => undefined),
};

jest.spyOn(analyticsMock, 'track');
describe('DashboardService', () => {
    const projectUuid = 'projectUuid';
    const { uuid: dashboardUuid } = dashboard;
    const service = new DashboardService({
        analytics: analyticsMock,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        analyticsModel: analyticsModel as unknown as AnalyticsModel,
        pinnedListModel: {} as PinnedListModel,
        schedulerModel: {} as SchedulerModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        savedChartService: {} as SavedChartService, // Mock for test
        projectModel: projectModel as unknown as ProjectModel,
        slackClient: {} as SlackClient,
        schedulerClient: {} as SchedulerClient,
        catalogModel: catalogModel as unknown as CatalogModel,
        userDashboardCategoryModel:
            userDashboardCategoryModel as unknown as UserDashboardCategoryModel,
        categoryRpcClient: {} as CategoryRpcClient,
        organizationMemberProfileModel: {} as OrganizationMemberProfileModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
    });
    service.getAllowedDashboardUuidsForViewer = jest.fn(async () => undefined);
    afterEach(() => {
        jest.clearAllMocks();
        // The client-use allow-list / content scope are cached, drop the cache
        // so the tests do not share results
        service.clearViewerContentCache();
        (
            service.getAllowedDashboardUuidsForViewer as jest.Mock
        ).mockResolvedValue(undefined);
    });
    describe('getAllowedExploreNamesForViewer', () => {
        test('should skip when dashboard allow-list is undefined', async () => {
            const result = await service.getAllowedExploreNamesForViewer(
                user,
                projectUuid,
            );

            expect(result).toBeUndefined();
            expect(
                dashboardModel.getExploreNamesByDashboardUuids,
            ).not.toHaveBeenCalled();
        });

        test('should reverse-lookup explores from allow-listed dashboards', async () => {
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set(['dash-1']));
            (
                dashboardModel.getExploreNamesByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['orders']));

            const result = await service.getAllowedExploreNamesForViewer(
                user,
                projectUuid,
            );

            expect(result).toEqual(new Set(['orders']));
            expect(
                dashboardModel.getExploreNamesByDashboardUuids,
            ).toHaveBeenCalledWith(['dash-1']);
        });

        test('should return empty set when dashboard allow-list is empty', async () => {
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set());
            (
                dashboardModel.getExploreNamesByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set());

            const result = await service.getAllowedExploreNamesForViewer(
                user,
                projectUuid,
            );

            expect(result).toEqual(new Set());
            expect(
                dashboardModel.getExploreNamesByDashboardUuids,
            ).toHaveBeenCalledWith([]);
        });
    });

    describe('getViewerContentScope', () => {
        test('should skip when the dashboard allow-list is undefined', async () => {
            const result = await service.getViewerContentScope(
                user,
                projectUuid,
            );

            expect(result).toBeUndefined();
            expect(
                dashboardModel.getChartUuidsByDashboardUuids,
            ).not.toHaveBeenCalled();
        });

        test('should fail closed when the dashboard allow-list is empty', async () => {
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set());

            const result = await service.getViewerContentScope(
                user,
                projectUuid,
            );

            expect(result).toEqual({
                dashboardUuids: [],
                chartUuids: [],
                spaceUuids: [],
                exploreNames: [],
            });
        });

        test('should derive charts, spaces and explores from the allow-listed dashboards', async () => {
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set(['dash-1']));
            (
                dashboardModel.getChartUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['chart-1']));
            (
                dashboardModel.getSpaceUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['space-child']));
            (
                dashboardModel.getExploreNamesByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['orders']));

            const result = await service.getViewerContentScope(
                user,
                projectUuid,
            );

            expect(result).toEqual({
                dashboardUuids: ['dash-1'],
                chartUuids: ['chart-1'],
                // The space of the allow-listed dashboard plus its
                // ancestors, so the space tree stays navigable
                spaceUuids: ['space-child'],
                exploreNames: ['orders'],
            });
        });

        test('keeps the space of the allow-listed dashboard', async () => {
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set(['dash-1']));
            (
                dashboardModel.getChartUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['chart-1']));
            (
                dashboardModel.getSpaceUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['space-of-dashboard']));
            (
                dashboardModel.getExploreNamesByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['orders']));

            const result = await service.getViewerContentScope(
                user,
                projectUuid,
            );

            expect(result?.spaceUuids).toEqual(['space-of-dashboard']);
            expect(result?.chartUuids).toEqual(['chart-1']);
        });

        test('keeps the space of a visible chart', async () => {
            // A chart the user can see always belongs to a visible space
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set(['dash-1']));
            (
                dashboardModel.getChartUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['chart-1']));
            (
                dashboardModel.getSpaceUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['space-of-dashboard']));
            (
                dashboardModel.getSpaceUuidsByChartUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['space-of-chart']));
            (
                dashboardModel.getExploreNamesByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['orders']));
            (
                spaceModel.getSpaceUuidsWithAncestors as jest.Mock
            ).mockResolvedValueOnce(
                new Set(['space-of-dashboard', 'space-of-chart']),
            );

            const result = await service.getViewerContentScope(
                user,
                projectUuid,
            );

            expect(result?.spaceUuids).toEqual([
                'space-of-dashboard',
                'space-of-chart',
            ]);
        });

        test('keeps the ancestors of the visible spaces', async () => {
            // The parent space has to stay visible, otherwise the space tree
            // is not navigable
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set(['dash-1']));
            (
                dashboardModel.getChartUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['chart-1']));
            (
                dashboardModel.getSpaceUuidsByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['space-child']));
            (
                dashboardModel.getExploreNamesByDashboardUuids as jest.Mock
            ).mockResolvedValueOnce(new Set(['orders']));
            (
                spaceModel.getSpaceUuidsWithAncestors as jest.Mock
            ).mockResolvedValueOnce(
                new Set(['space-child', 'space-parent', 'space-root']),
            );

            const result = await service.getViewerContentScope(
                user,
                projectUuid,
            );

            expect(result?.spaceUuids).toEqual([
                'space-child',
                'space-parent',
                'space-root',
            ]);
        });
    });

    describe('client-use content cache', () => {
        // The instance method is replaced by a mock in this test file, the
        // original implementation is needed to test the cache
        const originalGetAllowedDashboardUuidsForViewer =
            DashboardService.prototype.getAllowedDashboardUuidsForViewer;

        const callAllowList = () =>
            originalGetAllowedDashboardUuidsForViewer.call(
                service,
                user,
                projectUuid,
            );

        type AllowListInternals = {
            fetchAllowedDashboardUuids: (
                u: DashboardAllowListUser,
                p: string,
            ) => Promise<{ uuids: Set<string> | undefined; failed: boolean }>;
            fetchViewerContentScope: (
                u: DashboardAllowListUser,
                p: string,
            ) => Promise<ViewerContentScope | undefined>;
        };

        const internals = service as unknown as AllowListInternals;

        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('shares a single allow-list resolution between concurrent requests', async () => {
            const fetchSpy = jest
                .spyOn(internals, 'fetchAllowedDashboardUuids')
                .mockResolvedValue({
                    uuids: new Set(['dash-1']),
                    failed: false,
                });

            const [first, second] = await Promise.all([
                callAllowList(),
                callAllowList(),
            ]);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(first).toEqual(new Set(['dash-1']));
            expect(second).toEqual(new Set(['dash-1']));
        });

        test('reuses the allow-list until the cache expires', async () => {
            const fetchSpy = jest
                .spyOn(internals, 'fetchAllowedDashboardUuids')
                .mockResolvedValue({
                    uuids: new Set(['dash-1']),
                    failed: false,
                });

            await callAllowList();
            await callAllowList();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(31_000);
            await callAllowList();
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        test('retries a failed allow-list quickly', async () => {
            const fetchSpy = jest
                .spyOn(internals, 'fetchAllowedDashboardUuids')
                .mockResolvedValue({ uuids: new Set<string>(), failed: true });

            await callAllowList();
            await callAllowList();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            // The failed result is only cached briefly
            jest.advanceTimersByTime(6_000);
            await callAllowList();
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        test('caches the content scope', async () => {
            const scopeSpy = jest
                .spyOn(internals, 'fetchViewerContentScope')
                .mockResolvedValue({
                    dashboardUuids: ['dash-1'],
                    chartUuids: [],
                    spaceUuids: [],
                    exploreNames: [],
                });

            await service.getViewerContentScope(user, projectUuid);
            await service.getViewerContentScope(user, projectUuid);

            expect(scopeSpy).toHaveBeenCalledTimes(1);
        });

        test('drops the cache on demand', async () => {
            const fetchSpy = jest
                .spyOn(internals, 'fetchAllowedDashboardUuids')
                .mockResolvedValue({
                    uuids: new Set(['dash-1']),
                    failed: false,
                });

            await callAllowList();
            service.clearViewerContentCache();
            await callAllowList();

            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('resolveDashboardContextForMetadata', () => {
        test('should return the canonical slug and name of the dashboard', async () => {
            const result = await service.resolveDashboardContextForMetadata(
                user,
                projectUuid,
                'name',
            );

            expect(result).toEqual({
                dashboardSlug: 'name',
                dashboardName: 'name',
                filterTableNames: [],
            });
        });

        test('should return the tables the dashboard filters on', async () => {
            (dashboardModel.getByIdOrSlug as jest.Mock).mockImplementationOnce(
                async () => ({
                    ...dashboard,
                    filters: {
                        dimensions: [
                            {
                                id: 'filter-dimension',
                                target: { fieldId: 'a_dim1', tableName: 'a' },
                            },
                        ],
                        metrics: [
                            {
                                id: 'filter-metric',
                                target: { fieldId: 'b_count', tableName: 'b' },
                            },
                        ],
                        tableCalculations: [],
                    },
                }),
            );

            const result = await service.resolveDashboardContextForMetadata(
                user,
                projectUuid,
                'name',
            );

            expect(result?.filterTableNames).toEqual(['a', 'b']);
        });

        test('should return undefined when the dashboard belongs to another project', async () => {
            const result = await service.resolveDashboardContextForMetadata(
                user,
                'another-project',
                'name',
            );

            expect(result).toBeUndefined();
        });

        test('should throw when the dashboard is not in the client-use allow-list', async () => {
            (
                service.getAllowedDashboardUuidsForViewer as jest.Mock
            ).mockResolvedValueOnce(new Set(['another-dashboard']));

            await expect(
                service.resolveDashboardContextForMetadata(
                    user,
                    projectUuid,
                    'name',
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    test('should get dashboard by uuid', async () => {
        const result = await service.getByIdOrSlug(user, dashboard.uuid);

        expect(result).toEqual(dashboard);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            dashboard.uuid,
        );
    });
    test('should get all dashboard by project uuid', async () => {
        const result = await service.getAllByProject(
            user,
            projectUuid,
            undefined,
        );

        expect(result).toEqual(dashboardsDetails);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledWith(
            projectUuid,
            undefined,
            undefined,
        );
    });
    test('should create dashboard', async () => {
        const result = await service.create(user, projectUuid, createDashboard);

        expect(result).toEqual({ ...dashboard, isPrivate: space.is_private });
        expect(dashboardModel.create).toHaveBeenCalledTimes(1);
        expect(dashboardModel.create).toHaveBeenCalledWith(
            space.space_uuid,
            createDashboardWithSlug,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.created',
            }),
        );
    });
    test('should create dashboard with tile ids', async () => {
        const result = await service.create(
            user,
            projectUuid,
            createDashboardWithTileIds,
        );

        expect(result).toEqual({ ...dashboard, isPrivate: space.is_private });
        expect(dashboardModel.create).toHaveBeenCalledTimes(1);
        expect(dashboardModel.create).toHaveBeenCalledWith(
            space.space_uuid,
            createDashboardWithTileIds,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.created',
            }),
        );
    });
    test('should update dashboard details', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboard,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.update).toHaveBeenCalledTimes(1);
        expect(dashboardModel.update).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboard,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.updated',
            }),
        );
    });
    test('should update dashboard version', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardTiles,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTiles,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should update dashboard version with tile ids', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardTilesWithIds,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTilesWithIds,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should update dashboard details & version', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardDetailsAndTiles,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.update).toHaveBeenCalledTimes(1);
        expect(dashboardModel.update).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboard,
        );
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTiles,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(2);
        expect(analyticsMock.track).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                event: 'dashboard.updated',
            }),
        );
        expect(analyticsMock.track).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should delete orphan charts when updating dashboard version', async () => {
        (dashboardModel.getOrphanedCharts as jest.Mock).mockImplementationOnce(
            async () => [{ uuid: 'chart_uuid' }],
        );

        await service.update(user, dashboardUuid, updateDashboardTiles);

        expect(savedChartModel.delete).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledTimes(2);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.deleted',
            }),
        );
    });
    test('should delete orphan SQL charts when updating dashboard version', async () => {
        (
            dashboardModel.getOrphanedSqlCharts as jest.Mock
        ).mockImplementationOnce(async () => [
            { savedSqlUuid: 'orphan-sql-chart-uuid' },
        ]);

        await service.update(user, dashboardUuid, updateDashboardTiles);

        expect(savedSqlModel.delete).toHaveBeenCalledTimes(1);
        expect(savedSqlModel.delete).toHaveBeenCalledWith(
            'orphan-sql-chart-uuid',
        );
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'sql_chart.deleted',
            }),
        );
    });
    test('should delete dashboard', async () => {
        await service.delete(user, dashboardUuid);

        expect(dashboardModel.delete).toHaveBeenCalledTimes(1);
        expect(dashboardModel.delete).toHaveBeenCalledWith(dashboardUuid);
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.deleted',
            }),
        );
    });
    test('should not see dashboard from other organizations', async () => {
        const anotherUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [],
            ),
        };
        await expect(
            service.getByIdOrSlug(anotherUser, dashboard.uuid),
        ).rejects.toThrowError(ForbiddenError);
    });
    test('should see empty list if getting all dashboard by project uuid from another organization', async () => {
        const anotherUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [],
            ),
        };
        const result = await service.getAllByProject(
            anotherUser,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledWith(
            projectUuid,
            undefined,
            undefined,
        );
    });

    test('should not see dashboard from private space if you are not admin', async () => {
        (spaceModel.getSpaceSummary as jest.Mock).mockImplementationOnce(
            async () => privateSpace,
        );

        const userViewer = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [
                    {
                        projectUuid,
                        role: ProjectMemberRole.VIEWER,
                        userUuid: user.userUuid,
                        roleUuid: undefined,
                    },
                ],
            ),
        };
        await expect(
            service.getByIdOrSlug(userViewer, dashboard.uuid),
        ).rejects.toThrowError(ForbiddenError);
    });
    test('should see dashboard from private space if you are admin', async () => {
        (spaceModel.getFullSpace as jest.Mock).mockImplementationOnce(
            async () => privateSpace,
        );

        const result = await service.getByIdOrSlug(user, dashboard.uuid);

        expect(result).toEqual(dashboard);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            dashboard.uuid,
        );
    });

    test('should not see dashboards from private space if you are not an admin', async () => {
        (spaceModel.getSpaceSummary as jest.Mock).mockImplementationOnce(
            async () => privateSpace,
        );

        const editorUser: SessionUser = {
            ...user,
            role: OrganizationMemberRole.EDITOR,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Dashboard',
                    action: ['view', 'update', 'delete', 'create'],
                },
            ]),
        };
        const result = await service.getAllByProject(
            editorUser,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
    });

    describe('duplicate', () => {
        const NEW_DASHBOARD_UUID = 'new-dashboard-uuid';
        const SOURCE_DASHBOARD_UUID = 'source-dashboard-uuid';
        const SOURCE_TILE_UUID = 'source-tile-uuid';
        const SOURCE_TAB_UUID = 'source-tab-uuid';
        const SOURCE_CHART_UUID = 'source-chart-uuid';
        const DUPLICATED_CHART_UUID = 'duplicated-chart-uuid';
        const DUPLICATED_SQL_UUID = 'duplicated-sql-uuid';

        // The user needs to be able to create dashboards and to view the
        // charts of the space they belong to
        const duplicateUser: SessionUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Dashboard',
                    action: ['view', 'update', 'delete', 'create'],
                },
                {
                    subject: 'SavedChart',
                    action: ['view', 'update', 'delete', 'create'],
                },
            ]),
        };

        const newDashboard: Dashboard = {
            ...dashboard,
            uuid: NEW_DASHBOARD_UUID,
            name: 'duplicated dashboard',
            slug: 'duplicated-dashboard',
            tiles: [],
        };

        // A chart owned by a space (not by a dashboard)
        const sourceChart = {
            ...chart,
            uuid: SOURCE_CHART_UUID,
            spaceUuid: 'spaceUuid',
            dashboardUuid: null,
        };

        const duplicatedChart = {
            ...chart,
            uuid: DUPLICATED_CHART_UUID,
            slug: 'chart-name-duplicated',
            dashboardUuid: NEW_DASHBOARD_UUID,
        };

        const sourceSqlChart = {
            savedSqlUuid: 'source-sql-uuid',
            name: 'sql chart name',
            description: null,
            slug: 'sql-chart-slug',
            sql: 'select 1',
            limit: 100,
            config: { type: ChartKind.TABLE },
            chartKind: ChartKind.TABLE,
            space: {
                uuid: 'spaceUuid',
                name: 'space name',
                isPrivate: false,
            },
            project: { projectUuid: 'projectUuid' },
            dashboard: null,
            organization: { organizationUuid: 'organizationUuid' },
        };

        const savedChartTile: DashboardTile = {
            uuid: SOURCE_TILE_UUID,
            type: DashboardTileTypes.SAVED_CHART,
            properties: {
                savedChartUuid: SOURCE_CHART_UUID,
                title: 'source chart',
            },
            x: 0,
            y: 0,
            h: 9,
            w: 15,
            tabUuid: SOURCE_TAB_UUID,
        };

        const sqlChartTile: DashboardTile = {
            uuid: 'source-sql-tile-uuid',
            type: DashboardTileTypes.SQL_CHART,
            properties: {
                savedSqlUuid: 'source-sql-uuid',
                chartName: 'sql chart name',
                title: 'sql chart',
            },
            x: 0,
            y: 0,
            h: 9,
            w: 15,
            tabUuid: SOURCE_TAB_UUID,
        };

        const markdownTile: DashboardTile = {
            uuid: 'source-markdown-tile-uuid',
            type: DashboardTileTypes.MARKDOWN,
            properties: {
                title: 'markdown',
                content: '# hello',
            },
            x: 0,
            y: 0,
            h: 9,
            w: 15,
            tabUuid: SOURCE_TAB_UUID,
        };

        const tileTargets = {
            [SOURCE_TILE_UUID]: {
                fieldId: 'orders_status',
                tableName: 'orders',
            },
        };

        const sourceTab: DashboardTab = {
            uuid: SOURCE_TAB_UUID,
            name: 'Tab 1',
            order: 0,
            filters: {
                dimensions: [
                    {
                        id: 'tab-filter-1',
                        label: undefined,
                        operator: FilterOperator.EQUALS,
                        target: { fieldId: 'orders_status', tableName: 'orders' },
                        values: [],
                        tileTargets,
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
        };

        const buildSourceDashboard = (
            overrides: Partial<Dashboard> = {},
        ): Dashboard => ({
            ...dashboard,
            uuid: SOURCE_DASHBOARD_UUID,
            name: 'source dashboard',
            slug: 'source-dashboard',
            projectUuid: 'projectUuid',
            spaceUuid: 'spaceUuid',
            tiles: [savedChartTile],
            tabs: [sourceTab],
            filters: {
                dimensions: [
                    {
                        id: 'dashboard-filter-1',
                        label: undefined,
                        operator: FilterOperator.EQUALS,
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        values: [],
                        tileTargets,
                        lockedTabUuids: [SOURCE_TAB_UUID],
                        parentScope: 'tab',
                        parentTabUuid: SOURCE_TAB_UUID,
                    },
                    {
                        id: 'dashboard-filter-global',
                        label: undefined,
                        operator: FilterOperator.EQUALS,
                        target: { fieldId: 'orders_id', tableName: 'orders' },
                        values: [],
                        parentScope: 'global',
                        parentTabUuid: SOURCE_TAB_UUID,
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
            config: {
                isDateZoomDisabled: false,
                syncChartTileUuids: [SOURCE_TILE_UUID],
            },
            ...overrides,
        });

        let sourceDashboard: Dashboard;

        const duplicateParams = {
            dashboardName: 'duplicated dashboard',
            dashboardDesc: 'duplicated description',
        };

        const getAddVersionPayload = () =>
            (dashboardModel.addVersion as jest.Mock).mock.calls[0][1];

        beforeEach(() => {
            sourceDashboard = buildSourceDashboard();
            (
                dashboardModel.getByIdOrSlug as jest.Mock
            ).mockImplementation(async (uuid: string) =>
                uuid === NEW_DASHBOARD_UUID ? newDashboard : sourceDashboard,
            );
            (dashboardModel.create as jest.Mock).mockResolvedValue(newDashboard);
            (dashboardModel.addVersion as jest.Mock).mockResolvedValue(
                newDashboard,
            );
            (spaceModel.getSpaceSummary as jest.Mock).mockResolvedValue(
                publicSpace,
            );
            (spaceModel.getUserSpaceAccess as jest.Mock).mockResolvedValue([]);
            (savedChartModel.get as jest.Mock).mockResolvedValue(sourceChart);
            (savedChartModel.create as jest.Mock).mockResolvedValue(
                duplicatedChart,
            );
            (savedSqlModel.getByUuid as jest.Mock).mockResolvedValue(
                sourceSqlChart,
            );
            (savedSqlModel.create as jest.Mock).mockResolvedValue({
                savedSqlUuid: DUPLICATED_SQL_UUID,
                slug: 'duplicated-sql-slug',
                savedSqlVersionUuid: 'duplicated-sql-version-uuid',
            });
        });

        test('duplicates a space owned saved chart into a new dashboard owned chart', async () => {
            await service.duplicate(
                duplicateUser,
                projectUuid,
                SOURCE_DASHBOARD_UUID,
                duplicateParams,
            );

            expect(savedChartModel.create).toHaveBeenCalledTimes(1);
            const [
                createProjectUuid,
                createUserUuid,
                createPayload,
            ] = (savedChartModel.create as jest.Mock).mock.calls[0];
            expect(createProjectUuid).toBe(projectUuid);
            expect(createUserUuid).toBe(user.userUuid);
            expect(createPayload.dashboardUuid).toBe(NEW_DASHBOARD_UUID);
            expect(createPayload.spaceUuid).toBeNull();
            expect(createPayload.updatedByUser).toEqual({
                userUuid: user.userUuid,
                firstName: user.firstName,
                lastName: user.lastName,
            });
            // the copy gets its own slug
            expect(createPayload.slug).not.toBe(chart.slug);
            expect(createPayload.slug).toContain(SOURCE_TILE_UUID);
            expect(createPayload.slug.startsWith('chart-name')).toBe(true);

            // the content of the chart is copied as is
            expect(createPayload.name).toBe(sourceChart.name);
            expect(createPayload.description).toBe(sourceChart.description);
            expect(createPayload.tableName).toBe(sourceChart.tableName);
            expect(createPayload.metricQuery).toEqual(sourceChart.metricQuery);
            expect(createPayload.chartConfig).toEqual(sourceChart.chartConfig);
            expect(createPayload.tableConfig).toEqual(sourceChart.tableConfig);
            expect(createPayload.pivotConfig).toEqual(sourceChart.pivotConfig);
            expect(createPayload.parameters).toEqual(sourceChart.parameters);

            const payload = getAddVersionPayload();
            const newTile = payload.tiles[0] as DashboardChartTile;
            expect(newTile.uuid).not.toBe(SOURCE_TILE_UUID);
            expect(newTile.properties.savedChartUuid).toBe(
                DUPLICATED_CHART_UUID,
            );
            expect(newTile.properties.belongsToDashboard).toBe(true);
        });

        test('duplicates a SQL chart tile into a new SQL chart owned by the new dashboard', async () => {
            sourceDashboard = buildSourceDashboard({ tiles: [sqlChartTile] });

            await service.duplicate(
                duplicateUser,
                projectUuid,
                SOURCE_DASHBOARD_UUID,
                duplicateParams,
            );

            expect(savedSqlModel.create).toHaveBeenCalledTimes(1);
            const [
                createUserUuid,
                createProjectUuid,
                createPayload,
            ] = (savedSqlModel.create as jest.Mock).mock.calls[0];
            expect(createUserUuid).toBe(user.userUuid);
            expect(createProjectUuid).toBe(projectUuid);
            expect(createPayload).toEqual(
                expect.objectContaining({
                    dashboardUuid: NEW_DASHBOARD_UUID,
                    name: 'sql chart name',
                    description: null,
                    sql: 'select 1',
                    limit: 100,
                    config: { type: ChartKind.TABLE },
                }),
            );
            // a SQL chart belongs to a dashboard or to a space, never both
            expect(createPayload.spaceUuid).toBeUndefined();

            const payload = getAddVersionPayload();
            const newTile = payload.tiles[0] as DashboardSqlChartTile;
            expect(newTile.properties.savedSqlUuid).toBe(DUPLICATED_SQL_UUID);
            expect(newTile.properties.chartName).toBe('sql chart name');
            expect(newTile.properties.chartSlug).toBe('duplicated-sql-slug');
        });

        test('remaps the tile targets of the dashboard and tab filters to the new tile uuid', async () => {
            await service.duplicate(
                duplicateUser,
                projectUuid,
                SOURCE_DASHBOARD_UUID,
                duplicateParams,
            );

            const payload = getAddVersionPayload();
            const newTileUuid = (payload.tiles[0] as DashboardChartTile).uuid;
            expect(newTileUuid).not.toBe(SOURCE_TILE_UUID);

            const dashboardTileTargets =
                payload.filters.dimensions[0].tileTargets ?? {};
            expect(Object.keys(dashboardTileTargets)).toEqual([newTileUuid]);
            expect(dashboardTileTargets[newTileUuid]).toEqual({
                fieldId: 'orders_status',
                tableName: 'orders',
            });

            const tabFilters = payload.tabs[0].filters ?? {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            const tabTileTargets = tabFilters.dimensions[0].tileTargets ?? {};
            expect(Object.keys(tabTileTargets)).toEqual([newTileUuid]);
        });

        test('remaps the locked tab uuids and the tab scoped parent tab uuids', async () => {
            await service.duplicate(
                duplicateUser,
                projectUuid,
                SOURCE_DASHBOARD_UUID,
                duplicateParams,
            );

            const payload = getAddVersionPayload();
            const newTabUuid = payload.tabs[0].uuid;
            expect(newTabUuid).not.toBe(SOURCE_TAB_UUID);

            const [tabScopedFilter, globalFilter] =
                payload.filters.dimensions;
            expect(tabScopedFilter.lockedTabUuids).toEqual([newTabUuid]);
            expect(tabScopedFilter.parentScope).toBe('tab');
            expect(tabScopedFilter.parentTabUuid).toBe(newTabUuid);

            // global filters keep the original parent tab uuid
            expect(globalFilter.parentScope).toBe('global');
            expect(globalFilter.parentTabUuid).toBe(SOURCE_TAB_UUID);
        });

        test('remaps the synced chart tile uuids of the dashboard config', async () => {
            await service.duplicate(
                duplicateUser,
                projectUuid,
                SOURCE_DASHBOARD_UUID,
                duplicateParams,
            );

            const payload = getAddVersionPayload();
            const newTileUuid = (payload.tiles[0] as DashboardChartTile).uuid;
            expect(payload.config?.syncChartTileUuids).toEqual([newTileUuid]);
        });

        test('throws when the source chart belongs to another project', async () => {
            (savedChartModel.get as jest.Mock).mockResolvedValueOnce({
                ...sourceChart,
                projectUuid: 'another-project',
            });

            await expect(
                service.duplicate(
                    duplicateUser,
                    projectUuid,
                    SOURCE_DASHBOARD_UUID,
                    duplicateParams,
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(savedChartModel.create).not.toHaveBeenCalled();
        });

        test('removes the duplicated dashboard when the duplication fails', async () => {
            (savedChartModel.get as jest.Mock).mockResolvedValueOnce({
                ...sourceChart,
                projectUuid: 'another-project',
            });

            await expect(
                service.duplicate(
                    duplicateUser,
                    projectUuid,
                    SOURCE_DASHBOARD_UUID,
                    duplicateParams,
                ),
            ).rejects.toThrow(ForbiddenError);

            // the incomplete copy must not be left behind
            expect(dashboardModel.delete).toHaveBeenCalledWith(
                NEW_DASHBOARD_UUID,
            );
        });

        test('throws when the user cannot view the space of the source chart', async () => {
            const restrictedUser: SessionUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    {
                        subject: 'Dashboard',
                        action: ['view', 'create'],
                    },
                ]),
            };

            await expect(
                service.duplicate(
                    restrictedUser,
                    projectUuid,
                    SOURCE_DASHBOARD_UUID,
                    duplicateParams,
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(savedChartModel.create).not.toHaveBeenCalled();
        });

        test('keeps the tiles of a dashboard without chart resources and does not duplicate any chart', async () => {
            sourceDashboard = buildSourceDashboard({ tiles: [markdownTile] });

            await service.duplicate(
                duplicateUser,
                projectUuid,
                SOURCE_DASHBOARD_UUID,
                duplicateParams,
            );

            expect(savedChartModel.create).not.toHaveBeenCalled();
            expect(savedSqlModel.create).not.toHaveBeenCalled();
            expect(dashboardModel.addVersion).not.toHaveBeenCalled();

            const createPayload = (dashboardModel.create as jest.Mock).mock
                .calls[0][1];
            expect(createPayload.tiles).toHaveLength(1);
            expect(createPayload.tiles[0].uuid).toBe(markdownTile.uuid);
        });
    });
});

import {
    AlreadyExistsError,
    DashboardChartTile,
    DashboardTileTypes,
    ParameterError,
    PromotionAction,
    PromotionConflictType,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { ProjectOperationLogService } from '../ProjectOperationLogService/ProjectOperationLogService';
import { ProjectOperationLogModel } from '../../models/ProjectOperationLogModel/ProjectOperationLogModel';
import { PromoteService, type UpstreamDashboard } from './PromoteService';
import {
    existingUpstreamChart,
    existingUpstreamDashboard,
    missingUpstreamChart,
    missingUpstreamDashboard,
    promotedChart,
    promotedChartWithinDashboard,
    promotedDashboard,
    promotedDashboardWithChartWithinDashboard,
    promotedDashboardWithNewPrivateSpace,
    promotedDashboardWithSqlChartAndDataApp,
    promotedSpace,
    sourceSqlChart,
    upstreamFullSpace,
    upstreamSpace,
    upstreamSqlChart,
    user,
} from './PromoteService.mock';

const projectModel = {};

const savedChartModel = {
    get: jest.fn(async (chartUuid: string) => {
        if (chartUuid === existingUpstreamChart.chart?.uuid) {
            return existingUpstreamChart.chart;
        }
        return promotedChart.chart;
    }),
    find: jest.fn(async () => [existingUpstreamChart.chart]),
    create: jest.fn(async () => existingUpstreamChart.chart),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => promotedChart.space),
    find: jest.fn(),
    getSpaceAncestors: jest.fn(async () => []),
    getUserSpaceAccess: jest.fn(async () => []),
    createSpace: jest.fn(async () => existingUpstreamChart.space),
    createSpaceWithAncestors: jest.fn(async () => existingUpstreamChart.space),
    getFullSpace: jest.fn(async () => upstreamFullSpace),
    addSpaceAccess: jest.fn(async () => {}),
    addSpaceGroupAccess: jest.fn(async () => {}),
    update: jest.fn(async () => {}),
    isRootSpace: jest.fn(async () => true),
};
const dashboardModel = {
    create: jest.fn(async () => existingUpstreamDashboard.dashboard),
};

const savedSqlModel = {
    getByUuid: jest.fn(async () => sourceSqlChart),
    findSqlCharts: jest.fn(async () => [] as (typeof sourceSqlChart)[]),
    create: jest.fn(async () => ({
        savedSqlUuid: 'upstream-sql-chart-uuid',
        slug: 'sql-chart',
        savedSqlVersionUuid: 'upstream-sql-version-uuid',
    })),
    update: jest.fn(async () => ({
        savedSqlUuid: 'upstream-sql-chart-uuid',
        savedSqlVersionUuid: 'upstream-sql-version-uuid',
    })),
    delete: jest.fn(async () => {}),
};
describe('PromoteService chart changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
        projectOperationLogModel: {
            list: jest.fn(async () => ({ data: [], pagination: {} })),
        } as unknown as ProjectOperationLogModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getChartChanges create chart and space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const changes = await service.getChartChanges(
            promotedChart,
            missingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
        });

        expect(changes.spaces[0].action).toBe(PromotionAction.CREATE);
        expect(changes.spaces[0].data).toEqual({
            ...promotedChart.space,
            projectUuid: missingUpstreamChart.projectUuid,
        });
    });
    test('getChartChanges create chart but no space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);
        const changes = await service.getChartChanges(promotedChart, {
            ...missingUpstreamChart,
            space: existingUpstreamChart.space,
        });

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            spaceUuid: existingUpstreamChart.space?.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges chart with no changes', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);
        const changes = await service.getChartChanges(
            promotedChart,
            existingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('no changes');
        expect(changes.spaces[0].action).toBe('no changes');
    });

    test('getChartChanges update chart', async () => {
        const updatedAt = new Date();
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);
        const changes = await service.getChartChanges(
            {
                ...promotedChart,
                chart: {
                    ...promotedChart.chart,
                    updatedAt,
                },
            },
            existingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            uuid: existingUpstreamChart.chart?.uuid,
            spaceUuid: existingUpstreamChart.space?.uuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
            updatedAt,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart when only metric query changed', async () => {
        const upstreamUpdatedAt = new Date('2026-01-02T00:00:00.000Z');
        const promotedOlderUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);

        const changes = await service.getChartChanges(
            {
                ...promotedChart,
                chart: {
                    ...promotedChart.chart,
                    updatedAt: promotedOlderUpdatedAt,
                    metricQuery: {
                        ...promotedChart.chart.metricQuery,
                        limit: 200,
                    },
                },
            },
            {
                ...existingUpstreamChart,
                chart: {
                    ...existingUpstreamChart.chart!,
                    updatedAt: upstreamUpdatedAt,
                },
            },
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.charts[0].action).toBe(PromotionAction.UPDATE);
    });

    test('getChartChanges update chart and create space', async () => {
        const updatedAt = new Date();
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const changes = await service.getChartChanges(
            {
                ...promotedChart,
                chart: {
                    ...promotedChart.chart,
                    updatedAt,
                },
            },
            {
                ...existingUpstreamChart,
                chart: {
                    ...existingUpstreamChart.chart!,
                    spaceUuid: promotedChart.chart.spaceUuid,
                },
                space: undefined,
            },
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            uuid: existingUpstreamChart.chart?.uuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: existingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
            updatedAt,
            spaceUuid: promotedChart.chart.spaceUuid, // This is a placeholder, will be updated after creating new space
        });

        expect(changes.spaces[0].data).toEqual({
            ...promotedChart.space,
            projectUuid: existingUpstreamChart.projectUuid,
        });
    });
});

describe('PromoteService dashboard changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
        projectOperationLogModel: {
            list: jest.fn(async () => ({ data: [], pagination: {} })),
        } as unknown as ProjectOperationLogModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getPromotionDashboardChanges create empty dashboard and space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                {
                    ...promotedDashboard,
                    dashboard: {
                        ...promotedDashboard.dashboard,
                        tiles: [],
                    },
                },
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(0);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboard.dashboard,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            spacePath: promotedDashboard.space.path,
            tiles: [],
        });

        expect(promotedCharts).toEqual([]);

        expect(changes.spaces[0].data).toEqual({
            ...promotedDashboard.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
        });
    });
    test('getPromotionDashboardChanges create dashboard with chart tiles and space', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChart.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1); // Chart and dashboard are in the same space
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');
        expect(changes.charts[0].action).toBe('create');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboard.dashboard,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            spacePath: promotedDashboard.space.path,
        });

        expect(promotedCharts.length).toBe(1);

        expect(changes.spaces[0].data).toEqual({
            ...promotedDashboard.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
        });

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
            spaceUuid: promotedChart.space.uuid,
            projectUuid: missingUpstreamDashboard.projectUuid,
            dashboardUuid: null, // not within dashboard
            dashboardName: null,
        });
    });

    test('getPromotionDashboardChanges should deduplicate chart UUIDs across tiles', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChart.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const duplicatedChartTile: DashboardChartTile = {
            uuid: 'duplicate-tile-uuid',
            type: DashboardTileTypes.SAVED_CHART,
            x: 4,
            y: 4,
            h: 10,
            w: 10,
            tabUuid: 'tab-2',
            properties: {
                title: 'duplicate chart tile',
                savedChartUuid: promotedChart.chart.uuid,
                belongsToDashboard: false,
            },
        };

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                {
                    ...promotedDashboard,
                    dashboard: {
                        ...promotedDashboard.dashboard,
                        tiles: [
                            promotedDashboard.dashboard.tiles[0],
                            duplicatedChartTile,
                        ],
                    },
                },
                missingUpstreamDashboard,
            );

        expect(savedChartModel.get).toHaveBeenCalledTimes(1);
        expect(promotedCharts.length).toBe(1);
        expect(changes.charts).toHaveLength(1);
        expect(changes.charts[0].action).toBe(PromotionAction.CREATE);
    });

    test('getPromotionDashboardChanges create dashboard with chart tiles in different spaces', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                {
                    ...promotedDashboard,
                    space: {
                        ...promotedDashboard.space,
                        slug: 'new-space',
                        path: 'new_space',
                    },
                },
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(2); // Chart and dashboard are in different spaces
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces.map((s) => s.action)).toStrictEqual([
            'create',
            'create',
        ]);
        expect(changes.charts[0].action).toBe('no changes');

        expect(promotedCharts.length).toBe(1);

        expect(changes.spaces.map((s) => s.data)).toStrictEqual([
            {
                ...promotedDashboard.space,
                slug: 'new-space',
                path: 'new_space',
                projectUuid: missingUpstreamDashboard.projectUuid,
            },
            {
                ...promotedChart.space,
                projectUuid: missingUpstreamDashboard.projectUuid,
            },
        ]);
    });

    test('getPromotionDashboardChanges update dashboard with chart tiles ', async () => {
        const updatedAt = new Date();
        const updatedPromotedChart = { ...promotedChart.chart, updatedAt };
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => updatedPromotedChart,
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                existingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1); // Chart and dashboard are in the same space
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.charts[0].action).toBe('update');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboard.dashboard,
            projectUuid: existingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            spacePath: promotedDashboard.space.path,
            uuid: existingUpstreamDashboard.dashboard?.uuid,
            spaceUuid: existingUpstreamDashboard.space?.uuid,
        });

        expect(changes.charts[0].data).toEqual({
            ...updatedPromotedChart,
            projectUuid: existingUpstreamDashboard.projectUuid,
            uuid: existingUpstreamChart.chart?.uuid,
            oldUuid: promotedChart.chart.uuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
            spaceUuid: existingUpstreamDashboard.space?.uuid,
        });
    });

    test('getPromotionDashboardChanges create dashboard with new chart within dashboard and space', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChartWithinDashboard.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1); // Chart and dashboard are in the same space
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');
        expect(changes.charts[0].action).toBe('create');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboardWithChartWithinDashboard.dashboard,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            spacePath: promotedDashboard.space.path,
        });

        expect(promotedCharts.length).toBe(1);

        expect(changes.spaces[0].data).toEqual({
            ...promotedDashboard.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
        });

        expect(changes.charts[0].data).toEqual({
            ...promotedChartWithinDashboard.chart,
            oldUuid: promotedChartWithinDashboard.chart.uuid,
            spaceSlug: promotedChartWithinDashboard.space.slug,
            spacePath: promotedChartWithinDashboard.space.path,
            spaceUuid: promotedChartWithinDashboard.space.uuid,
            projectUuid: missingUpstreamDashboard.projectUuid,
            dashboardUuid:
                promotedDashboardWithChartWithinDashboard.dashboard.uuid,
            dashboardName:
                promotedDashboardWithChartWithinDashboard.dashboard.name,
        });
    });
});

describe('PromoteService promoting and mutating changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
        projectOperationLogModel: {
            list: jest.fn(async () => ({ data: [], pagination: {} })),
        } as unknown as ProjectOperationLogModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('return same changes if no new space is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                existingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.spaces[0].action).toBe('no changes');

        const newChanges = await service.upsertSpaces(
            user,
            promotedDashboard.projectUuid,
            changes,
        );

        expect(changes).toEqual(newChanges);
    });

    test('create space and update space uuid if a new space is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.spaces[0].action).toBe('create');

        // Right now the dashboard is pointing to wrong space uuid, this will be updated after creating new spaces
        expect(changes.dashboards[0].data.spaceUuid).toEqual(
            promotedDashboard.dashboard.spaceUuid,
        );

        const newChanges = await service.upsertSpaces(
            user,
            promotedDashboard.projectUuid,
            changes,
        );

        expect(spaceModel.createSpace).toHaveBeenCalledTimes(1);
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledTimes(0);
        expect(spaceModel.addSpaceGroupAccess).toHaveBeenCalledTimes(0);

        expect(newChanges).toEqual({
            ...changes,
            spaces: [
                {
                    ...changes.spaces[0],
                    data: {
                        ...changes.spaces[0].data,
                        uuid: existingUpstreamDashboard.space?.uuid,
                    },
                },
            ],
            dashboards: [
                {
                    ...changes.dashboards[0],
                    data: {
                        ...changes.dashboards[0].data,
                        spaceUuid: existingUpstreamDashboard.space?.uuid,
                    },
                },
            ],
            charts: [
                {
                    ...changes.charts[0],
                    data: {
                        ...changes.charts[0].data,
                        spaceUuid: existingUpstreamDashboard.space?.uuid,
                    },
                },
            ],
        });
    });

    test('create private space and add user as admin', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboardWithNewPrivateSpace,
            missingUpstreamDashboard,
        );

        expect(changes.spaces.length).toBe(1);
        expect(changes.spaces[0].action).toBe('create');
        expect(changes.spaces[0].data.isPrivate).toBe(true);

        (
            spaceModel.createSpaceWithAncestors as jest.Mock
        ).mockImplementationOnce(async () => ({
            ...promotedDashboardWithNewPrivateSpace.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
            uuid: upstreamSpace?.uuid,
            rootSpaceUuid: upstreamSpace?.uuid,
        }));

        await service.upsertSpaces(
            user,
            promotedDashboardWithNewPrivateSpace.projectUuid,
            changes,
        );

        expect(spaceModel.createSpace).toHaveBeenCalledTimes(1);
        expect(spaceModel.createSpace).toHaveBeenCalledWith(
            {
                isPrivate: true,
                name: 'Private space',
                parentSpaceUuid: null,
            },
            {
                projectUuid: 'upstream-project-uuid',
                userId: 0,
                path: upstreamSpace?.path,
            },
        );
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledTimes(1);
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledWith(
            'upstream-space-uuid',
            'userUuid',
            'admin',
        );
        expect(spaceModel.addSpaceGroupAccess).toHaveBeenCalledTimes(1);
    });

    test('update space should not affect permissions', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithNewPrivateSpace,
                existingUpstreamDashboard,
            );

        expect(changes.spaces.length).toBe(1);
        expect(changes.spaces[0].action).toBe('update');
        expect(changes.spaces[0].data.isPrivate).toBe(false); // Existing space is not private, so it should be kept that way

        await service.upsertSpaces(
            user,
            promotedDashboardWithNewPrivateSpace.projectUuid,
            changes,
        );

        expect(spaceModel.update).toHaveBeenCalledTimes(1);
        expect(spaceModel.update).toHaveBeenCalledWith('upstream-space-uuid', {
            name: promotedDashboardWithNewPrivateSpace.space.name,
        });
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledTimes(0);
        expect(spaceModel.addSpaceGroupAccess).toHaveBeenCalledTimes(0);
    });

    test('return same changes if no new dashboard is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                existingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.dashboards[0].action).toBe('update');

        const newChanges = await service.getOrCreateDashboard(user, changes);

        expect(changes).toEqual(newChanges);
    });

    test('create dashboard and update dashboard uuid if a new dashboard is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.charts[0].action).toBe('no changes');
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.dashboards[0].action).toBe('create');

        // Right now the dashboard is pointing to wrong dashboard uuid, this will be updated after creating new dsahboard
        expect(changes.dashboards[0].data.uuid).toEqual(
            promotedDashboard.dashboard.uuid,
        );
        // Chart is not within dashboard
        expect(changes.charts[0].data.dashboardUuid).toEqual(null);
        const newChanges = await service.getOrCreateDashboard(user, changes);

        expect(dashboardModel.create).toHaveBeenCalledTimes(1);

        expect(newChanges.dashboards[0].data.uuid).toEqual(
            existingUpstreamDashboard.dashboard?.uuid,
        );
        expect(newChanges.charts[0].data.dashboardUuid).toEqual(null);
    });

    test('create dashboard and update dashboard uuid if a new dashboard with chart within dashboard is created', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChartWithinDashboard.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.charts[0].action).toBe('create');
        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('no changes');
        // Right now the chart within dashboard is pointing to wrong dashboard uuid, this will be updated after creating new dsahboard
        expect(changes.charts[0].data.dashboardUuid).toEqual(
            promotedDashboardWithChartWithinDashboard.dashboard.uuid,
        );
        const newChanges = await service.getOrCreateDashboard(user, changes);

        expect(newChanges.charts[0].data.dashboardUuid).toEqual(
            existingUpstreamDashboard.dashboard?.uuid,
        );
    });

    test('create charts returns no changes if no chart is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.charts[0].action).toBe('no changes');
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.dashboards[0].action).toBe('create');

        expect(changes.charts[0].data.uuid).toEqual(
            existingUpstreamChart.chart?.uuid,
        );
        const newChanges = await service.upsertCharts(user, changes);

        expect(dashboardModel.create).toHaveBeenCalledTimes(0);

        expect(newChanges.charts[0].data.uuid).toEqual(
            existingUpstreamChart.chart?.uuid,
        );
    });

    test('create charts and update dashboard tile uuids if a new chart created', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChartWithinDashboard.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const createdChart = {
            ...promotedChartWithinDashboard.chart,
            uuid: 'new-chart-uuid',
        };

        (savedChartModel.create as jest.Mock).mockImplementationOnce(
            async () => createdChart,
        );
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.charts[0].action).toBe('create');

        expect(changes.charts[0].data.uuid).toEqual(
            promotedChartWithinDashboard.chart?.uuid,
        );
        const tile = changes.dashboards[0].data.tiles[0];
        expect(
            tile.type === DashboardTileTypes.SAVED_CHART &&
                tile.properties.savedChartUuid,
        ).toEqual(promotedChartWithinDashboard.chart?.uuid);
        const newChanges = await service.upsertCharts(user, changes);

        expect(savedChartModel.create).toHaveBeenCalledTimes(1);

        expect(newChanges.charts[0].data.uuid).toEqual(createdChart.uuid);

        const newTile = newChanges.dashboards[0].data.tiles[0];
        expect(
            newTile.type === DashboardTileTypes.SAVED_CHART &&
                newTile.properties.savedChartUuid,
        ).toEqual(createdChart.uuid);
    });
});

describe('PromoteService SQL chart and data app promotion', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
        projectOperationLogModel: {
            list: jest.fn(async () => ({ data: [], pagination: {} })),
        } as unknown as ProjectOperationLogModel,
    });

    const promoteAppsForDashboard = jest.fn(async () => [
        {
            sourceAppUuid: 'source-app-uuid',
            upstreamAppUuid: 'upstream-app-uuid',
            upstreamAppVersion: 1,
        },
    ]);
    const getDataAppPromoteChanges = jest.fn(async () => [
        { uuid: 'source-app-uuid', name: 'source app', action: 'create' as const },
    ]);

    beforeEach(() => {
        service.setDataAppPromotionPort({
            promoteAppsForDashboard,
            getDataAppPromoteChanges,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getPromotionDashboardChanges returns the sql charts and the data apps of the dashboard', async () => {
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);

        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboardWithSqlChartAndDataApp,
            missingUpstreamDashboard,
        );

        expect(changes.sqlCharts.length).toBe(1);
        expect(changes.sqlCharts[0].action).toBe(PromotionAction.CREATE);
        expect(changes.sqlCharts[0].data.savedSqlUuid).toBe(
            sourceSqlChart.savedSqlUuid,
        );
        expect(changes.sqlCharts[0].data.upstreamUuid).toBeNull();
        expect(changes.sqlCharts[0].data.projectUuid).toBe(
            missingUpstreamDashboard.projectUuid,
        );

        expect(changes.apps.length).toBe(1);
        expect(changes.apps[0].action).toBe(PromotionAction.CREATE);
        expect(changes.apps[0].data.uuid).toBe('source-app-uuid');
    });

    test('getPromotionDashboardChanges fails when the sql chart slug is not unique in the upstream project', async () => {
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);
        (savedSqlModel.findSqlCharts as jest.Mock).mockImplementationOnce(
            async () => [upstreamSqlChart, upstreamSqlChart],
        );

        await expect(
            service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithSqlChartAndDataApp,
                missingUpstreamDashboard,
            ),
        ).rejects.toThrow(AlreadyExistsError);
    });

    test('upsertSqlCharts creates the sql chart in the upstream project and remaps the tile', async () => {
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);

        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboardWithSqlChartAndDataApp,
            missingUpstreamDashboard,
        );

        const newChanges = await service.upsertSqlCharts(
            user,
            changes,
            'upstream-dashboard-uuid',
        );

        expect(savedSqlModel.create).toHaveBeenCalledTimes(1);
        // The sql chart is created in the upstream project
        expect(savedSqlModel.create).toHaveBeenCalledWith(
            user.userUuid,
            missingUpstreamDashboard.projectUuid,
            expect.objectContaining({
                name: sourceSqlChart.name,
                slug: sourceSqlChart.slug,
                sql: sourceSqlChart.sql,
            }),
        );

        const tile = newChanges.dashboards[0].data.tiles[0];
        expect(
            tile.type === DashboardTileTypes.SQL_CHART &&
                tile.properties.savedSqlUuid,
        ).toEqual('upstream-sql-chart-uuid');
    });

    test('upsertSqlCharts updates the upstream sql chart when it already exists', async () => {
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);
        (savedSqlModel.findSqlCharts as jest.Mock).mockImplementationOnce(
            async () => [
                {
                    ...upstreamSqlChart,
                    name: 'an old name',
                    sql: 'select 2',
                },
            ],
        );

        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboardWithSqlChartAndDataApp,
            missingUpstreamDashboard,
        );

        expect(changes.sqlCharts[0].action).toBe(PromotionAction.UPDATE);

        const newChanges = await service.upsertSqlCharts(
            user,
            changes,
            'upstream-dashboard-uuid',
        );

        expect(savedSqlModel.create).not.toHaveBeenCalled();
        expect(savedSqlModel.update).toHaveBeenCalledTimes(1);
        expect(savedSqlModel.update).toHaveBeenCalledWith(
            expect.objectContaining({
                savedSqlUuid: 'upstream-sql-chart-uuid',
                // The ownership of the chart is never changed by a promotion
                keepOwnership: true,
            }),
        );

        const tile = newChanges.dashboards[0].data.tiles[0];
        expect(
            tile.type === DashboardTileTypes.SQL_CHART &&
                tile.properties.savedSqlUuid,
        ).toEqual('upstream-sql-chart-uuid');
    });

    test('upsertDataApps promotes the data apps and remaps the tile', async () => {
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);

        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboardWithSqlChartAndDataApp,
            missingUpstreamDashboard,
        );

        const newChanges = await service.upsertDataApps(
            user,
            changes,
            promotedDashboardWithSqlChartAndDataApp.projectUuid,
        );

        expect(promoteAppsForDashboard).toHaveBeenCalledTimes(1);
        expect(promoteAppsForDashboard).toHaveBeenCalledWith(
            user,
            promotedDashboardWithSqlChartAndDataApp.projectUuid,
            ['source-app-uuid'],
        );

        const appTile = newChanges.dashboards[0].data.tiles.find(
            (tile) => tile.type === DashboardTileTypes.DATA_APP,
        );
        expect(
            appTile?.type === DashboardTileTypes.DATA_APP &&
                appTile.properties.appUuid,
        ).toEqual('upstream-app-uuid');

        expect(newChanges.apps[0].data.upstreamUuid).toBe('upstream-app-uuid');
    });

    test('promoting a dashboard with data apps fails when data apps are not available', async () => {
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);
        const serviceWithoutDataApps = new PromoteService({
            lightdashConfig: lightdashConfigMock,

            analytics: analyticsMock,
            projectModel: projectModel as unknown as ProjectModel,
            savedChartModel: savedChartModel as unknown as SavedChartModel,
            savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
            spaceModel: spaceModel as unknown as SpaceModel,
            dashboardModel: {} as DashboardModel,
            projectOperationLogService: {
                record: jest.fn(async () => undefined),
            } as unknown as ProjectOperationLogService,
            projectOperationLogModel: {
                list: jest.fn(async () => ({ data: [], pagination: {} })),
            } as unknown as ProjectOperationLogModel,
        });

        await expect(
            serviceWithoutDataApps.getPromotionDashboardChanges(
                user,
                promotedDashboardWithSqlChartAndDataApp,
                missingUpstreamDashboard,
            ),
        ).rejects.toThrow(ParameterError);
    });
});

describe('PromoteService upstream space resolution', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
        projectOperationLogModel: {
            list: jest.fn(async () => ({ data: [], pagination: {} })),
        } as unknown as ProjectOperationLogModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getOrCreateUpstreamSpace returns the existing upstream space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            { uuid: 'upstream-space-uuid', path: 'jaffle_shop' },
        ]);

        const spaceUuid = await service.getOrCreateUpstreamSpace(
            user,
            promotedSpace.uuid,
            'upstream-project-uuid',
        );

        expect(spaceUuid).toEqual('upstream-space-uuid');
        expect(spaceModel.createSpace).not.toHaveBeenCalled();
    });

    test('getOrCreateUpstreamSpace creates the space in the upstream project when it is missing', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.createSpace as jest.Mock).mockImplementationOnce(
            async () => ({
                ...upstreamSpace,
                uuid: 'created-upstream-space-uuid',
                path: 'jaffle_shop',
            }),
        );

        const spaceUuid = await service.getOrCreateUpstreamSpace(
            user,
            promotedSpace.uuid,
            'upstream-project-uuid',
        );

        expect(spaceUuid).toEqual('created-upstream-space-uuid');
        expect(spaceModel.createSpace).toHaveBeenCalledWith(
            {
                name: promotedSpace.name,
                isPrivate: promotedSpace.isPrivate,
                parentSpaceUuid: null,
            },
            {
                projectUuid: 'upstream-project-uuid',
                userId: user.userId,
                path: promotedSpace.path,
            },
        );
    });

    test('getOrCreateUpstreamSpace fails when the path is not unique in the upstream project', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            { uuid: 'upstream-space-uuid', path: 'jaffle_shop' },
            { uuid: 'another-upstream-space-uuid', path: 'jaffle_shop' },
        ]);

        await expect(
            service.getOrCreateUpstreamSpace(
                user,
                promotedSpace.uuid,
                'upstream-project-uuid',
            ),
        ).rejects.toThrow(AlreadyExistsError);
    });
});

describe('PromoteService promotion conflicts', () => {
    const projectOperationLogModel = {
        list: jest.fn(async () => ({
            data: [] as { createdAt: Date }[],
            pagination: {},
        })),
    };

    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        projectOperationLogService: {
            record: jest.fn(async () => undefined),
        } as unknown as ProjectOperationLogService,
        projectOperationLogModel:
            projectOperationLogModel as unknown as ProjectOperationLogModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const getChanges = async (
        upstreamDashboard: UpstreamDashboard,
    ) => {
        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboard,
            upstreamDashboard,
        );
        return changes;
    };

    test('reports a name conflict when the upstream dashboard has a different name', async () => {
        const changes = await getChanges({
            ...existingUpstreamDashboard,
            dashboard: {
                ...existingUpstreamDashboard.dashboard!,
                name: 'another name',
            },
        });

        const nameConflicts = changes.conflicts.filter(
            (conflict) =>
                conflict.type ===
                PromotionConflictType.UPSTREAM_NAME_MISMATCH,
        );
        expect(nameConflicts.length).toBe(1);
        expect(nameConflicts[0].sourceName).toBe(promotedDashboard.dashboard.name);
        expect(nameConflicts[0].upstreamName).toBe('another name');
    });

    test('reports a conflict when the upstream dashboard changed after the last promotion', async () => {
        const lastPromotedAt = new Date('2024-01-01T00:00:00.000Z');
        projectOperationLogModel.list.mockImplementationOnce(async () => ({
            data: [{ createdAt: lastPromotedAt }],
            pagination: {},
        }));

        const changes = await getChanges({
            ...existingUpstreamDashboard,
            dashboard: {
                ...existingUpstreamDashboard.dashboard!,
                updatedAt: new Date('2024-02-01T00:00:00.000Z'),
            },
        });

        const blockingConflicts = changes.conflicts.filter(
            (conflict) =>
                conflict.type ===
                PromotionConflictType.UPSTREAM_MODIFIED_AFTER_PROMOTION,
        );
        expect(blockingConflicts.length).toBe(1);
        expect(blockingConflicts[0].lastPromotedAt).toBe(
            lastPromotedAt.toISOString(),
        );
    });

    test('does not report a conflict when the upstream dashboard was not changed after the last promotion', async () => {
        const lastPromotedAt = new Date('2024-02-01T00:00:00.000Z');
        projectOperationLogModel.list.mockImplementationOnce(async () => ({
            data: [{ createdAt: lastPromotedAt }],
            pagination: {},
        }));

        const changes = await getChanges({
            ...existingUpstreamDashboard,
            dashboard: {
                ...existingUpstreamDashboard.dashboard!,
                updatedAt: new Date('2024-01-15T00:00:00.000Z'),
            },
        });

        expect(changes.conflicts.length).toBe(0);
    });

    test('does not report conflicts when the dashboard does not exist upstream', async () => {
        const changes = await getChanges(missingUpstreamDashboard);

        expect(changes.conflicts.length).toBe(0);
    });
});

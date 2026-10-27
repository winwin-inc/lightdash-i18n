import { Ability } from '@casl/ability';
import {
    AllVizChartConfig,
    CreateSqlChart,
    ForbiddenError,
    ParameterError,
    PossibleAbilities,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    UpdateSqlChart,
} from '@lightdash/common';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type { AnalyticsModel } from '../../models/AnalyticsModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SavedSqlService } from './SavedSqlService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const USER_UUID = 'user-uuid';
const SPACE_UUID = 'space-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';

const spaceShare: SpaceShare = {
    userUuid: USER_UUID,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    role: 'editor',
    hasDirectAccess: true,
    projectRole: 'developer',
    inheritedRole: undefined,
    inheritedFrom: undefined,
} as unknown as SpaceShare;

const spaceSummary = (projectUuid: string): SpaceSummary =>
    ({
        uuid: SPACE_UUID,
        name: 'My space',
        organizationUuid: ORGANIZATION_UUID,
        projectUuid,
        isPrivate: false,
        pinnedListUuid: null,
        pinnedListOrder: null,
        slug: 'my-space',
        parentSpaceUuid: null,
        path: 'my-space',
        userAccess: spaceShare,
        access: [],
        chartCount: 0,
        dashboardCount: 0,
    }) as unknown as SpaceSummary;

const chartConfig = {
    type: 'cartesian',
    x: { fieldId: 'orders_total' },
    y: [{ fieldId: 'orders_count', aggregation: 'sum' }],
} as unknown as AllVizChartConfig;

const baseChart = {
    name: 'My sql chart',
    description: null,
    sql: 'select 1',
    limit: 500,
    config: chartConfig,
} as Omit<CreateSqlChart, 'spaceUuid' | 'dashboardUuid'>;

const userWith = (ability: Ability<PossibleAbilities>): SessionUser =>
    ({
        userUuid: USER_UUID,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: ORGANIZATION_UUID,
        organization: {
            organizationUuid: ORGANIZATION_UUID,
            name: 'org',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        role: 'developer',
        projectUuid: PROJECT_UUID,
        projects: [],
        ability,
    }) as unknown as SessionUser;

const fullAbility = new Ability<PossibleAbilities>([
    { action: 'manage', subject: 'CustomSql' },
    { action: 'create', subject: 'SavedChart' },
    { action: 'view', subject: 'SavedChart' },
    { action: 'update', subject: 'SavedChart' },
]);

const noCustomSqlAbility = new Ability<PossibleAbilities>([
    { action: 'view', subject: 'SavedChart' },
    { action: 'create', subject: 'SavedChart' },
]);

type Mocks = {
    service: SavedSqlService;
    savedSqlModel: {
        create: jest.Mock;
        getByUuid: jest.Mock;
        update: jest.Mock;
    };
    spaceModel: {
        getSpaceSummary: jest.Mock;
        getUserSpaceAccess: jest.Mock;
    };
    dashboardModel: { getByIdOrSlug: jest.Mock };
    projectModel: { getSummary: jest.Mock };
};

const createService = (): Mocks => {
    const savedSqlModel = {
        create: jest.fn().mockResolvedValue({
            savedSqlUuid: 'saved-sql-uuid',
            slug: 'my-sql-chart',
            savedSqlVersionUuid: 'saved-sql-version-uuid',
        }),
        getByUuid: jest.fn().mockResolvedValue({
            savedSqlUuid: 'saved-sql-uuid',
            name: 'My sql chart',
            description: null,
            slug: 'my-sql-chart',
            sql: 'select 1',
            limit: 500,
            config: chartConfig,
            chartKind: 'table',
            space: { uuid: SPACE_UUID, name: 'My space', isPrivate: false },
            project: { projectUuid: PROJECT_UUID },
            dashboard: null,
            organization: { organizationUuid: ORGANIZATION_UUID },
            views: 0,
            firstViewedAt: new Date(),
            lastViewedAt: new Date(),
            createdAt: new Date(),
            lastUpdatedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({
            savedSqlUuid: 'saved-sql-uuid',
            savedSqlVersionUuid: 'saved-sql-version-uuid',
        }),
    };
    const spaceModel = {
        getSpaceSummary: jest.fn().mockResolvedValue(spaceSummary(PROJECT_UUID)),
        getUserSpaceAccess: jest.fn().mockResolvedValue([spaceShare]),
    };
    const dashboardModel = {
        getByIdOrSlug: jest.fn().mockResolvedValue({
            uuid: DASHBOARD_UUID,
            projectUuid: PROJECT_UUID,
            spaceUuid: SPACE_UUID,
        }),
    };
    const projectModel = {
        getSummary: jest.fn().mockResolvedValue({
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
        }),
    };

    const service = new SavedSqlService({
        analytics: { track: jest.fn() } as unknown as LightdashAnalytics,
        projectModel: projectModel as unknown as ProjectModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        schedulerClient: {} as unknown as SchedulerClient,
        analyticsModel: {} as unknown as AnalyticsModel,
    });

    return {
        service,
        savedSqlModel,
        spaceModel,
        dashboardModel,
        projectModel,
    };
};

describe('SavedSqlService.createSqlChart', () => {
    test('creates a space-owned SQL chart when only spaceUuid is provided', async () => {
        const { service, savedSqlModel, spaceModel } = createService();

        await service.createSqlChart(
            userWith(fullAbility),
            PROJECT_UUID,
            { ...baseChart, spaceUuid: SPACE_UUID } as CreateSqlChart,
        );

        expect(spaceModel.getSpaceSummary).toHaveBeenCalledWith(SPACE_UUID);
        expect(savedSqlModel.create).toHaveBeenCalledTimes(1);
        const [, , data] = savedSqlModel.create.mock.calls[0];
        expect(data.spaceUuid).toBe(SPACE_UUID);
        expect(data.dashboardUuid).toBeUndefined();
    });

    test('creates a dashboard-owned SQL chart when only dashboardUuid is provided', async () => {
        const { service, savedSqlModel, dashboardModel } = createService();

        await service.createSqlChart(
            userWith(fullAbility),
            PROJECT_UUID,
            { ...baseChart, dashboardUuid: DASHBOARD_UUID } as CreateSqlChart,
        );

        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            DASHBOARD_UUID,
        );
        expect(savedSqlModel.create).toHaveBeenCalledTimes(1);
        const [, , data] = savedSqlModel.create.mock.calls[0];
        expect(data.dashboardUuid).toBe(DASHBOARD_UUID);
        expect(data.spaceUuid).toBeUndefined();
    });

    test('throws a ParameterError when both spaceUuid and dashboardUuid are provided', async () => {
        const { service, savedSqlModel } = createService();

        await expect(
            service.createSqlChart(
                userWith(fullAbility),
                PROJECT_UUID,
                {
                    ...baseChart,
                    spaceUuid: SPACE_UUID,
                    dashboardUuid: DASHBOARD_UUID,
                } as CreateSqlChart,
            ),
        ).rejects.toThrow(ParameterError);

        expect(savedSqlModel.create).not.toHaveBeenCalled();
    });

    test('throws a ParameterError when neither spaceUuid nor dashboardUuid is provided', async () => {
        const { service, savedSqlModel } = createService();

        await expect(
            service.createSqlChart(
                userWith(fullAbility),
                PROJECT_UUID,
                { ...baseChart } as CreateSqlChart,
            ),
        ).rejects.toThrow(ParameterError);

        expect(savedSqlModel.create).not.toHaveBeenCalled();
    });

    test('throws a ParameterError when the space does not belong to the project', async () => {
        const { service, savedSqlModel, spaceModel } = createService();
        spaceModel.getSpaceSummary.mockResolvedValue(
            spaceSummary('another-project-uuid'),
        );

        await expect(
            service.createSqlChart(
                userWith(fullAbility),
                PROJECT_UUID,
                { ...baseChart, spaceUuid: SPACE_UUID } as CreateSqlChart,
            ),
        ).rejects.toThrow(ParameterError);

        expect(savedSqlModel.create).not.toHaveBeenCalled();
    });

    test('throws a ParameterError when the dashboard does not belong to the project', async () => {
        const { service, savedSqlModel, dashboardModel } = createService();
        dashboardModel.getByIdOrSlug.mockResolvedValue({
            uuid: DASHBOARD_UUID,
            projectUuid: 'another-project-uuid',
            spaceUuid: SPACE_UUID,
        });

        await expect(
            service.createSqlChart(
                userWith(fullAbility),
                PROJECT_UUID,
                { ...baseChart, dashboardUuid: DASHBOARD_UUID } as CreateSqlChart,
            ),
        ).rejects.toThrow(ParameterError);

        expect(savedSqlModel.create).not.toHaveBeenCalled();
    });

    test('throws a ForbiddenError when the user cannot manage CustomSql', async () => {
        const { service, savedSqlModel } = createService();

        await expect(
            service.createSqlChart(
                userWith(noCustomSqlAbility),
                PROJECT_UUID,
                { ...baseChart, spaceUuid: SPACE_UUID } as CreateSqlChart,
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(savedSqlModel.create).not.toHaveBeenCalled();
    });
});

describe('SavedSqlService.updateSqlChart', () => {
    const updatePayload = {
        unversionedData: {
            name: 'My sql chart',
            description: null,
            spaceUuid: SPACE_UUID,
        },
    } as unknown as UpdateSqlChart;

    test('keeps the ownership of a dashboard owned SQL chart', async () => {
        const { service, savedSqlModel } = createService();
        (savedSqlModel.getByUuid as jest.Mock).mockResolvedValue({
            savedSqlUuid: 'saved-sql-uuid',
            name: 'My sql chart',
            space: { uuid: SPACE_UUID, name: 'My space', isPrivate: false },
            project: { projectUuid: PROJECT_UUID },
            dashboard: { uuid: DASHBOARD_UUID, name: 'My dashboard' },
            organization: { organizationUuid: ORGANIZATION_UUID },
        });

        await service.updateSqlChart(
            userWith(fullAbility),
            PROJECT_UUID,
            'saved-sql-uuid',
            updatePayload,
        );

        expect(savedSqlModel.update).toHaveBeenCalledTimes(1);
        const [data] = (savedSqlModel.update as jest.Mock).mock.calls[0];
        // the chart must keep belonging to its dashboard, it can never
        // belong to a space and a dashboard at the same time
        expect(data.keepOwnership).toBe(true);
    });

    test('moves a dashboard owned SQL chart to a space when it is explicitly moved', async () => {
        const { service, savedSqlModel } = createService();
        (savedSqlModel.getByUuid as jest.Mock).mockResolvedValue({
            savedSqlUuid: 'saved-sql-uuid',
            name: 'My sql chart',
            space: { uuid: SPACE_UUID, name: 'My space', isPrivate: false },
            project: { projectUuid: PROJECT_UUID },
            dashboard: { uuid: DASHBOARD_UUID, name: 'My dashboard' },
            organization: { organizationUuid: ORGANIZATION_UUID },
        });

        await service.updateSqlChart(
            userWith(fullAbility),
            PROJECT_UUID,
            'saved-sql-uuid',
            {
                unversionedData: {
                    name: 'My sql chart',
                    description: null,
                    spaceUuid: 'another-space-uuid',
                },
            } as unknown as UpdateSqlChart,
        );

        const [data] = (savedSqlModel.update as jest.Mock).mock.calls[0];
        expect(data.keepOwnership).toBe(false);
    });

    test('keeps the ownership of a space owned SQL chart', async () => {
        const { service, savedSqlModel } = createService();

        await service.updateSqlChart(
            userWith(fullAbility),
            PROJECT_UUID,
            'saved-sql-uuid',
            updatePayload,
        );

        const [data] = (savedSqlModel.update as jest.Mock).mock.calls[0];
        expect(data.keepOwnership).toBe(false);
    });
});

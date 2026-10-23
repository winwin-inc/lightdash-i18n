import { SessionUser, ViewerContentScope } from '@lightdash/common';

// The ProjectService import chain pulls in the github client and the
// warehouse clients, neither is needed for the client-use scope.
jest.mock('../../clients/github/Github', () => ({
    getInstallationToken: jest.fn(),
    Github: jest.fn(),
}));

jest.mock('@lightdash/warehouses', () => ({
    SshTunnel: jest.fn(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
    })),
}));

// eslint-disable-next-line import/first
import { ProjectService } from './ProjectService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';

const ALLOWED_SPACE_UUID = 'allowed-space-uuid';
const OTHER_SPACE_UUID = 'other-space-uuid';
const ALLOWED_CHART_UUID = 'allowed-chart-uuid';
const HIDDEN_CHART_UUID = 'hidden-chart-uuid';

const user = {
    userUuid: 'user-uuid',
    email: '13800000000@example.com',
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'org',
    organizationCreatedAt: new Date(),
    role: 'member',
    ability: {
        can: jest.fn().mockReturnValue(true),
        cannot: jest.fn().mockReturnValue(false),
    },
} as unknown as SessionUser;

const scope: ViewerContentScope = {
    dashboardUuids: ['allowed-dashboard-uuid'],
    chartUuids: [ALLOWED_CHART_UUID],
    spaceUuids: [ALLOWED_SPACE_UUID],
    exploreNames: [],
};

const spaces = [
    {
        uuid: ALLOWED_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
        name: 'allowed space',
    },
    {
        uuid: OTHER_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
        name: 'other space',
    },
];

const projectModel = {
    getSummary: jest.fn(async () => ({ organizationUuid: ORGANIZATION_UUID })),
};

const spaceModel = {
    find: jest.fn(async () => spaces),
    getUserSpacesAccess: jest.fn(async () => ({})),
    getVisibleChartCountsBySpaceUuids: jest.fn(
        async (spaceUuids: string[], chartUuids: string[]) =>
            new Map(
                spaceUuids.map((spaceUuid) => [
                    spaceUuid,
                    chartUuids.length > 0 ? 1 : 0,
                ]),
            ),
    ),
    getSpaceQueries: jest.fn(async () => [
        { uuid: ALLOWED_CHART_UUID, name: 'allowed chart' },
        { uuid: HIDDEN_CHART_UUID, name: 'hidden chart' },
    ]),
    getSpaceSqlCharts: jest.fn(async () => []),
};

const savedChartModel = {
    find: jest.fn(async () => [
        { uuid: ALLOWED_CHART_UUID, name: 'allowed chart' },
        { uuid: HIDDEN_CHART_UUID, name: 'hidden chart' },
    ]),
};

const dashboardService = {
    getViewerContentScope: jest.fn<
        Promise<ViewerContentScope | undefined>,
        [SessionUser, string]
    >(async () => scope),
    getAllowedDashboardUuidsForViewer: jest.fn(
        async () => new Set(scope.dashboardUuids),
    ),
    getVisibleDashboardCountBySpaceUuid: jest.fn(
        async (spaceUuids: string[]) =>
            new Map(spaceUuids.map((spaceUuid) => [spaceUuid, 1])),
    ),
};

const getService = (viewerScope: ViewerContentScope | undefined) => {
    dashboardService.getViewerContentScope.mockResolvedValue(viewerScope);
    return new ProjectService({
        projectModel: projectModel as never,
        spaceModel: spaceModel as never,
        savedChartModel: savedChartModel as never,
        dashboardService: dashboardService as never,
    } as never);
};

describe('ProjectService client-use scope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        spaceModel.find.mockResolvedValue(spaces);
        spaceModel.getUserSpacesAccess.mockResolvedValue({});
    });

    describe('getSpaces', () => {
        test('only returns the spaces that hold an allow-listed dashboard', async () => {
            const service = getService(scope);

            const result = await service.getSpaces(user, PROJECT_UUID);

            expect(result.map((space) => space.uuid)).toEqual([
                ALLOWED_SPACE_UUID,
            ]);
        });

        test('recounts the chart count with the visible charts', async () => {
            const service = getService(scope);

            const result = await service.getSpaces(user, PROJECT_UUID);

            expect(result[0].chartCount).toBe(1);
            expect(
                spaceModel.getVisibleChartCountsBySpaceUuids,
            ).toHaveBeenCalledWith([ALLOWED_SPACE_UUID], [ALLOWED_CHART_UUID]);
        });

        test('keeps every space when the scope does not apply', async () => {
            const service = getService(undefined);

            const result = await service.getSpaces(user, PROJECT_UUID);

            expect(result.map((space) => space.uuid)).toEqual([
                ALLOWED_SPACE_UUID,
                OTHER_SPACE_UUID,
            ]);
        });
    });

    describe('getCharts', () => {
        test('only returns the charts mounted on an allow-listed dashboard', async () => {
            const service = getService(scope);

            const result = await service.getCharts(user, PROJECT_UUID);

            expect(result.map((chart) => chart.uuid)).toEqual([
                ALLOWED_CHART_UUID,
            ]);
        });

        test('keeps every chart when the scope does not apply', async () => {
            const service = getService(undefined);

            const result = await service.getCharts(user, PROJECT_UUID);

            expect(result.map((chart) => chart.uuid)).toEqual([
                ALLOWED_CHART_UUID,
                HIDDEN_CHART_UUID,
            ]);
        });
    });

    describe('getChartSummaries', () => {
        test('only returns the charts mounted on an allow-listed dashboard', async () => {
            const service = getService(scope);

            const result = await service.getChartSummaries(user, PROJECT_UUID);

            expect(result.map((chart) => chart.uuid)).toEqual([
                ALLOWED_CHART_UUID,
            ]);
        });

        test('keeps every chart when the scope does not apply', async () => {
            const service = getService(undefined);

            const result = await service.getChartSummaries(user, PROJECT_UUID);

            expect(result.map((chart) => chart.uuid)).toEqual([
                ALLOWED_CHART_UUID,
                HIDDEN_CHART_UUID,
            ]);
        });
    });
});

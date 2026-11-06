import { SessionUser, ViewerContentScope } from '@lightdash/common';

import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const SPACE_UUID = 'space-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';
const OTHER_DASHBOARD_UUID = 'other-dashboard-uuid';

const user = {
    userUuid: 'user-uuid',
    email: 'viewer@example.com',
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
    dashboardUuids: [DASHBOARD_UUID],
    chartUuids: [],
    spaceUuids: [SPACE_UUID],
    exploreNames: [],
};

const space = {
    uuid: SPACE_UUID,
    name: 'space',
    projectUuid: PROJECT_UUID,
    organizationUuid: ORGANIZATION_UUID,
    isPrivate: false,
    path: 'space',
};

const dashboardSummaries = [
    {
        uuid: DASHBOARD_UUID,
        name: 'allowed dashboard',
        slug: 'allowed-dashboard',
        spaceUuid: SPACE_UUID,
        description: null,
    },
    {
        uuid: OTHER_DASHBOARD_UUID,
        name: 'hidden dashboard',
        slug: 'hidden-dashboard',
        spaceUuid: SPACE_UUID,
        description: null,
    },
];

const dashboard = {
    uuid: DASHBOARD_UUID,
    name: 'allowed dashboard',
    description: null,
    updatedAt: new Date(),
    tiles: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tabs: [],
    config: {},
    parameters: {},
    slug: 'allowed-dashboard',
    spaceUuid: SPACE_UUID,
};

const project = {
    projectUuid: PROJECT_UUID,
    organizationUuid: ORGANIZATION_UUID,
    isClientUse: true,
};

const projectModel = {
    get: jest.fn(async () => project),
};

const dashboardModel = {
    find: jest.fn(async () => dashboardSummaries),
    getByIdOrSlug: jest.fn(async () => dashboard),
};

const spaceModel = {
    find: jest.fn(async () => [space]),
    getUserSpacesAccess: jest.fn(async () => ({})),
};

const dashboardService = {
    getAllowedDashboardUuidsForViewer: jest.fn<
        Promise<Set<string> | undefined>,
        [SessionUser, string]
    >(async () => new Set(scope.dashboardUuids)),
    getViewerContentScope: jest.fn<
        Promise<ViewerContentScope | undefined>,
        [SessionUser, string]
    >(async () => scope),
};

const getService = () =>
    new CoderService({
        lightdashConfig: {
            contentAsCode: { maxDownloads: 10 },
        } as never,
        analytics: { track: jest.fn() } as never,
        projectModel: projectModel as never,
        savedChartModel: {} as never,
        dashboardModel: dashboardModel as never,
        dashboardService: dashboardService as never,
        spaceModel: spaceModel as never,
        schedulerClient: {} as never,
        promoteService: {} as never,
        savedSqlModel: {} as never,
        organizationMemberProfileModel: {} as never,
        groupsModel: {} as never,
    });

describe('CoderService client-use allow-list', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('does not export the dashboards out of the allow-list', async () => {
        const service = getService();

        const result = await service.getDashboards(
            user,
            PROJECT_UUID,
            undefined,
        );

        expect(
            result.dashboards.map((dashboardItem) => dashboardItem.name),
        ).toEqual(['allowed dashboard']);
        expect(result.total).toBe(1);
    });

    test('keeps the normal behaviour when the allow-list does not apply', async () => {
        dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
            undefined,
        );
        const service = getService();

        const result = await service.getDashboards(
            user,
            PROJECT_UUID,
            undefined,
        );

        expect(result.dashboards).toHaveLength(2);
        expect(result.total).toBe(2);
    });
});

import { SessionUser, ViewerContentScope } from '@lightdash/common';

import { SearchService } from './SearchService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';

const VISIBLE_SPACE_UUID = 'visible-space-uuid';
const HIDDEN_SPACE_UUID = 'hidden-space-uuid';
const VISIBLE_CHART_UUID = 'visible-chart-uuid';
const HIDDEN_CHART_UUID = 'hidden-chart-uuid';
const VISIBLE_SQL_CHART_UUID = 'visible-sql-chart-uuid';
const HIDDEN_SQL_CHART_UUID = 'hidden-sql-chart-uuid';
const VISIBLE_DASHBOARD_UUID = 'visible-dashboard-uuid';
const HIDDEN_DASHBOARD_UUID = 'hidden-dashboard-uuid';

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
    dashboardUuids: [VISIBLE_DASHBOARD_UUID],
    chartUuids: [VISIBLE_CHART_UUID, VISIBLE_SQL_CHART_UUID],
    spaceUuids: [VISIBLE_SPACE_UUID],
    exploreNames: [],
};

const spaces = [
    {
        uuid: VISIBLE_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
    },
    {
        uuid: HIDDEN_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
    },
];

const searchResults = {
    spaces: [
        { uuid: VISIBLE_SPACE_UUID, name: 'visible space' },
        { uuid: HIDDEN_SPACE_UUID, name: 'hidden space' },
    ],
    dashboards: [
        {
            uuid: VISIBLE_DASHBOARD_UUID,
            name: 'visible dashboard',
            spaceUuid: VISIBLE_SPACE_UUID,
            projectUuid: PROJECT_UUID,
        },
        {
            uuid: HIDDEN_DASHBOARD_UUID,
            name: 'hidden dashboard',
            spaceUuid: VISIBLE_SPACE_UUID,
            projectUuid: PROJECT_UUID,
        },
    ],
    savedCharts: [
        {
            uuid: VISIBLE_CHART_UUID,
            name: 'visible chart',
            spaceUuid: VISIBLE_SPACE_UUID,
            projectUuid: PROJECT_UUID,
        },
        {
            uuid: HIDDEN_CHART_UUID,
            name: 'hidden chart',
            spaceUuid: VISIBLE_SPACE_UUID,
            projectUuid: PROJECT_UUID,
        },
    ],
    sqlCharts: [
        {
            uuid: VISIBLE_SQL_CHART_UUID,
            name: 'visible sql chart',
            spaceUuid: VISIBLE_SPACE_UUID,
            projectUuid: PROJECT_UUID,
        },
        {
            uuid: HIDDEN_SQL_CHART_UUID,
            name: 'hidden sql chart',
            spaceUuid: VISIBLE_SPACE_UUID,
            projectUuid: PROJECT_UUID,
        },
    ],
    dashboardTabs: [
        {
            dashboardUuid: VISIBLE_DASHBOARD_UUID,
            spaceUuid: VISIBLE_SPACE_UUID,
        },
        {
            dashboardUuid: HIDDEN_DASHBOARD_UUID,
            spaceUuid: VISIBLE_SPACE_UUID,
        },
    ],
    tables: [],
    fields: [],
    pages: [],
};

const projectModel = {
    getSummary: jest.fn(async () => ({ organizationUuid: ORGANIZATION_UUID })),
};

const searchModel = {
    search: jest.fn(async () => searchResults),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async (uuid: string) =>
        spaces.find((space) => space.uuid === uuid),
    ),
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

const analytics = {
    track: jest.fn(),
};

const getService = (viewerScope: ViewerContentScope | undefined) => {
    dashboardService.getViewerContentScope.mockResolvedValue(viewerScope);
    dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
        viewerScope === undefined
            ? undefined
            : new Set(viewerScope.dashboardUuids),
    );
    return new SearchService({
        analytics: analytics as never,
        projectModel: projectModel as never,
        searchModel: searchModel as never,
        spaceModel: spaceModel as never,
        dashboardService: dashboardService as never,
    } as never);
};

describe('SearchService client-use scope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('drops the charts and spaces that are out of the scope', async () => {
        const service = getService(scope);

        const results = await service.getSearchResults(user, PROJECT_UUID, 'x');

        expect(results.savedCharts.map((chart) => chart.uuid)).toEqual([
            VISIBLE_CHART_UUID,
        ]);
        expect(results.sqlCharts.map((chart) => chart.uuid)).toEqual([
            VISIBLE_SQL_CHART_UUID,
        ]);
        expect(results.spaces.map((space) => space.uuid)).toEqual([
            VISIBLE_SPACE_UUID,
        ]);
        expect(results.dashboards.map((dashboard) => dashboard.uuid)).toEqual([
            VISIBLE_DASHBOARD_UUID,
        ]);
        expect(results.dashboardTabs.map((tab) => tab.dashboardUuid)).toEqual([
            VISIBLE_DASHBOARD_UUID,
        ]);
    });

    test('keeps every result when the scope does not apply', async () => {
        const service = getService(undefined);

        const results = await service.getSearchResults(user, PROJECT_UUID, 'x');

        expect(results.savedCharts).toHaveLength(2);
        expect(results.sqlCharts).toHaveLength(2);
        expect(results.spaces).toHaveLength(2);
        expect(results.dashboards).toHaveLength(2);
    });
});

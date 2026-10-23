import { SessionUser, ViewerContentScope } from '@lightdash/common';

import { PinningService } from './PinningService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const PINNED_LIST_UUID = 'pinned-list-uuid';

const VISIBLE_SPACE_UUID = 'visible-space-uuid';
const HIDDEN_SPACE_UUID = 'hidden-space-uuid';
const VISIBLE_CHART_UUID = 'visible-chart-uuid';
const HIDDEN_CHART_UUID = 'hidden-chart-uuid';
const VISIBLE_DASHBOARD_UUID = 'visible-dashboard-uuid';
const HIDDEN_DASHBOARD_UUID = 'hidden-dashboard-uuid';

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
    dashboardUuids: [VISIBLE_DASHBOARD_UUID],
    chartUuids: [VISIBLE_CHART_UUID],
    spaceUuids: [VISIBLE_SPACE_UUID],
    exploreNames: [],
};

const spaces = [
    {
        uuid: VISIBLE_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
        name: 'visible space',
    },
    {
        uuid: HIDDEN_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
        name: 'hidden space',
    },
];

const pinnedSpaces = [
    {
        type: 'space',
        data: { uuid: VISIBLE_SPACE_UUID, name: 'visible space' },
    },
    {
        type: 'space',
        data: { uuid: HIDDEN_SPACE_UUID, name: 'hidden space' },
    },
];

const pinnedCharts = [
    {
        type: 'chart',
        data: { uuid: VISIBLE_CHART_UUID, name: 'visible chart' },
    },
    {
        type: 'chart',
        data: { uuid: HIDDEN_CHART_UUID, name: 'hidden chart' },
    },
];

const pinnedDashboards = [
    {
        type: 'dashboard',
        data: { uuid: VISIBLE_DASHBOARD_UUID, name: 'visible dashboard' },
    },
    {
        type: 'dashboard',
        data: { uuid: HIDDEN_DASHBOARD_UUID, name: 'hidden dashboard' },
    },
];

const projectModel = {
    getSummary: jest.fn(async () => ({ organizationUuid: ORGANIZATION_UUID })),
};

const spaceModel = {
    find: jest.fn(async () => spaces),
    getUserSpacesAccess: jest.fn(async () => ({})),
};

const resourceViewItemModel = {
    getAllSpacesByPinnedListUuid: jest.fn(async () => pinnedSpaces),
    getAllowedChartsAndDashboards: jest.fn(async () => ({
        charts: pinnedCharts,
        dashboards: pinnedDashboards,
    })),
};

const dashboardService = {
    getViewerContentScope: jest.fn<
        Promise<ViewerContentScope | undefined>,
        [SessionUser, string]
    >(async () => scope),
    getAllowedDashboardUuidsForViewer: jest.fn<
        Promise<Set<string> | undefined>,
        [SessionUser, string]
    >(async () => new Set(scope.dashboardUuids)),
    getVisibleDashboardCountBySpaceUuid: jest.fn(
        async (spaceUuids: string[]) =>
            new Map(spaceUuids.map((spaceUuid) => [spaceUuid, 1])),
    ),
};

const getService = (viewerScope: ViewerContentScope | undefined) => {
    dashboardService.getViewerContentScope.mockResolvedValue(viewerScope);
    dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
        viewerScope === undefined
            ? undefined
            : new Set(viewerScope.dashboardUuids),
    );
    return new PinningService({
        projectModel: projectModel as never,
        spaceModel: spaceModel as never,
        resourceViewItemModel: resourceViewItemModel as never,
        dashboardService: dashboardService as never,
        dashboardModel: {} as never,
        savedChartModel: {} as never,
        pinnedListModel: {} as never,
    });
};

describe('PinningService client-use scope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        spaceModel.find.mockResolvedValue(spaces);
        spaceModel.getUserSpacesAccess.mockResolvedValue({});
        resourceViewItemModel.getAllSpacesByPinnedListUuid.mockResolvedValue(
            pinnedSpaces,
        );
        resourceViewItemModel.getAllowedChartsAndDashboards.mockResolvedValue({
            charts: pinnedCharts,
            dashboards: pinnedDashboards,
        });
    });

    test('drops the pinned spaces that are out of the scope', async () => {
        const service = getService(scope);

        const items = await service.getPinnedItems(
            user,
            PROJECT_UUID,
            PINNED_LIST_UUID,
        );

        const spaceUuids = items
            .filter((item) => item.type === 'space')
            .map((item) => item.data.uuid);
        expect(spaceUuids).toEqual([VISIBLE_SPACE_UUID]);
    });

    test('drops the pinned charts that are out of the scope', async () => {
        const service = getService(scope);

        const items = await service.getPinnedItems(
            user,
            PROJECT_UUID,
            PINNED_LIST_UUID,
        );

        const chartUuids = items
            .filter((item) => item.type === 'chart')
            .map((item) => item.data.uuid);
        expect(chartUuids).toEqual([VISIBLE_CHART_UUID]);
    });

    test('keeps every pinned item when the scope does not apply', async () => {
        const service = getService(undefined);

        const items = await service.getPinnedItems(
            user,
            PROJECT_UUID,
            PINNED_LIST_UUID,
        );

        expect(items.map((item) => item.data.uuid)).toEqual([
            VISIBLE_SPACE_UUID,
            HIDDEN_SPACE_UUID,
            VISIBLE_CHART_UUID,
            HIDDEN_CHART_UUID,
            VISIBLE_DASHBOARD_UUID,
            HIDDEN_DASHBOARD_UUID,
        ]);
    });
});

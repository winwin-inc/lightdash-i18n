import {
    ChartKind,
    ContentType,
    SessionUser,
    SummaryContent,
    ViewerContentScope,
} from '@lightdash/common';

import { ContentModel } from '../../models/ContentModel/ContentModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SavedSqlService } from '../SavedSqlService/SavedSqlService';
import { SpaceService } from '../SpaceService/SpaceService';
import { ContentService } from './ContentService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';

const user = {
    userUuid: 'user-uuid',
    email: '13800000000@example.com',
    organizationUuid: ORGANIZATION_UUID,
    ability: {
        can: jest.fn().mockReturnValue(true),
    },
} as unknown as SessionUser;

// Root space of the allow-listed dashboard, and its child space
const ROOT_SPACE_UUID = 'root-space-uuid';
const CHILD_SPACE_UUID = 'child-space-uuid';
// Space without any allow-listed content
const OTHER_SPACE_UUID = 'other-space-uuid';

const spaces = [
    {
        uuid: ROOT_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
    },
    {
        uuid: CHILD_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
    },
    {
        uuid: OTHER_SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
    },
];

const ALLOWED_DASHBOARD_UUID = 'allowed-dashboard-uuid';
const ALLOWED_CHART_UUID = 'allowed-chart-uuid';
const HIDDEN_CHART_UUID = 'hidden-chart-uuid';
const HIDDEN_DASHBOARD_UUID = 'hidden-dashboard-uuid';

const spaceContent = (uuid: string): SummaryContent =>
    ({
        contentType: ContentType.SPACE,
        uuid,
        slug: uuid,
        name: uuid,
        description: null,
        createdAt: new Date(),
        createdBy: null,
        lastUpdatedAt: null,
        lastUpdatedBy: null,
        project: { uuid: PROJECT_UUID, name: 'project' },
        organization: { uuid: ORGANIZATION_UUID, name: 'org' },
        space: { uuid, name: uuid },
        pinnedList: null,
        isPrivate: false,
        access: [],
        dashboardCount: 0,
        chartCount: 0,
        parentSpaceUuid: null,
        path: uuid,
        views: 0,
        firstViewedAt: null,
    } as SummaryContent);

const dashboardContent = (uuid: string, spaceUuid: string): SummaryContent =>
    ({
        contentType: ContentType.DASHBOARD,
        uuid,
        slug: uuid,
        name: uuid,
        description: null,
        createdAt: new Date(),
        createdBy: null,
        lastUpdatedAt: null,
        lastUpdatedBy: null,
        project: { uuid: PROJECT_UUID, name: 'project' },
        organization: { uuid: ORGANIZATION_UUID, name: 'org' },
        space: { uuid: spaceUuid, name: spaceUuid },
        pinnedList: null,
        owner: null,
    } as SummaryContent);

const chartContent = (uuid: string, spaceUuid: string): SummaryContent =>
    ({
        contentType: ContentType.CHART,
        uuid,
        slug: uuid,
        name: uuid,
        description: null,
        createdAt: new Date(),
        createdBy: null,
        lastUpdatedAt: null,
        lastUpdatedBy: null,
        project: { uuid: PROJECT_UUID, name: 'project' },
        organization: { uuid: ORGANIZATION_UUID, name: 'org' },
        space: { uuid: spaceUuid, name: spaceUuid },
        pinnedList: null,
        source: 'dbt_explore',
        chartKind: ChartKind.VERTICAL_BAR,
        dashboard: null,
        views: 0,
        firstViewedAt: null,
    } as SummaryContent);

const allContent: SummaryContent[] = [
    spaceContent(ROOT_SPACE_UUID),
    spaceContent(OTHER_SPACE_UUID),
    dashboardContent(ALLOWED_DASHBOARD_UUID, ROOT_SPACE_UUID),
    dashboardContent(HIDDEN_DASHBOARD_UUID, OTHER_SPACE_UUID),
    chartContent(ALLOWED_CHART_UUID, ROOT_SPACE_UUID),
    chartContent(HIDDEN_CHART_UUID, OTHER_SPACE_UUID),
];

const scope: ViewerContentScope = {
    dashboardUuids: [ALLOWED_DASHBOARD_UUID],
    chartUuids: [ALLOWED_CHART_UUID],
    spaceUuids: [ROOT_SPACE_UUID],
    exploreNames: [],
};

describe('ContentService client-use scope', () => {
    const spaceModel = {
        find: jest.fn().mockResolvedValue(spaces),
        getUserSpacesAccess: jest.fn().mockResolvedValue({}),
        getSpaceRoots: jest.fn(async (uuids: string[]) => {
            const roots = new Map<string, string>();
            uuids.forEach((uuid) => {
                roots.set(
                    uuid,
                    uuid === CHILD_SPACE_UUID ? ROOT_SPACE_UUID : uuid,
                );
            });
            return roots;
        }),
        getVisibleChartCountsBySpaceUuids: jest
            .fn()
            .mockResolvedValue(new Map<string, number>()),
    };

    const dashboardService = {
        getViewerContentScope: jest.fn().mockResolvedValue(scope),
        getAllowedDashboardUuidsForViewer: jest
            .fn()
            .mockResolvedValue(new Set([ALLOWED_DASHBOARD_UUID])),
        getVisibleDashboardCountBySpaceUuid: jest
            .fn()
            .mockResolvedValue(new Map<string, number>()),
    };

    // Emulate the database filter: only the content of the spaces that are
    // passed in `spaceUuids` is returned
    const findSummaryContents = async (args: { spaceUuids?: string[] }) => {
        const allowed = args.spaceUuids ?? [];
        const data = allContent.filter((content) =>
            allowed.includes(content.space?.uuid ?? ''),
        );
        return {
            data,
            pagination: {
                page: 1,
                pageSize: 100,
                totalResults: data.length,
            },
        };
    };

    const contentModel = {
        findSummaryContents: jest.fn(findSummaryContents),
    };

    const service = new ContentService({
        analytics: {} as never,
        projectModel: {
            getAllByOrganizationUuid: jest
                .fn()
                .mockResolvedValue([{ projectUuid: PROJECT_UUID }]),
        } as unknown as ProjectModel,
        contentModel: contentModel as unknown as ContentModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        spaceService: {} as unknown as SpaceService,
        dashboardService: dashboardService as unknown as DashboardService,
        savedChartService: {} as unknown as SavedChartService,
        savedSqlService: {} as unknown as SavedSqlService,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        contentModel.findSummaryContents.mockImplementation(
            findSummaryContents,
        );
        spaceModel.find.mockResolvedValue(spaces);
        spaceModel.getUserSpacesAccess.mockResolvedValue({});
        dashboardService.getViewerContentScope.mockResolvedValue(scope);
        dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
            new Set([ALLOWED_DASHBOARD_UUID]),
        );
    });

    it('keeps the space filter on the visible spaces, so allow-listed dashboards are not dropped', async () => {
        await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        expect(contentModel.findSummaryContents).toHaveBeenCalledTimes(1);
        const args = contentModel.findSummaryContents.mock.calls[0][0];
        expect(args.spaceUuids).toEqual(
            expect.arrayContaining([
                ROOT_SPACE_UUID,
                CHILD_SPACE_UUID,
                OTHER_SPACE_UUID,
            ]),
        );
    });

    it('hides the spaces that are not part of the client-use scope', async () => {
        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const spaceUuids = result.data
            .filter((content) => content.contentType === ContentType.SPACE)
            .map((content) => content.uuid);

        expect(spaceUuids).toEqual([ROOT_SPACE_UUID]);
    });

    it('keeps the allow-listed dashboard and hides the other dashboards', async () => {
        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const dashboardUuids = result.data
            .filter((content) => content.contentType === ContentType.DASHBOARD)
            .map((content) => content.uuid);

        expect(dashboardUuids).toEqual([ALLOWED_DASHBOARD_UUID]);
    });

    it('keeps the allow-listed charts and hides the other charts', async () => {
        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const chartUuids = result.data
            .filter((content) => content.contentType === ContentType.CHART)
            .map((content) => content.uuid);

        expect(chartUuids).toEqual([ALLOWED_CHART_UUID]);
    });

    it('hides a nested space that does not hold an allow-listed dashboard', async () => {
        spaceModel.find.mockResolvedValue([spaces[0], spaces[1], spaces[2]]);
        // The query returns the child space (browsing a space)
        contentModel.findSummaryContents.mockImplementation(
            async (args: { spaceUuids?: string[] }) => {
                const base = await findSummaryContents(args);
                return {
                    ...base,
                    data: [
                        spaceContent(CHILD_SPACE_UUID),
                        ...base.data.filter(
                            (content) =>
                                content.contentType !== ContentType.SPACE,
                        ),
                    ],
                };
            },
        );

        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const spaceUuids = result.data
            .filter((content) => content.contentType === ContentType.SPACE)
            .map((content) => content.uuid);

        // The scope is dashboard driven: the child space does not hold an
        // allow-listed dashboard, so it is hidden even when its root space is
        // part of the scope
        expect(spaceUuids).toEqual([]);
    });

    it('keeps an allow-listed dashboard even when its space is not in the scope', async () => {
        // The dashboard allow-list is authoritative for dashboards: the space
        // scope must not remove an allow-listed dashboard (double filtering)
        dashboardService.getViewerContentScope.mockResolvedValue({
            ...scope,
            spaceUuids: [],
        });

        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const dashboardUuids = result.data
            .filter((content) => content.contentType === ContentType.DASHBOARD)
            .map((content) => content.uuid);

        expect(dashboardUuids).toEqual([ALLOWED_DASHBOARD_UUID]);
    });

    it('hides a space without an allow-listed dashboard but keeps its chart', async () => {
        // The scope is dashboard driven: only the spaces that hold an
        // allow-listed dashboard are visible. A chart that is a tile of an
        // allow-listed dashboard stays visible, even when its own space is
        // not part of the scope.
        dashboardService.getViewerContentScope.mockResolvedValue({
            ...scope,
            spaceUuids: [],
            chartUuids: [ALLOWED_CHART_UUID, HIDDEN_CHART_UUID],
        });

        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const spaceUuids = result.data
            .filter((content) => content.contentType === ContentType.SPACE)
            .map((content) => content.uuid);
        const chartUuids = result.data
            .filter((content) => content.contentType === ContentType.CHART)
            .map((content) => content.uuid);

        expect(spaceUuids).toEqual([]);
        expect(chartUuids).toEqual([ALLOWED_CHART_UUID, HIDDEN_CHART_UUID]);
    });

    it('does not filter anything when the project is not client-use', async () => {
        dashboardService.getViewerContentScope.mockResolvedValue(undefined);
        dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
            undefined,
        );

        const result = await service.find(
            user,
            { projectUuids: [PROJECT_UUID] },
            {},
            { page: 1, pageSize: 100 },
        );

        const uuids = result.data.map((content) => content.uuid);

        expect(uuids).toEqual(
            expect.arrayContaining([
                ROOT_SPACE_UUID,
                OTHER_SPACE_UUID,
                ALLOWED_DASHBOARD_UUID,
                HIDDEN_DASHBOARD_UUID,
                ALLOWED_CHART_UUID,
                HIDDEN_CHART_UUID,
            ]),
        );
    });
});

import { subject } from '@casl/ability';
import {
    ForbiddenError,
    isUserWithOrg,
    PinnedItems,
    SessionUser,
    UpdatePinnedItemOrder,
} from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ResourceViewItemModel } from '../../models/ResourceViewItemModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type PinningServiceArguments = {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;
    resourceViewItemModel: ResourceViewItemModel;
    projectModel: ProjectModel;
    dashboardService: DashboardService;
};

export class PinningService extends BaseService {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;

    resourceViewItemModel: ResourceViewItemModel;

    projectModel: ProjectModel;

    dashboardService: DashboardService;

    constructor({
        dashboardModel,
        savedChartModel,
        spaceModel,
        pinnedListModel,
        resourceViewItemModel,
        projectModel,
        dashboardService,
    }: PinningServiceArguments) {
        super();
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.pinnedListModel = pinnedListModel;
        this.resourceViewItemModel = resourceViewItemModel;
        this.projectModel = projectModel;
        this.dashboardService = dashboardService;
    }

    async getPinnedItems(
        user: SessionUser,
        projectUuid: string,
        pinnedListUuid: string,
    ): Promise<PinnedItems> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );
        const allowedSpaceUuids = spaces
            .filter((space, index) =>
                hasViewAccessToSpace(
                    user,
                    space,
                    spacesAccess[space.uuid] ?? [],
                ),
            )
            .map((s) => s.uuid);

        if (allowedSpaceUuids.length === 0) {
            return [];
        }
        const allPinnedSpaces =
            await this.resourceViewItemModel.getAllSpacesByPinnedListUuid(
                projectUuid,
                pinnedListUuid,
            );

        const allowedPinnedSpaces = allPinnedSpaces.filter(
            ({ data: { uuid } }) => allowedSpaceUuids.includes(uuid),
        );
        const { charts: allowedCharts, dashboards: allowedDashboards } =
            await this.resourceViewItemModel.getAllowedChartsAndDashboards(
                projectUuid,
                pinnedListUuid,
                allowedSpaceUuids,
            );

        const allowedDashboardUuids =
            await this.dashboardService.getAllowedDashboardUuidsForViewer(
                user,
                projectUuid,
            );

        // undefined: keep SQL dashboardCount and unfiltered pins.
        // Set: drop unauthorized dashboards and recount pinned-space counts.
        if (allowedDashboardUuids === undefined || !isUserWithOrg(user)) {
            return [
                ...allowedPinnedSpaces,
                ...allowedCharts,
                ...allowedDashboards,
            ];
        }

        const visibleDashboards = allowedDashboards.filter(({ data }) =>
            allowedDashboardUuids.has(data.uuid),
        );
        const spaceCounts =
            await this.dashboardService.getVisibleDashboardCountBySpaceUuid(
                allowedPinnedSpaces.map(({ data }) => data.uuid),
                allowedDashboardUuids,
            );
        const visiblePinnedSpaces = allowedPinnedSpaces.map((space) => ({
            ...space,
            data: {
                ...space.data,
                dashboardCount: spaceCounts.get(space.data.uuid) ?? 0,
            },
        }));

        return [...visiblePinnedSpaces, ...allowedCharts, ...visibleDashboards];
    }

    async updatePinnedItemsOrder(
        user: SessionUser,
        projectUuid: string,
        pinnedListUuid: string,
        itemsOrder: Array<UpdatePinnedItemOrder>,
    ): Promise<PinnedItems> {
        const project = await this.projectModel.get(projectUuid);
        if (user.ability.cannot('manage', subject('PinnedItems', project))) {
            throw new ForbiddenError();
        }
        if (project.pinnedListUuid !== pinnedListUuid) {
            throw new ForbiddenError('Pinned list does not belong to project');
        }
        await this.pinnedListModel.updatePinnedItemsOrder(
            projectUuid,
            pinnedListUuid,
            itemsOrder,
        );
        return this.getPinnedItems(user, projectUuid, pinnedListUuid);
    }
}

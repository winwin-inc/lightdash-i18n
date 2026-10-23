import { ForbiddenError, SessionUser } from '@lightdash/common';

import { CommentService } from './CommentService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const SPACE_UUID = 'space-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';

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

const dashboard = {
    uuid: DASHBOARD_UUID,
    projectUuid: PROJECT_UUID,
    organizationUuid: ORGANIZATION_UUID,
    spaceUuid: SPACE_UUID,
};

const dashboardModel = {
    getByIdOrSlug: jest.fn(async () => dashboard),
};

const dashboardService = {
    getAllowedDashboardUuidsForViewer: jest.fn<
        Promise<Set<string> | undefined>,
        [SessionUser, string]
    >(async () => new Set([DASHBOARD_UUID])),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => ({
        uuid: SPACE_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isPrivate: false,
    })),
    getUserSpaceAccess: jest.fn(async () => []),
};

const commentModel = {
    findCommentsForDashboard: jest.fn(async () => ({})),
};

const getService = () =>
    new CommentService({
        analytics: { track: jest.fn() } as never,
        dashboardModel: dashboardModel as never,
        dashboardService: dashboardService as never,
        spaceModel: spaceModel as never,
        commentModel: commentModel as never,
        notificationsModel: {} as never,
        userModel: {} as never,
    });

describe('CommentService client-use allow-list', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('reads the comments of an allow-listed dashboard', async () => {
        const service = getService();

        await expect(
            service.findCommentsForDashboard(user, DASHBOARD_UUID),
        ).resolves.toEqual({});
    });

    test('refuses the comments of a dashboard out of the allow-list', async () => {
        dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
            new Set(),
        );
        const service = getService();

        await expect(
            service.findCommentsForDashboard(user, DASHBOARD_UUID),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('keeps the normal behaviour when the allow-list does not apply', async () => {
        dashboardService.getAllowedDashboardUuidsForViewer.mockResolvedValue(
            undefined,
        );
        const service = getService();

        await expect(
            service.findCommentsForDashboard(user, DASHBOARD_UUID),
        ).resolves.toEqual({});
    });
});

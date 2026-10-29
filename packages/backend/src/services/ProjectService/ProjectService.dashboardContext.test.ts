import {
    ForbiddenError,
    NotFoundError,
    type Account,
    type SessionUser,
} from '@lightdash/common';

// The ProjectService import chain pulls in the github client and the
// warehouse clients, neither is needed for the dashboard context.
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
const DASHBOARD_UUID = 'dashboard-uuid';
const DASHBOARD_SLUG = 'my-dashboard';

const registeredUser = {
    userUuid: 'user-uuid',
    email: 'user@example.com',
    organizationUuid: ORGANIZATION_UUID,
    type: 'registered',
    ability: {
        can: jest.fn().mockReturnValue(true),
        cannot: jest.fn().mockReturnValue(false),
    },
} as unknown as SessionUser;

const registeredAccount = {
    user: registeredUser,
    organization: { organizationUuid: ORGANIZATION_UUID },
    isRegisteredUser: () => true,
} as unknown as Account;

const anonymousAccount = {
    user: {
        type: 'anonymous',
        ability: {
            can: jest.fn().mockReturnValue(true),
            cannot: jest.fn().mockReturnValue(false),
        },
    },
    organization: { organizationUuid: ORGANIZATION_UUID },
    isRegisteredUser: () => false,
} as unknown as Account;

const dashboard = {
    uuid: DASHBOARD_UUID,
    slug: DASHBOARD_SLUG,
    name: 'My dashboard',
    projectUuid: PROJECT_UUID,
    spaceUuid: 'space-uuid',
};

const dashboardModel = {
    getByIdOrSlug: jest.fn(async (uuidOrSlug: string, projectUuid?: string) => {
        if (uuidOrSlug !== DASHBOARD_UUID || projectUuid !== PROJECT_UUID) {
            throw new NotFoundError('NotFoundError');
        }
        return dashboard;
    }),
};

const dashboardService = {
    resolveDashboardContextForMetadata: jest.fn(),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => ({
        uuid: 'space-uuid',
        isPrivate: false,
    })),
    getUserSpaceAccess: jest.fn(async () => []),
};

const getService = () =>
    new ProjectService({
        dashboardModel: dashboardModel as never,
        dashboardService: dashboardService as never,
        spaceModel: spaceModel as never,
    } as never);

// The methods are protected: they are exercised through a typed view of the
// service.
type ContextResolver = {
    resolveDashboardContextForQuery: (
        account: Account,
        projectUuid: string,
        dashboardUuid: string | undefined,
    ) => Promise<
        | {
              dashboardSlug?: string;
              dashboardName?: string;
              dashboardUuid?: string;
          }
        | undefined
    >;
    resolveDashboardContextForProject: (
        projectUuid: string,
        dashboardUuidOrSlug: string,
    ) => Promise<{
        dashboardSlug: string;
        dashboardName: string;
        dashboardUuid: string;
    }>;
};

const resolveForQuery = (
    account: Account,
    dashboardUuid: string | undefined,
): Promise<
    | { dashboardSlug?: string; dashboardName?: string; dashboardUuid?: string }
    | undefined
> =>
    (
        getService() as unknown as ContextResolver
    ).resolveDashboardContextForQuery(account, PROJECT_UUID, dashboardUuid);

const resolveForProject = (
    dashboardUuidOrSlug: string,
): Promise<{
    dashboardSlug: string;
    dashboardName: string;
    dashboardUuid: string;
}> =>
    (
        getService() as unknown as ContextResolver
    ).resolveDashboardContextForProject(PROJECT_UUID, dashboardUuidOrSlug);

describe('ProjectService dashboard context', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        dashboardService.resolveDashboardContextForMetadata.mockResolvedValue({
            dashboardSlug: DASHBOARD_SLUG,
            dashboardName: dashboard.name,
            dashboardUuid: DASHBOARD_UUID,
            filterTableNames: [],
        });
    });

    describe('resolveDashboardContextForQuery', () => {
        test('does not resolve anything when no dashboard is given', async () => {
            await expect(
                resolveForQuery(registeredAccount, undefined),
            ).resolves.toBeUndefined();
            expect(
                dashboardService.resolveDashboardContextForMetadata,
            ).not.toHaveBeenCalled();
        });

        test('returns the canonical slug, name and uuid of the dashboard', async () => {
            await expect(
                resolveForQuery(registeredAccount, DASHBOARD_UUID),
            ).resolves.toEqual({
                dashboardSlug: DASHBOARD_SLUG,
                dashboardName: dashboard.name,
                dashboardUuid: DASHBOARD_UUID,
            });
            expect(
                dashboardService.resolveDashboardContextForMetadata,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: 'user-uuid' }),
                PROJECT_UUID,
                DASHBOARD_UUID,
                undefined,
            );
        });

        test('fails closed when the dashboard cannot be verified', async () => {
            dashboardService.resolveDashboardContextForMetadata.mockResolvedValue(
                undefined,
            );

            await expect(
                resolveForQuery(registeredAccount, 'other-dashboard-uuid'),
            ).rejects.toThrowError(ForbiddenError);
        });

        test('resolves the dashboard of an anonymous user within the project', async () => {
            await expect(
                resolveForQuery(anonymousAccount, DASHBOARD_UUID),
            ).resolves.toEqual({
                dashboardSlug: DASHBOARD_SLUG,
                dashboardName: dashboard.name,
                dashboardUuid: DASHBOARD_UUID,
            });
        });

        test('fails closed when the anonymous user cannot see the dashboard', async () => {
            (
                anonymousAccount.user.ability as unknown as {
                    cannot: jest.Mock;
                }
            ).cannot.mockReturnValue(true);

            await expect(
                resolveForQuery(anonymousAccount, DASHBOARD_UUID),
            ).rejects.toThrowError(ForbiddenError);

            (
                anonymousAccount.user.ability as unknown as {
                    cannot: jest.Mock;
                }
            ).cannot.mockReturnValue(false);
        });
    });

    describe('resolveDashboardContextForProject', () => {
        test('resolves the dashboard scoped to the project', async () => {
            await expect(resolveForProject(DASHBOARD_UUID)).resolves.toEqual({
                dashboardSlug: DASHBOARD_SLUG,
                dashboardName: dashboard.name,
                dashboardUuid: DASHBOARD_UUID,
            });
            expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
                DASHBOARD_UUID,
                PROJECT_UUID,
            );
        });

        test('fails closed when the dashboard is not in the project', async () => {
            await expect(
                resolveForProject('other-dashboard-uuid'),
            ).rejects.toThrowError(ForbiddenError);
        });
    });
});

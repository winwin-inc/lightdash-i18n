import {
    DEFAULT_DASHBOARD_ATTRIBUTE_VALUE,
    getIntrinsicUserAttributes,
} from './user';

describe('getIntrinsicUserAttributes', () => {
    test('returns the email only when there is no dashboard context', () => {
        expect(
            getIntrinsicUserAttributes({ email: 'user@example.com' }),
        ).toEqual({
            email: 'user@example.com',
            dashboardSlug: DEFAULT_DASHBOARD_ATTRIBUTE_VALUE,
            dashboardName: DEFAULT_DASHBOARD_ATTRIBUTE_VALUE,
            dashboardUuid: DEFAULT_DASHBOARD_ATTRIBUTE_VALUE,
        });
    });

    test('passes the dashboard context to the dbt schema', () => {
        expect(
            getIntrinsicUserAttributes(
                { email: 'user@example.com' },
                {
                    dashboardSlug: 'my-dashboard',
                    dashboardName: 'My dashboard',
                    dashboardUuid: 'dashboard-uuid',
                },
            ),
        ).toEqual({
            email: 'user@example.com',
            dashboardSlug: 'my-dashboard',
            dashboardName: 'My dashboard',
            dashboardUuid: 'dashboard-uuid',
        });
    });

    test('falls back to NA for the dashboard uuid when it is not provided', () => {
        const attributes = getIntrinsicUserAttributes(
            { email: 'user@example.com' },
            {
                dashboardSlug: 'my-dashboard',
                dashboardName: 'My dashboard',
            },
        );

        expect(attributes.dashboardUuid).toEqual(
            DEFAULT_DASHBOARD_ATTRIBUTE_VALUE,
        );
    });
});

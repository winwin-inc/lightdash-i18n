/**
 * Dashboard comment notifications are currently disabled.
 *
 * The comment feature is hidden on the dashboard page (see `pages/Dashboard.tsx`),
 * so the notification bell could never show anything meaningful while still
 * polling `/api/v1/notifications?type=dashboardComments` on every navigation.
 *
 * The backend endpoints (`NotificationsController` / `notifications` table) are
 * left untouched, so this can be re-enabled by flipping this flag back to
 * `true`.
 */
export const DASHBOARD_COMMENTS_NOTIFICATIONS_ENABLED = false;

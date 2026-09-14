import { type Notification } from '@lightdash/common';
import { Menu, Text, Tooltip, useMantineTheme } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useUpdateNotification } from '../hooks/useNotifications';

type Props = {
    projectUuid: string;
    notifications: Notification[];
};

// Backend stores English message; parse and localize for display.
// Format: `{author} tagged you|commented in dashboard "{name}" [in tile "{tile}"]`
const DASHBOARD_COMMENT_MESSAGE_REGEX =
    /^(.+?) (tagged you|commented) in dashboard "(.+?)"(?: in tile "(.+?)")?\s*$/;

const getLocalizedDashboardCommentMessage = (
    notification: Notification,
    t: (key: string, options?: Record<string, string>) => string,
): string => {
    if (!notification.message) {
        return '';
    }

    const match = notification.message.match(DASHBOARD_COMMENT_MESSAGE_REGEX);
    if (!match) {
        return notification.message;
    }

    const [, author, action, parsedDashboardName, parsedTileName] = match;
    const dashboardName =
        notification.metadata?.dashboardName ?? parsedDashboardName;
    const tileName =
        notification.metadata?.dashboardTileName ?? parsedTileName;
    const isTagged = action === 'tagged you';

    if (tileName) {
        return t(
            isTagged
                ? 'features_notifications.dashboard_comment.tagged_in_tile'
                : 'features_notifications.dashboard_comment.commented_in_tile',
            { author, dashboardName, tileName },
        );
    }

    return t(
        isTagged
            ? 'features_notifications.dashboard_comment.tagged'
            : 'features_notifications.dashboard_comment.commented',
        { author, dashboardName },
    );
};

const NotificationTime: FC<{ createdAt: Date }> = ({ createdAt }) => {
    const date = useTimeAgo(createdAt);
    return (
        <Tooltip
            position="top-end"
            // Add offset so toolip pointer is closer to the text
            offset={-2}
            label={
                <Text fz="xs">
                    {dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
            }
        >
            <Text ta="right" mb="one" fw={500} color="gray.5">
                {date}
            </Text>
        </Tooltip>
    );
};

export const DashboardCommentsNotifications: FC<Props> = ({
    projectUuid,
    notifications,
}) => {
    const { t } = useTranslation();
    const { track } = useTracking();
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { mutateAsync: updateNotification } = useUpdateNotification();

    const handleOnNotificationClick = useCallback(
        async (notification: Notification) => {
            await updateNotification({
                notificationId: notification.notificationId,
                resourceType: notification.resourceType,
                toUpdate: {
                    viewed: true,
                },
            });

            track({
                name: EventName.NOTIFICATIONS_COMMENTS_ITEM_CLICKED,
                properties: {
                    hasMention: true, // TODO: At the moment, comments' notifications are always mentions
                    dashboardUuid: notification.metadata?.dashboardUuid,
                    dashboardTileUuid: notification.metadata?.dashboardTileUuid,
                },
            });

            void navigate(
                `/projects/${projectUuid}${notification.url}${
                    notification.metadata?.dashboardTileUuid
                        ? `?tileUuid=${notification.metadata?.dashboardTileUuid}`
                        : ''
                }`,
            );
        },
        [navigate, projectUuid, track, updateNotification],
    );

    return (
        <>
            {notifications.map((notification) => (
                <Menu.Item
                    p="xs"
                    key={notification.notificationId}
                    icon={
                        <MantineIcon
                            size={10}
                            icon={IconCircleFilled}
                            style={{
                                color: notification.viewed
                                    ? 'transparent'
                                    : theme.colors.blue[4],
                            }}
                        />
                    }
                    onClick={() => handleOnNotificationClick(notification)}
                    fz="xs"
                >
                    <>
                        <NotificationTime createdAt={notification.createdAt} />
                        <Text c="gray.3">
                            {getLocalizedDashboardCommentMessage(
                                notification,
                                t,
                            )}
                        </Text>
                    </>
                </Menu.Item>
            ))}
        </>
    );
};

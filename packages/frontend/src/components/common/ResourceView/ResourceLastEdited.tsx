import {
    type ResourceViewChartItem,
    type ResourceViewDashboardItem,
} from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import dayjs from 'dayjs';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useTimeAgo } from '../../../hooks/useTimeAgo';

interface ResourceLastEditedProps {
    item: ResourceViewChartItem | ResourceViewDashboardItem;
}

const ResourceLastEdited: FC<ResourceLastEditedProps> = ({
    item: {
        data: { updatedAt, updatedByUser: user },
    },
}) => {
    const { t } = useTranslation();
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <div>
            <Tooltip
                withinPortal
                position="top-start"
                label={dayjs(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            >
                <Text fz={12} fw={500} color="gray.7">
                    {timeAgo}
                </Text>
            </Tooltip>

            {user && user.firstName ? (
                <Text fz={12} color="gray.6">
                    {t('components_common_resource_view_last_edited.by')}{' '}
                    {user.firstName} {user.lastName}
                </Text>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;

import { type ResourceViewSpaceItem } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../MantineIcon';
import { ResourceAccess } from './types';
import { getResourceAccessType, useResourceAccessLabel } from './utils';

const ResourceAccessInfoData = {
    [ResourceAccess.Private]: {
        Icon: IconLock,
        statusKey: 'components_common_resource_view_access_info.status.private',
    },
    [ResourceAccess.Public]: {
        Icon: IconUsers,
        statusKey: 'components_common_resource_view_access_info.status.public',
    },
    [ResourceAccess.Shared]: {
        Icon: IconUser,
        statusKey: 'components_common_resource_view_access_info.status.shared',
    },
} as const;

interface ResourceAccessInfoProps {
    item: ResourceViewSpaceItem;
    type?: 'primary' | 'secondary';
    withTooltip?: boolean;
}

const ResourceAccessInfo: React.FC<ResourceAccessInfoProps> = ({
    item,
    type = 'secondary',
    withTooltip = false,
}) => {
    const { t } = useTranslation();
    const { Icon, statusKey } =
        ResourceAccessInfoData[getResourceAccessType(item)];
    const status = t(statusKey);

    const styles = useMemo(() => {
        return {
            color: type === 'primary' ? 'gray.7' : 'gray.6',
            size: type === 'primary' ? 14 : 12,
        };
    }, [type]);

    const getResourceAccessLabel = useResourceAccessLabel();

    return (
        <Tooltip
            withinPortal
            withArrow
            position="top"
            // Hack the tooltip to never open when `withTooltip` is false
            opened={withTooltip ? undefined : false}
            label={
                <Text lineClamp={1} fz="xs" fw={600} color="white">
                    {getResourceAccessLabel(item)}
                </Text>
            }
        >
            <Group spacing={4}>
                <MantineIcon
                    icon={Icon}
                    color={styles.color}
                    size={styles.size}
                />

                <Text size={styles.size} color={styles.color}>
                    {status}
                </Text>
            </Group>
        </Tooltip>
    );
};

export default ResourceAccessInfo;

import { subject } from '@casl/ability';
import { hasCustomBinDimension, type MetricQuery } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';
import { type FC, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useAccount } from '../../hooks/user/useAccount';
import { Can } from '../../providers/Ability';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

type Props = {
    onViewUnderlyingData: () => void;
    metricQuery: MetricQuery;
};

const TrackedItem: FC<{ onClick: () => void }> = ({ onClick }) => {
    const { t } = useTranslation();

    const { track } = useTracking();
    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};
    const projectUuid = useProjectUuid();

    const handleClick = useCallback(() => {
        onClick();

        const identity = account?.isRegisteredUser
            ? { accountId: account?.user?.id }
            : { anonymousId: 'embed', externalId: account?.user?.id };
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                ...identity,
                organizationId: organizationUuid,
                projectId: projectUuid,
            },
        });
    }, [onClick, account, organizationUuid, projectUuid, track]);

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconStack} />}
            onClick={handleClick}
        >
            {t(
                'components_dashboard_tiles_underlying_data_menu.view_underlying_data',
            )}
        </Menu.Item>
    );
};

export const UnderlyingDataMenuItem: FC<Props> = ({
    metricQuery,
    onViewUnderlyingData,
}) => {
    const { t } = useTranslation();

    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};
    const projectUuid = useProjectUuid();
    const { pathname } = useLocation();

    if (hasCustomBinDimension(metricQuery)) {
        return null;
    }

    const canTrack = !pathname.includes('/minimal');

    return (
        <Can
            I="view"
            this={subject('UnderlyingData', {
                organizationUuid,
                projectUuid: projectUuid,
            })}
        >
            {canTrack ? (
                <TrackedItem onClick={onViewUnderlyingData} />
            ) : (
                <Menu.Item
                    icon={<MantineIcon icon={IconStack} />}
                    onClick={onViewUnderlyingData}
                >
                    {t(
                        'components_dashboard_tiles_underlying_data_menu.view_underlying_data',
                    )}
                </Menu.Item>
            )}
        </Can>
    );
};

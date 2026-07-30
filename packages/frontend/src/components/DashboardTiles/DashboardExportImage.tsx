import { ChartType } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type RefObject, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
/**
 * The menu item that opens the "Export image" modal.
 * The modal itself is rendered by the parent (`DashboardChartTile`) and
 * controlled via `isOpen` / `onOpenChange` so it lives outside the Menu's
 * portal subtree (which would otherwise unmount it on click and cause the
 * modal to flash-and-close immediately).
 */
export const DashboardExportImage: FC<{
    chartType: ChartType;
    echartRef: RefObject<any | null> | undefined;
    chartName: string;
    isMinimal: boolean;
    onOpen: () => void;
}> = ({ isMinimal, onOpen }) => {
    const { t } = useTranslation();
    const { track } = useTracking();

    const onMenuClick = useCallback(() => {
        if (isMinimal) {
            track({ name: EventName.EMBED_DOWNLOAD_IMAGE_CLICKED });
        } else {
            track({ name: EventName.DOWNLOAD_IMAGE_CLICKED });
        }
        onOpen();
    }, [isMinimal, onOpen, track]);

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconPhoto} />}
            onClick={onMenuClick}
        >
            {t(
                'components_dashboard_tiles_dashboard_export_image.export_image',
            )}
        </Menu.Item>
    );
};
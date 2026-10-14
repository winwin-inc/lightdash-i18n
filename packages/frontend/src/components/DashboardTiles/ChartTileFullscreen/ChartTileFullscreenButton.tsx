import { ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowsMaximize } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';

type ChartTileFullscreenButtonProps = {
    onClick: () => void;
};

/**
 * Header ActionIcon that opens the chart tile fullscreen modal.
 * Rendered via TileBase `extraHeaderElement` immediately left of the three-dot menu.
 */
const ChartTileFullscreenButton: FC<ChartTileFullscreenButtonProps> = ({
    onClick,
}) => {
    const { t } = useTranslation();
    const label = t(
        'components_dashboard_tiles_chart_fullscreen.enter_fullscreen',
    );

    return (
        <Tooltip label={label} withinPortal>
            <ActionIcon
                size="sm"
                onClick={onClick}
                aria-label={label}
                className="non-draggable"
            >
                <MantineIcon icon={IconArrowsMaximize} />
            </ActionIcon>
        </Tooltip>
    );
};

export default ChartTileFullscreenButton;

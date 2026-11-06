import { ActionIcon } from '@mantine/core';
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
 * 不展示 hover 提示（tooltip），仅保留 aria-label 供读屏使用。
 */
const ChartTileFullscreenButton: FC<ChartTileFullscreenButtonProps> = ({
    onClick,
}) => {
    const { t } = useTranslation();
    const label = t(
        'components_dashboard_tiles_chart_fullscreen.enter_fullscreen',
    );

    return (
        <ActionIcon
            size="sm"
            onClick={onClick}
            aria-label={label}
            className="non-draggable"
        >
            <MantineIcon icon={IconArrowsMaximize} />
        </ActionIcon>
    );
};

export default ChartTileFullscreenButton;

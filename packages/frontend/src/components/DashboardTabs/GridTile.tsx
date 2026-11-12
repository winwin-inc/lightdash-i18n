import {
    DashboardTileTypes,
    assertUnreachable,
    type DashboardTab,
    type Dashboard as IDashboard,
} from '@lightdash/common';
import { Badge, Box, Tooltip } from '@mantine/core';
import { useProfiler } from '@sentry/react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import ChartTile from '../DashboardTiles/DashboardChartTile';
import DataAppTile from '../DashboardTiles/DashboardDataAppTile';
import LoomTile from '../DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../DashboardTiles/DashboardMarkdownTile';
import SqlChartTile from '../DashboardTiles/DashboardSqlChartTile';
import TileBase from '../DashboardTiles/TileBase';

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > & {
        index: number;
        tabs?: DashboardTab[];
        onAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
        locked: boolean;
        /** 查看模式下该 tile 会因为「筛选器无值」被隐藏（编辑模式只用于角标） */
        wouldHideWhenEmpty?: boolean;
    }
> = memo((props) => {
    const { tile, wouldHideWhenEmpty, ...tileProps } = props;
    const { t } = useTranslation();
    useProfiler(`Dashboard-${tile.type}`);

    const badge =
        props.isEditMode && wouldHideWhenEmpty ? (
            <Tooltip
                withinPortal
                variant="xs"
                label={t(
                    'components_dashboard_tiles.tile_hidden_when_empty_tooltip',
                )}
            >
                <Badge
                    size="xs"
                    variant="light"
                    color="gray"
                    style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        zIndex: 2,
                        pointerEvents: 'auto',
                    }}
                >
                    {t('components_dashboard_tiles.tile_hidden_when_empty')}
                </Badge>
            </Tooltip>
        ) : null;

    if (props.locked) {
        return (
            <Box h="100%" style={{ position: 'relative' }}>
                {badge}
                <TileBase
                    isLoading={false}
                    title={''}
                    {...tileProps}
                    tile={tile}
                />
            </Box>
        );
    }

    const tileContent = (() => {
        switch (tile.type) {
            case DashboardTileTypes.SAVED_CHART:
                return <ChartTile {...tileProps} tile={tile} />;
            case DashboardTileTypes.MARKDOWN:
                return <MarkdownTile {...tileProps} tile={tile} />;
            case DashboardTileTypes.LOOM:
                return <LoomTile {...tileProps} tile={tile} />;
            case DashboardTileTypes.SQL_CHART:
                return <SqlChartTile {...tileProps} tile={tile} />;
            case DashboardTileTypes.DATA_APP:
                return <DataAppTile {...tileProps} tile={tile} />;
            default: {
                return assertUnreachable(
                    tile,
                    `Dashboard tile type "${props.tile.type}" not recognised`,
                );
            }
        }
    })();

    return (
        <Box h="100%" style={{ position: 'relative' }}>
            {badge}
            {tileContent}
        </Box>
    );
});

export default GridTile;

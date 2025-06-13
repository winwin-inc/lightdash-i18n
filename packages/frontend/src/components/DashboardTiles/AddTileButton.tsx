import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import {
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import {
    IconChartBar,
    IconInfoCircle,
    IconMarkdown,
    IconNewSection,
    IconPlus,
    IconVideo,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { TileAddModal } from './TileForms/TileAddModal';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    hasNewSemanticLayerChart?: boolean;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
} & Pick<ButtonProps, 'disabled'>;

const AddTileButton: FC<Props> = ({
    onAddTiles,
    setAddingTab,
    hasNewSemanticLayerChart = false,
    disabled,
    activeTabUuid,
    dashboardTabs,
}) => {
    const { t } = useTranslation();
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState<boolean>(false);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const { storeDashboard } = useDashboardStorage();
    const navigate = useNavigate();

    const onAddTile = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            onAddTiles([tile]);
        },
        [onAddTiles],
    );
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    return (
        <>
            <Menu
                position="bottom"
                withArrow
                withinPortal
                shadow="md"
                width={200}
            >
                <Menu.Target>
                    <Button
                        size="xs"
                        variant="default"
                        disabled={disabled}
                        leftIcon={<MantineIcon icon={IconPlus} />}
                    >
                        {t(
                            'components_dashboard_tiles_add_tile_button.add_tile',
                        )}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        onClick={() => setIsAddChartTilesModalOpen(true)}
                        icon={<MantineIcon icon={IconChartBar} />}
                    >
                        {t(
                            'components_dashboard_tiles_add_tile_button.saved_chart',
                        )}
                    </Menu.Item>

                    {!hasNewSemanticLayerChart && (
                        <Menu.Item
                            onClick={() => {
                                storeDashboard(
                                    dashboardTiles,
                                    dashboardFilters,
                                    haveTilesChanged,
                                    haveFiltersChanged,
                                    dashboard?.uuid,
                                    dashboard?.name,
                                    activeTabUuid,
                                    dashboardTabs,
                                );
                                void navigate(
                                    `/projects/${projectUuid}/tables`,
                                );
                            }}
                            icon={<MantineIcon icon={IconPlus} />}
                        >
                            <Group spacing="xxs">
                                <Text>
                                    {t(
                                        'components_dashboard_tiles_add_tile_button.new_chart',
                                    )}
                                </Text>
                                <Tooltip
                                    label={t(
                                        'components_dashboard_tiles_add_tile_button.tooltip_new_chart',
                                    )}
                                >
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        color="gray.6"
                                    />
                                </Tooltip>
                            </Group>
                        </Menu.Item>
                    )}

                    <Menu.Item
                        onClick={() =>
                            setAddTileType(DashboardTileTypes.MARKDOWN)
                        }
                        icon={<MantineIcon icon={IconMarkdown} />}
                    >
                        {t(
                            'components_dashboard_tiles_add_tile_button.markdown',
                        )}
                    </Menu.Item>

                    <Menu.Item
                        onClick={() => setAddTileType(DashboardTileTypes.LOOM)}
                        icon={<MantineIcon icon={IconVideo} />}
                    >
                        {t(
                            'components_dashboard_tiles_add_tile_button.loom_video',
                        )}
                    </Menu.Item>

                    <Menu.Item
                        onClick={() => setAddingTab(true)}
                        icon={<MantineIcon icon={IconNewSection} />}
                    >
                        {t(
                            'components_dashboard_tiles_add_tile_button.add_tab',
                        )}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            {isAddChartTilesModalOpen && (
                <AddChartTilesModal
                    onClose={() => setIsAddChartTilesModalOpen(false)}
                    onAddTiles={onAddTiles}
                />
            )}

            {addTileType === DashboardTileTypes.MARKDOWN ||
            addTileType === DashboardTileTypes.LOOM ? (
                <TileAddModal
                    opened={!!addTileType}
                    type={addTileType}
                    onClose={() => setAddTileType(undefined)}
                    onConfirm={(tile) => {
                        onAddTile(tile);
                        setAddTileType(undefined);
                    }}
                />
            ) : null}
        </>
    );
};

export default AddTileButton;

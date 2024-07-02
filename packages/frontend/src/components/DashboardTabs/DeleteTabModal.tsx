import {
    isChartTile,
    type DashboardChartTile,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    Button,
    Group,
    List,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../common/MantineIcon';

type AddProps = ModalProps & {
    tab: DashboardTab;
    dashboardTiles: DashboardTile[] | undefined;
    onDeleteTab: (tabUuid: string) => void;
};

export const TabDeleteModal: FC<AddProps> = ({
    tab,
    dashboardTiles,
    onClose,
    onDeleteTab: handleDeleteTab,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const handleClose = () => {
        onClose?.();
    };

    const handleSubmit = (uuid: string) => {
        handleClose();
        handleDeleteTab(uuid);
    };

    const isNewSavedChart = (tile: DashboardTile) => {
        return isChartTile(tile) && tile.properties.belongsToDashboard;
    };

    const tilesToDelete = useMemo(
        () => (dashboardTiles || []).filter((tile) => tile.tabUuid == tab.uuid),
        [tab.uuid, dashboardTiles],
    );

    const newSavedCharts = useMemo(
        () => tilesToDelete.filter(isNewSavedChart) as DashboardChartTile[],
        [tilesToDelete],
    );

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} color="red" size="lg" />
                    <Title order={4}>
                        {t('components_dashboard_tabs.delete_tab_modal.title')}
                    </Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    {t(
                        'components_dashboard_tabs.delete_tab_modal.content.part_1',
                    )}{' '}
                    <b>"{tab.name}"</b>{' '}
                    {t(
                        'components_dashboard_tabs.delete_tab_modal.content.part_2',
                    )}{' '}
                    <b>{tilesToDelete?.length}</b>{' '}
                    {t(
                        'components_dashboard_tabs.delete_tab_modal.content.part_3',
                    )}
                    <br />
                    {newSavedCharts.length > 0 && (
                        <Text>
                            <br />
                            {t(
                                'components_dashboard_tabs.delete_tab_modal.content.part_4',
                            )}
                        </Text>
                    )}
                </Text>
                <List>
                    {newSavedCharts.map((tile) => (
                        <List.Item key={tile.uuid}>
                            <Text>{tile.properties.chartName}</Text>
                        </List.Item>
                    ))}
                </List>
                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        {t('components_dashboard_tabs.delete_tab_modal.cancel')}
                    </Button>

                    <Button
                        type="submit"
                        color="red"
                        onClick={() => handleSubmit(tab.uuid)}
                    >
                        {t('components_dashboard_tabs.delete_tab_modal.remove')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

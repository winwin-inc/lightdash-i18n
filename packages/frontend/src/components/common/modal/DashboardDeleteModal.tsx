import {
    hasChartsInDashboard,
    isDashboardChartTileType,
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
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useDashboardDeleteMutation,
    useDashboardQuery,
} from '../../../hooks/dashboard/useDashboard';
import MantineIcon from '../MantineIcon';

interface DashboardDeleteModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

const DashboardDeleteModal: FC<DashboardDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();
    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);
    const { mutateAsync: deleteDashboard, isLoading: isDeleting } =
        useDashboardDeleteMutation();

    if (isInitialLoading || !dashboard) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteDashboard(uuid);
        onConfirm?.();
    };

    const chartsInDashboardTiles = dashboard.tiles.filter(
        (tile) =>
            isDashboardChartTileType(tile) &&
            tile.properties.belongsToDashboard,
    );

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} color="red" size="lg" />
                    <Title order={4}>
                        {t(
                            'components_common_modal_dashboard_delete.delete_dashboard',
                        )}
                    </Title>
                </Group>
            }
            {...modalProps}
        >
            <Stack>
                {hasChartsInDashboard(dashboard) ? (
                    <Stack>
                        <Text>
                            {t(
                                'components_common_modal_dashboard_delete.has_charts.part_1',
                            )}
                            <b>"{dashboard.name}"</b>?
                        </Text>
                        <Text>
                            {t(
                                'components_common_modal_dashboard_delete.has_charts.part_2',
                            )}
                        </Text>
                        <List size="sm">
                            {chartsInDashboardTiles.map(
                                (tile) =>
                                    isDashboardChartTileType(tile) && (
                                        <List.Item key={tile.uuid}>
                                            <Text>
                                                {tile.properties.chartName}
                                            </Text>
                                        </List.Item>
                                    ),
                            )}
                        </List>
                    </Stack>
                ) : (
                    <Text>
                        {t(
                            'components_common_modal_dashboard_delete.no_charts',
                        )}{' '}
                        <b>"{dashboard.name}"</b>?
                    </Text>
                )}

                <Group position="right" spacing="xs">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={modalProps.onClose}
                    >
                        {t('components_common_modal_dashboard_delete.cancel')}
                    </Button>

                    <Button
                        color="red"
                        loading={isDeleting}
                        onClick={handleConfirm}
                        type="submit"
                    >
                        {t('components_common_modal_dashboard_delete.delete')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default DashboardDeleteModal;

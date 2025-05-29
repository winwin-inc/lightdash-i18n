import {
    isDashboardChartTileType,
    type DashboardChartTile,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    Button,
    Group,
    List,
    Modal,
    Radio,
    Select,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';

type AddProps = ModalProps & {
    tab: DashboardTab;
    dashboardTiles: DashboardTile[] | undefined;
    dashboardTabs: DashboardTab[] | undefined;
    onDeleteTab: (tabUuid: string) => void;
    onMoveTile: (tile: DashboardTile) => void;
};

enum RemoveActions {
    MOVE = 'move',
    DELETE = 'delete',
}

export const TabDeleteModal: FC<AddProps> = ({
    tab,
    dashboardTiles,
    dashboardTabs,
    onClose: handleClose,
    onDeleteTab: handleDeleteTab,
    onMoveTile: handleMoveTile,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const [removeAction, setRemoveAction] = useState(RemoveActions.MOVE);
    const [destinationTabId, setDestinationTabId] = useState<
        string | undefined
    >();

    const destinationTabs = useMemo(
        () =>
            dashboardTabs?.filter((otherTab) => otherTab.uuid !== tab.uuid) ||
            [],
        [dashboardTabs, tab.uuid],
    );

    useEffect(() => {
        if (modalProps.opened) {
            setRemoveAction(RemoveActions.MOVE);
            const destinationTab =
                destinationTabs.length === 1
                    ? destinationTabs[0].uuid
                    : undefined;
            setDestinationTabId(destinationTab);
        }
    }, [modalProps.opened, destinationTabs]);

    const { showToastSuccess } = useToaster();

    const isNewSavedChart = (tile: DashboardTile) => {
        return (
            isDashboardChartTileType(tile) && tile.properties.belongsToDashboard
        );
    };

    const tilesToRemove = useMemo(
        () => (dashboardTiles || []).filter((tile) => tile.tabUuid == tab.uuid),
        [tab.uuid, dashboardTiles],
    );

    const pluralTiles = tilesToRemove.length === 1 ? '' : 's';
    const newSavedCharts = useMemo(
        () => tilesToRemove.filter(isNewSavedChart) as DashboardChartTile[],
        [tilesToRemove],
    );

    const handleSubmit = useCallback(() => {
        handleClose();
        const numTiles = tilesToRemove.length || 0;
        let toastMessage = '';
        if (removeAction === RemoveActions.MOVE) {
            tilesToRemove.forEach((tile) => {
                handleMoveTile({
                    ...tile,
                    x: 0,
                    y: 0,
                    tabUuid: destinationTabId,
                });
            });
            toastMessage =
                pluralTiles === 's'
                    ? t(
                          'components_dashboard_tabs.delete_tab_modal.toast.move.part_1',
                          {
                              tabName: tab.name,
                              numTiles,
                          },
                      )
                    : t(
                          'components_dashboard_tabs.delete_tab_modal.toast.move_part_2',
                          {
                              tabName: tab.name,
                              numTiles,
                          },
                      );
        } else {
            toastMessage =
                pluralTiles === 's'
                    ? t(
                          'components_dashboard_tabs.delete_tab_modal.toast.remove.part_1',
                          {
                              tabName: tab.name,
                              numTiles,
                          },
                      )
                    : t(
                          'components_dashboard_tabs.delete_tab_modal.toast.remove.part_1',
                          {
                              tabName: tab.name,
                              numTiles,
                          },
                      );
        }
        handleDeleteTab(tab.uuid);
        showToastSuccess({ title: toastMessage });
    }, [
        handleClose,
        tilesToRemove,
        removeAction,
        handleDeleteTab,
        tab.uuid,
        tab.name,
        showToastSuccess,
        pluralTiles,
        handleMoveTile,
        destinationTabId,
        t,
    ]);

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
            onClose={handleClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    {t('components_dashboard_tabs.delete_tab_modal.tabs.title')}
                </Text>
                <Radio.Group
                    size="xs"
                    value={removeAction}
                    onChange={(val: RemoveActions) => setRemoveAction(val)}
                >
                    <Stack spacing="xs" mt={0}>
                        <Radio
                            label={t(
                                'components_dashboard_tabs.delete_tab_modal.tabs.delete',
                            )}
                            value={RemoveActions.DELETE}
                            styles={(theme) => ({
                                label: {
                                    paddingLeft: theme.spacing.xs,
                                },
                            })}
                        />
                        <Radio
                            label={t(
                                'components_dashboard_tabs.delete_tab_modal.tabs.transfer',
                            )}
                            value={RemoveActions.MOVE}
                            styles={(theme) => ({
                                label: {
                                    paddingLeft: theme.spacing.xs,
                                },
                            })}
                        />
                        {dashboardTabs?.length &&
                            removeAction === RemoveActions.MOVE && (
                                <Select
                                    placeholder={t(
                                        'components_dashboard_tabs.delete_tab_modal.tabs.pick_tab',
                                    )}
                                    value={destinationTabId}
                                    onChange={(value) =>
                                        setDestinationTabId(value || undefined)
                                    }
                                    data={destinationTabs.map((otherTab) => ({
                                        value: otherTab.uuid,
                                        label: otherTab.name,
                                    }))}
                                    withinPortal
                                    styles={(theme) => ({
                                        root: {
                                            paddingLeft: theme.spacing.xl,
                                        },
                                    })}
                                />
                            )}
                    </Stack>
                </Radio.Group>

                {removeAction === RemoveActions.DELETE && (
                    <>
                        <Text>
                            {t(
                                'components_dashboard_tabs.delete_tab_modal.content.part_1',
                            )}{' '}
                            <b>"{tab.name}"</b>{' '}
                            {t(
                                'components_dashboard_tabs.delete_tab_modal.content.part_2',
                            )}{' '}
                            <b>{tilesToRemove?.length}</b>{' '}
                            {pluralTiles === 's'
                                ? t(
                                      'components_dashboard_tabs.delete_tab_modal.content.part_3',
                                  )
                                : t(
                                      'components_dashboard_tabs.delete_tab_modal.content.part_4',
                                  )}
                        </Text>
                        {newSavedCharts.length > 0 && (
                            <Group spacing="xs">
                                <Text>
                                    {t(
                                        'components_dashboard_tabs.delete_tab_modal.content.part_5',
                                    )}
                                    {newSavedCharts.length === 1
                                        ? ` ${t(
                                              'components_dashboard_tabs.delete_tab_modal.content.part_6',
                                          )}} `
                                        : ` ${t(
                                              'components_dashboard_tabs.delete_tab_modal.content.part_7',
                                          )}} `}
                                    {t(
                                        'components_dashboard_tabs.delete_tab_modal.content.part_8',
                                    )}
                                </Text>
                                <List size="sm" pr={20}>
                                    {newSavedCharts.map((tile) => (
                                        <List.Item key={tile.uuid}>
                                            <Text>
                                                {tile.properties.chartName}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                            </Group>
                        )}
                    </>
                )}

                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        {t('components_dashboard_tabs.delete_tab_modal.cancel')}
                    </Button>

                    <Button
                        type="submit"
                        color={
                            removeAction === RemoveActions.DELETE
                                ? 'red'
                                : 'unset'
                        }
                        disabled={
                            removeAction === RemoveActions.MOVE &&
                            !destinationTabId
                        }
                        onClick={handleSubmit}
                    >
                        {removeAction === RemoveActions.MOVE
                            ? t(
                                  'components_dashboard_tabs.delete_tab_modal.transfer',
                              )
                            : t(
                                  'components_dashboard_tabs.delete_tab_modal.delete',
                              )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

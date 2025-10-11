import {
    isDashboardChartTileType,
    isDashboardScheduler,
    type DashboardChartTile,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    Alert,
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
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useDashboardSchedulers } from '../../features/scheduler/hooks/useDashboardSchedulers';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';

type AddProps = ModalProps & {
    tab: DashboardTab;
    dashboardTiles: DashboardTile[] | undefined;
    dashboardTabs: DashboardTab[] | undefined;
    dashboardUuid: string;
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
    dashboardUuid,
    onClose: handleClose,
    onDeleteTab: handleDeleteTab,
    onMoveTile: handleMoveTile,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const [removeAction, setRemoveAction] = useState('move');
    const [destinationTabId, setDestinationTabId] = useState<
        string | undefined
    >();

    // Fetch schedulers for this dashboard
    const { data: schedulers } = useDashboardSchedulers(dashboardUuid);

    // Find schedulers that use this tab
    const affectedSchedulers = useMemo(() => {
        if (!schedulers) return [];

        return schedulers.filter((scheduler) => {
            if (isDashboardScheduler(scheduler) && scheduler.selectedTabs) {
                return scheduler.selectedTabs.includes(tab.uuid);
            }
            return false;
        });
    }, [schedulers, tab.uuid]);

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
            toastMessage = pluralTiles
                ? t(
                      'components_dashboard_tabs.delete_tab_modal.toast.move.part_1',
                      {
                          tabName: tab.name,
                          numTiles,
                      },
                  )
                : t(
                      'components_dashboard_tabs.delete_tab_modal.toast.move.part_2',
                      {
                          tabName: tab.name,
                          numTiles,
                      },
                  );
        } else {
            toastMessage = t(
                'components_dashboard_tabs.delete_tab_modal.toast.remove.part_1',
                {
                    tabName: tab.name,
                    numTiles,
                    pluralTiles,
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

                {affectedSchedulers.length > 0 && (
                    <Alert
                        color="orange"
                        icon={<IconAlertCircle size={16} />}
                        title={t(
                            'components_dashboard_tabs.delete_tab_modal.schedulers_affected.title',
                        )}
                    >
                        <Stack spacing="xs">
                            <Text size="sm">
                                {t(
                                    'components_dashboard_tabs.delete_tab_modal.schedulers_affected.part_1',
                                )}{' '}
                                <Text fw={600} span>
                                    {affectedSchedulers.length}
                                </Text>{' '}
                                {t(
                                    'components_dashboard_tabs.delete_tab_modal.schedulers_affected.part_2',
                                )}{' '}
                                {affectedSchedulers.length === 1
                                    ? t(
                                          'components_dashboard_tabs.delete_tab_modal.schedulers_affected.part_3',
                                      )
                                    : t(
                                          'components_dashboard_tabs.delete_tab_modal.schedulers_affected.part_4',
                                      )}
                                {t(
                                    'components_dashboard_tabs.delete_tab_modal.schedulers_affected.part_5',
                                )}
                            </Text>
                            <List size="sm">
                                {affectedSchedulers.map((scheduler) => (
                                    <List.Item key={scheduler.schedulerUuid}>
                                        <Text size="sm">{scheduler.name}</Text>
                                    </List.Item>
                                ))}
                            </List>
                        </Stack>
                    </Alert>
                )}

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
                            {pluralTiles
                                ? t(
                                      'components_dashboard_tabs.delete_tab_modal.content.part_3',
                                  )
                                : t(
                                      'components_dashboard_tabs.delete_tab_modal.content.part_4',
                                  )}
                            ?
                        </Text>
                        {newSavedCharts.length > 0 && (
                            <Group spacing="xs">
                                <Text>
                                    {t(
                                        'components_dashboard_tabs.delete_tab_modal.content.part_5',
                                    )}{' '}
                                    {newSavedCharts.length === 1
                                        ? t(
                                              'components_dashboard_tabs.delete_tab_modal.content.part_6',
                                          )
                                        : t(
                                              'components_dashboard_tabs.delete_tab_modal.content.part_7',
                                          )}
                                    {t(
                                        'components_dashboard_tabs.delete_tab_modal.content.part_8',
                                    )}
                                    :
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

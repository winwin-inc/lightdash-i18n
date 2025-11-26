import {
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { Button, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';

type Props = {
    filterScope: 'global' | 'tab';
    isEditMode: boolean;
    isFilterEnabled: boolean;
    showAddFilterButton: boolean;
    openPopoverId: string | undefined;
    activeTabUuid: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onSave: (value: DashboardFilterRule) => void;
};

const AddFilterButton: FC<Props> = ({
    filterScope,
    isEditMode,
    isFilterEnabled,
    showAddFilterButton,
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
    onSave,
}) => {
    const { t } = useTranslation();

    const popoverId = useId();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const disabled = useMemo(() => {
        return (
            !isFilterEnabled ||
            (!allFilterableFields &&
                Object.keys(sqlChartTilesMetadata).length === 0)
        );
    }, [isFilterEnabled, allFilterableFields, sqlChartTilesMetadata]);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handleSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            onSave(newRule);
            handleClose();
        },
        [onSave, handleClose],
    );

    const buttonText =
        filterScope === 'global'
            ? t(
                  'components_dashboard_filter.filter.tooltip_creating_new.content.add_global_filter',
              )
            : t(
                  'components_dashboard_filter.filter.tooltip_creating_new.content.add_tab_filter',
              );

    const appliedDashboardTabs = useMemo(() => {
        if (filterScope === 'global') {
            return dashboardTabs;
        }
        return dashboardTabs?.filter((tab) => tab.uuid === activeTabUuid);
    }, [dashboardTabs, activeTabUuid, filterScope]);

    const appliedDashboardTiles = useMemo(() => {
        if (filterScope === 'global') {
            return dashboardTiles;
        }
        return dashboardTiles?.filter((tile) => tile.tabUuid === activeTabUuid);
    }, [dashboardTiles, activeTabUuid, filterScope]);

    const appliedFilterableFieldsByTileUuid = useMemo(() => {
        if (filterScope === 'global') {
            return filterableFieldsByTileUuid;
        }
        return Object.keys(filterableFieldsByTileUuid ?? {}).reduce(
            (acc, tileUuid) => {
                const tile = appliedDashboardTiles?.find(
                    (item) => item.uuid === tileUuid,
                );

                if (tile) {
                    acc[tileUuid] =
                        filterableFieldsByTileUuid?.[tileUuid] || [];
                }

                return acc;
            },
            {} as Record<string, FilterableDimension[]>,
        );
    }, [filterableFieldsByTileUuid, appliedDashboardTiles, filterScope]);

    // view mode
    if (!isEditMode && !showAddFilterButton) return null;

    // edit mode
    if (!isFilterEnabled) return null;

    return (
        <>
            <Popover
                position="bottom-start"
                trapFocus
                opened={isPopoverOpen}
                closeOnEscape={!isSubPopoverOpen}
                closeOnClickOutside={!isSubPopoverOpen}
                onClose={handleClose}
                disabled={disabled}
                transitionProps={{ transition: 'pop-top-left' }}
                withArrow
                shadow="md"
                offset={1}
                arrowOffset={14}
                withinPortal
            >
                <Popover.Target>
                    <Tooltip
                        disabled={isPopoverOpen || isEditMode}
                        position="top-start"
                        withinPortal
                        offset={0}
                        arrowOffset={16}
                        label={
                            <Text fz="xs">
                                {t(
                                    'components_dashboard_filter.filter.tooltip_creating_new.label.part_1',
                                )}
                                <Text span fw={600}>
                                    {t(
                                        'components_dashboard_filter.filter.tooltip_creating_new.label.part_2',
                                    )}
                                </Text>{' '}
                                {t(
                                    'components_dashboard_filter.filter.tooltip_creating_new.label.part_3',
                                )}
                            </Text>
                        }
                    >
                        <Button
                            size="xs"
                            variant="default"
                            radius="md"
                            leftIcon={
                                <MantineIcon color="blue" icon={IconFilter} />
                            }
                            disabled={disabled}
                            loading={
                                isLoadingDashboardFilters ||
                                isFetchingDashboardFilters
                            }
                            onClick={() =>
                                isPopoverOpen
                                    ? handleClose()
                                    : onPopoverOpen(popoverId)
                            }
                        >
                            {buttonText}
                        </Button>
                    </Tooltip>
                </Popover.Target>

                <Popover.Dropdown>
                    {appliedDashboardTiles && (
                        <FilterConfiguration
                            isCreatingNew={true}
                            isEditMode={isEditMode}
                            fields={allFilterableFields || []}
                            tiles={appliedDashboardTiles}
                            tabs={appliedDashboardTabs}
                            activeTabUuid={activeTabUuid}
                            availableTileFilters={
                                appliedFilterableFieldsByTileUuid ?? {}
                            }
                            onSave={handleSaveChanges}
                            popoverProps={{
                                onOpen: openSubPopover,
                                onClose: closeSubPopover,
                            }}
                            filterScope={filterScope}
                            tabUuid={filterScope === 'tab' ? activeTabUuid : undefined}
                        />
                    )}
                </Popover.Dropdown>
            </Popover>
        </>
    );
};

export default AddFilterButton;

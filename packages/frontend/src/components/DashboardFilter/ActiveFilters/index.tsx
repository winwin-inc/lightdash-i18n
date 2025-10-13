import {
    DndContext,
    DragOverlay,
    MouseSensor,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    getTabUuidsForFilterRules,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import {
    Button,
    Group,
    Skeleton,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../../common/MantineIcon';
import InvalidFilter from '../InvalidFilter';
import Filter from './Filter';

interface ActiveFiltersProps {
    isEditMode: boolean;
    isFilterEnabled: boolean;
    activeTabUuid: string | undefined;
    openPopoverId: string | undefined;
    filterType: 'global' | 'tab';
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onResetDashboardFilters: () => void;
}

const DraggableItem: FC<{
    id: string;
    children: ReactNode;
    disabled?: boolean;
}> = ({ id, children, disabled }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        disabled,
    });

    const style = transform
        ? ({
              position: 'relative',
              zIndex: 1,
              transform: `translate(${transform.x}px, ${transform.y}px)`,
              opacity: 0.8,
          } as const)
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </div>
    );
};

const DroppableArea: FC<{
    id: string;
    children: ReactNode;
    filterType: 'global' | 'tab';
    activeTabUuid: string | undefined;
}> = ({ filterType, activeTabUuid, id, children }) => {
    const { active, isOver, over, setNodeRef } = useDroppable({ id });
    const { colors } = useMantineTheme();

    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const tabFilters = useDashboardContext((c) => c.tabFilters);

    const appliedFilters =
        filterType === 'global'
            ? dashboardFilters
            : tabFilters[activeTabUuid || ''];

    const placeholderStyle = useMemo(() => {
        if (isOver && active && over && active.id !== over.id) {
            const oldIndex = appliedFilters.dimensions.findIndex(
                (item) => item.id === active.id,
            );
            const newIndex = appliedFilters.dimensions.findIndex(
                (item) => item.id === over.id,
            );
            if (newIndex < oldIndex) {
                return { boxShadow: `-8px 0px ${colors.blue[4]}` };
            } else if (newIndex > oldIndex) {
                return { boxShadow: `8px 0px ${colors.blue[4]}` };
            }
        }
    }, [isOver, active, over, appliedFilters.dimensions, colors]);

    return (
        <div ref={setNodeRef} style={placeholderStyle}>
            {children}
        </div>
    );
};

const ActiveFilters: FC<ActiveFiltersProps> = ({
    filterType,
    isEditMode,
    isFilterEnabled,
    activeTabUuid,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    onResetDashboardFilters,
}) => {
    const { t } = useTranslation();

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );

    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const haveFiltersChanged = useDashboardContext(
        (c) =>
            c.haveFiltersChanged ||
            c.dashboardTemporaryFilters.dimensions.length > 0,
    );

    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: { distance: 10 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 250, tolerance: 5 },
    });
    const dragSensors = useSensors(mouseSensor, touchSensor);

    const sortedTabUuids = useMemo(() => {
        const sortedTabs = dashboardTabs?.sort((a, b) => a.order - b.order);
        return sortedTabs?.map((tab) => tab.uuid) || [];
    }, [dashboardTabs]);

    // global filters
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const removeDimensionDashboardFilter = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );

    // tab filters
    const tabFilters = useDashboardContext((c) => c.tabFilters);
    const tabTemporaryFilters = useDashboardContext(
        (c) => c.tabTemporaryFilters,
    );
    const removeTabDimensionFilter = useDashboardContext(
        (c) => c.removeTabDimensionFilter,
    );
    const updateTabDimensionFilter = useDashboardContext(
        (c) => c.updateTabDimensionFilter,
    );
    const setTabFilters = useDashboardContext((c) => c.setTabFilters);
    const setHaveTabFiltersChanged = useDashboardContext(
        (c) => c.setHaveTabFiltersChanged,
    );

    const haveTabFiltersChanged = useDashboardContext(
        (c) =>
            c.haveTabFiltersChanged[activeTabUuid || ''] ||
            c.tabTemporaryFilters[activeTabUuid || '']?.dimensions.length > 0,
    );

    // applied variables
    const appliedFilters = useMemo(() => {
        if (filterType === 'global') {
            return dashboardFilters;
        }
        return tabFilters[activeTabUuid || ''];
    }, [filterType, activeTabUuid, dashboardFilters, tabFilters]);

    const appliedTemporaryFilters = useMemo(() => {
        if (filterType === 'global') {
            return dashboardTemporaryFilters;
        }
        return tabTemporaryFilters[activeTabUuid || ''];
    }, [
        filterType,
        activeTabUuid,
        dashboardTemporaryFilters,
        tabTemporaryFilters,
    ]);

    const appliedFiltersChanged = useMemo(() => {
        if (filterType === 'global') {
            return haveFiltersChanged;
        }
        return haveTabFiltersChanged || false;
    }, [filterType, haveFiltersChanged, haveTabFiltersChanged]);

    const appliedRemoveDimensionFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            if (filterType === 'global') {
                removeDimensionDashboardFilter(index, isTemporary);
            } else {
                removeTabDimensionFilter(
                    activeTabUuid || '',
                    index,
                    isTemporary,
                );
            }
        },
        [
            filterType,
            removeDimensionDashboardFilter,
            removeTabDimensionFilter,
            activeTabUuid,
        ],
    );

    const appliedUpdateDimensionFilter = useCallback(
        (value: DashboardFilterRule, index: number, isTemporary: boolean) => {
            if (filterType === 'global') {
                updateDimensionDashboardFilter(
                    value,
                    index,
                    isTemporary,
                    isEditMode,
                );
            } else {
                updateTabDimensionFilter(
                    activeTabUuid || '',
                    value,
                    index,
                    isTemporary,
                );
            }
        },
        [
            filterType,
            updateDimensionDashboardFilter,
            updateTabDimensionFilter,
            activeTabUuid,
            isEditMode,
        ],
    );

    const appliedChangeFilters = useCallback(
        (filters: DashboardFilters) => {
            if (filterType === 'global') {
                setDashboardFilters(filters);
            } else {
                setTabFilters({
                    ...tabFilters,
                    [activeTabUuid || '']: filters,
                });
            }
        },
        [
            filterType,
            setDashboardFilters,
            setTabFilters,
            activeTabUuid,
            tabFilters,
        ],
    );

    const appliedFilterChanged = useCallback(
        (isTemporary: boolean) => {
            if (filterType === 'global') {
                setHaveFiltersChanged(isTemporary);
            } else {
                setHaveTabFiltersChanged((prev) => ({
                    ...prev,
                    [activeTabUuid || '']: isTemporary,
                }));
            }
        },
        [
            filterType,
            setHaveFiltersChanged,
            setHaveTabFiltersChanged,
            activeTabUuid,
        ],
    );

    const getTabsUsingFilter = useCallback(
        (filterId: string) => {
            const tabsForFilterMap = getTabUuidsForFilterRules(
                dashboardTiles,
                appliedFilters,
                filterableFieldsByTileUuid,
            );
            return sortedTabUuids.filter(
                (tabUuid: string) =>
                    tabsForFilterMap[filterId]?.includes(tabUuid) ?? false,
            );
        },
        [
            dashboardTiles,
            appliedFilters,
            filterableFieldsByTileUuid,
            sortedTabUuids,
        ],
    );

    const getTabsUsingTemporaryFilter = useCallback(
        (filterId: string) => {
            const tabsForFilterMap = getTabUuidsForFilterRules(
                dashboardTiles,
                appliedTemporaryFilters,
                filterableFieldsByTileUuid,
            );
            return sortedTabUuids.filter(
                (tabUuid: string) =>
                    tabsForFilterMap[filterId]?.includes(tabUuid) ?? false,
            );
        },
        [
            dashboardTiles,
            appliedTemporaryFilters,
            filterableFieldsByTileUuid,
            sortedTabUuids,
        ],
    );

    if (isLoadingDashboardFilters || isFetchingDashboardFilters) {
        return (
            <Group spacing="xs" ml="xs">
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
            </Group>
        );
    }

    if (!allFilterableFieldsMap) return null;

    const handleDragStart = (_event: DragStartEvent) => onPopoverClose();

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!active || !over || active.id === over.id) return;
        const oldIndex = appliedFilters.dimensions.findIndex(
            (item) => item.id === active.id,
        );
        const newIndex = appliedFilters.dimensions.findIndex(
            (item) => item.id === over.id,
        );
        const newDimensions = arrayMove(
            appliedFilters.dimensions,
            oldIndex,
            newIndex,
        );
        appliedChangeFilters({
            ...appliedFilters,
            dimensions: newDimensions,
        });
        appliedFilterChanged(true);
    };

    if (!isFilterEnabled) return null;

    return (
        <>
            {!isEditMode && appliedFiltersChanged && (
                <Tooltip
                    label={t(
                        'components_dashboard_filter.filter_active_filters.reset_all_filters',
                    )}
                >
                    <Button
                        size="xs"
                        variant="default"
                        radius="md"
                        color="gray"
                        onClick={() => {
                            appliedFilterChanged(false);
                            onResetDashboardFilters();
                        }}
                    >
                        <MantineIcon icon={IconRotate2} />
                    </Button>
                </Tooltip>
            )}
            <DndContext
                sensors={dragSensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                {appliedFilters?.dimensions?.map((item, index) => {
                    const field = allFilterableFieldsMap[item.target.fieldId];
                    const appliesToTabs = getTabsUsingFilter(item.id);
                    return (
                        <DroppableArea
                            key={item.id}
                            id={item.id}
                            filterType={filterType}
                            activeTabUuid={activeTabUuid}
                        >
                            <DraggableItem
                                key={item.id}
                                id={item.id}
                                disabled={!isEditMode || !!openPopoverId}
                            >
                                {field || item.target.isSqlColumn ? (
                                    <Filter
                                        key={item.id}
                                        filterType={filterType}
                                        isEditMode={isEditMode}
                                        field={field}
                                        filterRule={item}
                                        activeTabUuid={activeTabUuid}
                                        appliesToTabs={appliesToTabs}
                                        openPopoverId={openPopoverId}
                                        onPopoverOpen={onPopoverOpen}
                                        onPopoverClose={onPopoverClose}
                                        onRemove={() =>
                                            appliedRemoveDimensionFilter(
                                                index,
                                                false,
                                            )
                                        }
                                        onUpdate={(value) =>
                                            appliedUpdateDimensionFilter(
                                                value,
                                                index,
                                                false,
                                            )
                                        }
                                    />
                                ) : (
                                    <InvalidFilter
                                        key={item.id}
                                        isEditMode={isEditMode}
                                        filterRule={item}
                                        onRemove={() =>
                                            appliedRemoveDimensionFilter(
                                                index,
                                                false,
                                            )
                                        }
                                    />
                                )}
                            </DraggableItem>
                        </DroppableArea>
                    );
                })}
                <DragOverlay />
            </DndContext>

            {dashboardTemporaryFilters.dimensions.map((item, index) => {
                const field = allFilterableFieldsMap[item.target.fieldId];
                const appliesToTabs = getTabsUsingTemporaryFilter(item.id);
                return field || item.target.isSqlColumn ? (
                    <Filter
                        key={item.id}
                        filterType={filterType}
                        isTemporary
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        activeTabUuid={activeTabUuid}
                        appliesToTabs={appliesToTabs}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            appliedRemoveDimensionFilter(index, true)
                        }
                        onUpdate={(value) =>
                            appliedUpdateDimensionFilter(value, index, true)
                        }
                    />
                ) : (
                    <InvalidFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            appliedRemoveDimensionFilter(index, false)
                        }
                    />
                );
            })}
        </>
    );
};

export default ActiveFilters;

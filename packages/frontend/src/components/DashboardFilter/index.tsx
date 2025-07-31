import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterableDimension,
    type FilterOperator,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { useCallback, useState, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { useProject } from '../../hooks/useProject';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import FiltersProvider from '../common/Filters/FiltersProvider';
import ActiveFilters from './ActiveFilters';
import AddFilterButton from './AddFilterButton';

interface Props {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    filterType: 'global' | 'tab';
}

const DashboardFilter: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    filterType,
}) => {
    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [openPopoverId, setPopoverId] = useState<string>();

    const project = useProject(projectUuid);

    console.log('filterType', filterType);
    console.log('activeTabUuid', activeTabUuid);

    const allFilterableFieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);

    // global filters
    const allFilters = useDashboardContext((c) => c.allFilters);
    const resetDashboardFilters = useDashboardContext((c) => c.resetDashboardFilters);
    const addDimensionDashboardFilter = useDashboardContext((c) => c.addDimensionDashboardFilter);
    
    // tab filters
    const getMergedFiltersForTab = useDashboardContext((c) => c.getMergedFiltersForTab);
    const resetTabFilters = useDashboardContext((c) => c.resetTabFilters);
    const addTabDimensionFilter = useDashboardContext((c) => c.addTabDimensionFilter);

    // computed variables
    const filters = useMemo(() => {
        if (filterType === 'global') {
            return allFilters;
        }
        return getMergedFiltersForTab(activeTabUuid || '');
    }, [filterType, activeTabUuid, getMergedFiltersForTab, allFilters]);
    
    const tabFilters = useMemo(() => {
        if (filterType === 'tab' && activeTabUuid) {
            return getMergedFiltersForTab(activeTabUuid);
        }
        return allFilters;
    }, [filterType, activeTabUuid, getMergedFiltersForTab, allFilters]);

    const handleResetDashboardFilters = useCallback(() => {
        if (filterType === 'global') {
            resetDashboardFilters();
        } else {
            resetTabFilters(activeTabUuid || '');
        }
    }, [filterType, resetDashboardFilters, resetTabFilters, activeTabUuid]);

    const handleAddDimensionDashboardFilter = useCallback((
        filter: DashboardFilterRule<FilterOperator, DashboardFieldTarget, any, any>,
        isTemporary: boolean,
    ) => {
        if (filterType === 'global') {
            addDimensionDashboardFilter(filter, isTemporary);
        } else {
            addTabDimensionFilter(activeTabUuid || '', filter, isTemporary);
        }
    }, [filterType, addDimensionDashboardFilter, addTabDimensionFilter, activeTabUuid]);


    const handleSaveNew = useCallback(
        (
            value: DashboardFilterRule<
                FilterOperator,
                DashboardFieldTarget,
                any,
                any
            >,
        ) => {
            track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: {
                    mode: isEditMode ? 'edit' : 'viewer',
                },
            });
            handleAddDimensionDashboardFilter(value, !isEditMode);
        },
        [handleAddDimensionDashboardFilter, isEditMode, track],
    );

    const handlePopoverOpen = useCallback((id: string) => {
        setPopoverId(id);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setPopoverId(undefined);
    }, []);

    return (
        <FiltersProvider<Record<string, FilterableDimension>>
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={filters}
        >
            <Flex gap="xs" wrap="wrap" mb="xs">
                <AddFilterButton
                    filterType={filterType}
                    isEditMode={isEditMode}
                    openPopoverId={openPopoverId}
                    activeTabUuid={activeTabUuid}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onSave={handleSaveNew}
                />

                <ActiveFilters
                    filterType={filterType}
                    isEditMode={isEditMode}
                    activeTabUuid={activeTabUuid}
                    openPopoverId={openPopoverId}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onResetDashboardFilters={handleResetDashboardFilters}
                />
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;

import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterableDimension,
    type FilterOperator,
} from '@lightdash/common';
import { Checkbox, Flex } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();

    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [openPopoverId, setPopoverId] = useState<string>();

    const project = useProject(projectUuid);

    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    // filter enabled state
    const isGlobalFilterEnabled = useDashboardContext(
        (c) => c.isGlobalFilterEnabled,
    );
    const setIsGlobalFilterEnabled = useDashboardContext(
        (c) => c.setIsGlobalFilterEnabled,
    );
    const isTabFilterEnabled = useDashboardContext((c) => c.isTabFilterEnabled);
    const setIsTabFilterEnabled = useDashboardContext(
        (c) => c.setIsTabFilterEnabled,
    );

    // show add filter button state
    const showGlobalAddFilterButton = useDashboardContext(
        (c) => c.showGlobalAddFilterButton,
    );
    const setShowGlobalAddFilterButton = useDashboardContext(
        (c) => c.setShowGlobalAddFilterButton,
    );
    const showTabAddFilterButton = useDashboardContext(
        (c) => c.showTabAddFilterButton,
    );
    const setShowTabAddFilterButton = useDashboardContext(
        (c) => c.setShowTabAddFilterButton,
    );

    // use the appropriate filter enabled state based on filterType
    const isFilterEnabled =
        filterType === 'global'
            ? isGlobalFilterEnabled
            : isTabFilterEnabled[activeTabUuid || ''] ?? true;
    const setIsFilterEnabled =
        filterType === 'global'
            ? setIsGlobalFilterEnabled
            : (enabled: boolean) => {
                  if (activeTabUuid) {
                      setIsTabFilterEnabled((prev) => ({
                          ...prev,
                          [activeTabUuid]: enabled,
                      }));
                  }
              };

    // use the appropriate show add filter button state based on filterType
    const showAddFilterButton =
        filterType === 'global'
            ? showGlobalAddFilterButton
            : showTabAddFilterButton[activeTabUuid || ''] ?? false;
    const setShowAddFilterButton =
        filterType === 'global'
            ? setShowGlobalAddFilterButton
            : (enabled: boolean) => {
                  if (activeTabUuid) {
                      setShowTabAddFilterButton((prev: any) => ({
                          ...prev,
                          [activeTabUuid]: enabled,
                      }));
                  }
              };

    // all filters
    const allFilters = useDashboardContext((c) => c.allFilters);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );

    // tab filters
    const getMergedFiltersForTab = useDashboardContext(
        (c) => c.getMergedFiltersForTab,
    );
    const resetTabFilters = useDashboardContext((c) => c.resetTabFilters);
    const addTabDimensionFilter = useDashboardContext(
        (c) => c.addTabDimensionFilter,
    );

    // apply filters
    const appliedFilters = useMemo(() => {
        if (filterType === 'global') {
            return allFilters;
        }
        return getMergedFiltersForTab(activeTabUuid || '');
    }, [filterType, activeTabUuid, getMergedFiltersForTab, allFilters]);
    const appliedResetDashboardFilters = useCallback(() => {
        if (filterType === 'global') {
            resetDashboardFilters();
        } else {
            resetTabFilters(activeTabUuid || '');
        }
    }, [filterType, resetDashboardFilters, resetTabFilters, activeTabUuid]);

    const appliedAddDimensionDashboardFilter = useCallback(
        (
            filter: DashboardFilterRule<
                FilterOperator,
                DashboardFieldTarget,
                any,
                any
            >,
            isTemporary: boolean,
        ) => {
            if (filterType === 'global') {
                addDimensionDashboardFilter(filter, isTemporary);
            } else {
                addTabDimensionFilter(activeTabUuid || '', filter, isTemporary);
            }
        },
        [
            filterType,
            addDimensionDashboardFilter,
            addTabDimensionFilter,
            activeTabUuid,
        ],
    );

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
            appliedAddDimensionDashboardFilter(value, !isEditMode);
        },
        [appliedAddDimensionDashboardFilter, isEditMode, track],
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
            dashboardFilters={appliedFilters}
        >
            <Flex gap="xs" wrap="wrap" mb="xs" align="center">
                <AddFilterButton
                    filterType={filterType}
                    isEditMode={isEditMode}
                    isFilterEnabled={isFilterEnabled}
                    showAddFilterButton={showAddFilterButton}
                    openPopoverId={openPopoverId}
                    activeTabUuid={activeTabUuid}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onSave={handleSaveNew}
                />

                <ActiveFilters
                    filterType={filterType}
                    isEditMode={isEditMode}
                    isFilterEnabled={isFilterEnabled}
                    activeTabUuid={activeTabUuid}
                    openPopoverId={openPopoverId}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onResetDashboardFilters={appliedResetDashboardFilters}
                />

                {isEditMode && (
                    <>
                        <Checkbox
                            checked={isFilterEnabled}
                            onChange={(event) =>
                                setIsFilterEnabled(event.currentTarget.checked)
                            }
                            size="sm"
                            ml={
                                filterType === 'global'
                                    ? isFilterEnabled
                                        ? 'xl'
                                        : 'none'
                                    : isFilterEnabled
                                    ? 'xl'
                                    : 'xs'
                            }
                            styles={{
                                input: { cursor: 'pointer' },
                                root: { display: 'flex', alignItems: 'center' },
                            }}
                            label={t(
                                'components_dashboard_filter.enable_filter',
                            )}
                        />
                        {isFilterEnabled && (
                            <Checkbox
                                checked={showAddFilterButton}
                                onChange={(event) =>
                                    setShowAddFilterButton(
                                        event.currentTarget.checked,
                                    )
                                }
                                size="sm"
                                ml={'md'}
                                styles={{
                                    input: { cursor: 'pointer' },
                                    root: {
                                        display: 'flex',
                                        alignItems: 'center',
                                    },
                                }}
                                label={t(
                                    'components_dashboard_filter.show_add_filter_button',
                                )}
                            />
                        )}
                    </>
                )}
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;

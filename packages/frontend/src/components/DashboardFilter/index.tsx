import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type FilterOperator,
} from '@lightdash/common';
import { Button, Checkbox, Flex } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import {
    enqueueAddFilterButtonVisibilityChanged,
    enqueueFilterBarVisibilityChanged,
} from '../../hooks/dashboard/dashboardOperationEventQueue';
import { useVisibleDashboardFilters } from '../../hooks/dashboard/useVisibleDashboardFilters';
import { useProject } from '../../hooks/useProject';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import FiltersProvider from '../common/Filters/FiltersProvider';
import ActiveFilters from './ActiveFilters';
import AddFilterButton from './AddFilterButton';
import BatchBindModal from './BatchBindModal';

interface Props {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    filterScope: 'global' | 'tab';
}

const DashboardFilter: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    filterScope,
}) => {
    const { t } = useTranslation();

    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [openPopoverId, setPopoverId] = useState<string>();
    const [batchBindModalOpened, setBatchBindModalOpened] = useState(false);

    const project = useProject(projectUuid);

    const dashboard = useDashboardContext((c) => c.dashboard);
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
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    // use the appropriate filter enabled state based on filterScope
    const isFilterEnabled =
        filterScope === 'global'
            ? isGlobalFilterEnabled
            : isTabFilterEnabled[activeTabUuid || ''] ?? true;
    const setIsFilterEnabled =
        filterScope === 'global'
            ? setIsGlobalFilterEnabled
            : (enabled: boolean) => {
                  if (activeTabUuid) {
                      setIsTabFilterEnabled((prev) => ({
                          ...prev,
                          [activeTabUuid]: enabled,
                      }));
                  }
              };

    // use the appropriate show add filter button state based on filterScope
    const showAddFilterButton =
        filterScope === 'global'
            ? showGlobalAddFilterButton
            : showTabAddFilterButton[activeTabUuid || ''] ?? false;
    const setShowAddFilterButton =
        filterScope === 'global'
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
    // 作者保存的全局筛选器（不含临时筛选器）：批量绑定的父级候选只能是它们
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );

    // tab filters
    const getDisplayedMergedFiltersForTab = useDashboardContext(
        (c) => c.getDisplayedMergedFiltersForTab,
    );
    const resetTabFilters = useDashboardContext((c) => c.resetTabFilters);
    const addTabDimensionFilter = useDashboardContext(
        (c) => c.addTabDimensionFilter,
    );

    // apply filters
    const appliedFilters = useMemo(() => {
        if (filterScope === 'global') {
            return allFilters;
        }
        return getDisplayedMergedFiltersForTab(activeTabUuid || '');
    }, [
        filterScope,
        activeTabUuid,
        getDisplayedMergedFiltersForTab,
        allFilters,
    ]);
    const appliedResetDashboardFilters = useCallback(() => {
        if (filterScope === 'global') {
            resetDashboardFilters();
        } else {
            resetTabFilters(activeTabUuid || '');
        }
    }, [filterScope, resetDashboardFilters, resetTabFilters, activeTabUuid]);

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
            if (filterScope === 'global') {
                addDimensionDashboardFilter(filter, isTemporary);
            } else {
                addTabDimensionFilter(activeTabUuid || '', filter, isTemporary);
            }
        },
        [
            filterScope,
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

    // 批量绑定相关
    const tabFilters = useDashboardContext((c) => c.tabFilters);
    const updateTabDimensionFilter = useDashboardContext(
        (c) => c.updateTabDimensionFilter,
    );

    const currentFilters = useMemo(() => {
        if (filterScope === 'global') {
            return allFilters?.dimensions || [];
        }
        return tabFilters?.[activeTabUuid || '']?.dimensions || [];
    }, [filterScope, allFilters, tabFilters, activeTabUuid]);

    // 全局筛选器：Tab 筛选器可以绑定全局父级（全局二级 → Tab 三级 → Tab 四级）。
    // 用永久筛选器（dashboardFilters）而不是 allFilters：临时/交叉筛选器不写回配置，
    // 绑定到临时筛选器会在移除后断链。
    const globalFilters = useMemo(
        () => dashboardFilters?.dimensions || [],
        [dashboardFilters],
    );

    // The filter row must not take up any space when there is nothing to
    // show, otherwise it leaves a gap in the sticky stack of the dashboard.
    const { hasVisibleContent } = useVisibleDashboardFilters({
        filterScope,
        activeTabUuid,
        isEditMode,
    });

    const handleBatchBind = useCallback(
        (updatedFilters: DashboardFilterRule[]) => {
            if (filterScope !== 'tab' || !activeTabUuid) return;
            // 只写回真正变化的规则：未变化的保持原引用，避免多余的 setState /
            // 脏标记（批量绑定一次最多 4 条，但没必要整表重写）。
            //
            // 两条并发保护：
            // 1. 下标按最新 tabFilters 的 id 重新求（modal 打开期间筛选器可能被
            //    重新加载/初始化改写，闭包里的旧下标会写错位置）
            // 2. 只把批量绑定负责的 4 个字段合并到最新规则上，不整条覆盖：
            //    期间被级联改掉的取值 / 生效状态不会被旧快照写回
            const latestFilters = tabFilters?.[activeTabUuid]?.dimensions ?? [];
            updatedFilters.forEach((filter) => {
                const index = latestFilters.findIndex(
                    (latest) => latest.id === filter.id,
                );
                if (index === -1) return;

                const latest = latestFilters[index];
                const merged: DashboardFilterRule = {
                    ...latest,
                    categoryLevel: filter.categoryLevel,
                    parentFieldId: filter.parentFieldId,
                    parentScope: filter.parentScope,
                    parentTabUuid: filter.parentTabUuid,
                };
                if (
                    merged.categoryLevel === latest.categoryLevel &&
                    merged.parentFieldId === latest.parentFieldId &&
                    merged.parentScope === latest.parentScope &&
                    merged.parentTabUuid === latest.parentTabUuid
                ) {
                    return;
                }
                updateTabDimensionFilter(activeTabUuid, merged, index, false);
            });
        },
        [filterScope, activeTabUuid, tabFilters, updateTabDimensionFilter],
    );

    // 批量绑定 Modal
    const batchBindModal =
        filterScope === 'tab' ? (
            <BatchBindModal
                opened={batchBindModalOpened}
                onClose={() => setBatchBindModalOpened(false)}
                filters={currentFilters}
                onApply={handleBatchBind}
                globalFilters={globalFilters}
                tabUuid={activeTabUuid}
            />
        ) : null;

    // Nothing to show: the row is not rendered at all, so it doesn't take up
    // any space in the sticky stack of the dashboard.
    if (!hasVisibleContent) {
        return (
            <FiltersProvider<Record<string, DashboardFilterableField>>
                projectUuid={projectUuid}
                dashboardSlug={dashboard?.slug}
                dashboardName={dashboard?.name}
                itemsMap={allFilterableFieldsMap}
                startOfWeek={
                    project.data?.warehouseConnection?.startOfWeek ?? undefined
                }
                dashboardFilters={appliedFilters}
            >
                {batchBindModal}
            </FiltersProvider>
        );
    }

    return (
        <FiltersProvider<Record<string, DashboardFilterableField>>
            projectUuid={projectUuid}
            dashboardSlug={dashboard?.slug}
            dashboardName={dashboard?.name}
            dashboardUuid={dashboard?.uuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={appliedFilters}
        >
            <Flex
                gap="xs"
                wrap="wrap"
                mb="xs"
                align="center"
                sx={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                }}
            >
                <AddFilterButton
                    filterScope={filterScope}
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
                    filterScope={filterScope}
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
                            onChange={(event) => {
                                const next = event.currentTarget.checked;
                                enqueueFilterBarVisibilityChanged(
                                    {
                                        scope: filterScope,
                                        tabUuid: activeTabUuid,
                                        tabName:
                                            dashboardTabs?.find(
                                                (tab) =>
                                                    tab.uuid === activeTabUuid,
                                            )?.name ?? null,
                                    },
                                    isFilterEnabled,
                                    next,
                                );
                                setIsFilterEnabled(next);
                            }}
                            size="sm"
                            ml={
                                filterScope === 'global'
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
                            <>
                                <Checkbox
                                    checked={showAddFilterButton}
                                    onChange={(event) => {
                                        const next =
                                            event.currentTarget.checked;
                                        enqueueAddFilterButtonVisibilityChanged(
                                            {
                                                scope: filterScope,
                                                tabUuid: activeTabUuid,
                                                tabName:
                                                    dashboardTabs?.find(
                                                        (tab) =>
                                                            tab.uuid ===
                                                            activeTabUuid,
                                                    )?.name ?? null,
                                            },
                                            showAddFilterButton,
                                            next,
                                        );
                                        setShowAddFilterButton(next);
                                    }}
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
                                {filterScope === 'tab' &&
                                    currentFilters.length > 0 && (
                                        <Button
                                            size="sm"
                                            variant="subtle"
                                            compact
                                            ml="sm"
                                            onClick={() =>
                                                setBatchBindModalOpened(true)
                                            }
                                            styles={{
                                                root: {
                                                    fontWeight: 400,
                                                    fontSize: '14px',
                                                },
                                            }}
                                        >
                                            {t(
                                                'components_dashboard_filter.batch_bind.button',
                                            )}
                                        </Button>
                                    )}
                            </>
                        )}
                    </>
                )}
            </Flex>

            {/* 批量绑定 Modal */}
            {batchBindModal}
        </FiltersProvider>
    );
};

export default DashboardFilter;

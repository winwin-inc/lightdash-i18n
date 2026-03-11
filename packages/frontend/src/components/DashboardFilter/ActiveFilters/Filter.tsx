import {
    applyDefaultTileTargets,
    DimensionType,
    getFilterTypeFromItemType,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Box,
    Button,
    CloseButton,
    createStyles,
    Indicator,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { IconGripVertical } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    getFilterRuleTables,
    useConditionalRuleLabel,
    useConditionalRuleLabelFromItem,
} from '../../common/Filters/FilterInputs/utils';
import MantineIcon from '../../common/MantineIcon';
import FilterConfiguration from '../FilterConfiguration';
import { hasFilterValueSet } from '../FilterConfiguration/utils';
import { useFilterDropdownStyles } from '../filterDropdownStyles';

const useDashboardFilterStyles = createStyles((theme) => ({
    root: {
        backgroundColor: 'white',
    },
    unsetRequiredFilter: {
        borderStyle: 'solid',
        borderWidth: '3px',
    },
    inactiveFilter: {
        borderStyle: 'dashed',
        borderWidth: '1px',
        borderColor: theme.fn.rgba(theme.colors.gray[5], 0.7),
        backgroundColor: theme.fn.rgba(theme.white, 0.7),
    },
}));

type Props = {
    isEditMode: boolean;
    filterScope: 'global' | 'tab';
    isTemporary?: boolean;
    field: FilterableDimension | undefined;
    filterRule: DashboardFilterRule;
    appliesToTabs: string[];
    openPopoverId: string | undefined;
    activeTabUuid: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onUpdate: (filter: DashboardFilterRule) => void;
    onRemove: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    filterScope,
    isTemporary,
    field,
    filterRule,
    appliesToTabs,
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
    onUpdate,
    onRemove,
}) => {
    const { t } = useTranslation();

    const { classes } = useDashboardFilterStyles();
    const dropdownClasses = useFilterDropdownStyles();
    const popoverId = useId();

    const getConditionalRuleLabel = useConditionalRuleLabel();
    const getConditionalRuleLabelFromItem = useConditionalRuleLabelFromItem();

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const disabled = useMemo(() => {
        // Wait for fields to be loaded unless is SQL column
        return !allFilterableFields && !filterRule.target.isSqlColumn;
    }, [allFilterableFields, filterRule]);

    const isFilterReadOnly = filterRule.readOnly ?? false;

    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const closeTimeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const allowSubOpenRef = useRef(false);
    /** 内部下拉（运算符 Select、取值 MultiSelect 等）可能多个，只有全部 onClose 后才收起占位高度 */
    const subPopoverOpenCountRef = useRef(0);

    useEffect(() => {
        if (!isPopoverOpen) {
            allowSubOpenRef.current = false;
            subPopoverOpenCountRef.current = 0;
            return;
        }
        allowSubOpenRef.current = false;
        const onUserInteraction = () => {
            allowSubOpenRef.current = true;
        };
        document.addEventListener('mousedown', onUserInteraction, true);
        document.addEventListener('touchstart', onUserInteraction, true);
        // 从其他筛选器切回本面板时，用户点「本面板」时 mousedown 在切换前已发生，本面板的 allowSubOpenRef 仍为 false；
        // 短延时兜底：切换后用户再点开内部下拉时一定能出占位
        const fallbackTimer = setTimeout(() => {
            allowSubOpenRef.current = true;
        }, 180);
        return () => {
            clearTimeout(fallbackTimer);
            document.removeEventListener('mousedown', onUserInteraction, true);
            document.removeEventListener('touchstart', onUserInteraction, true);
        };
    }, [isPopoverOpen]);

    /** 仅在有真实用户点击/触摸后再响应 onOpen，避免首开误触；切换筛选项后点开下拉会先触发 mousedown，再 onOpen，稳定出高度 */
    const openSubPopoverWrapped = useCallback(() => {
        if (!allowSubOpenRef.current) return;
        closeTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
        closeTimeoutIdsRef.current = [];
        subPopoverOpenCountRef.current += 1;
        openSubPopover();
    }, [openSubPopover]);

    /** 多个内部下拉共享同一占位；每个 onClose 在 150ms 后计数减 1，仅当计数归零才收起占位，避免从 A 下拉切到 B 时误关高度 */
    const closeSubPopoverWrapped = useCallback(() => {
        const id = setTimeout(() => {
            subPopoverOpenCountRef.current = Math.max(
                0,
                subPopoverOpenCountRef.current - 1,
            );
            if (subPopoverOpenCountRef.current === 0) {
                closeSubPopover();
            }
            closeTimeoutIdsRef.current = closeTimeoutIdsRef.current.filter(
                (x) => x !== id,
            );
        }, 150);
        closeTimeoutIdsRef.current.push(id);
    }, [closeSubPopover]);

    useEffect(
        () => () => {
            closeTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
            closeTimeoutIdsRef.current = [];
        },
        [],
    );

    const isDraggable = isEditMode && !isTemporary;

    const defaultFilterRule = useMemo(() => {
        if (filterableFieldsByTileUuid && field) {
            return applyDefaultTileTargets(
                filterRule,
                field,
                filterableFieldsByTileUuid,
            );
        } else {
            return filterRule;
        }
    }, [filterableFieldsByTileUuid, field, filterRule]);

    // Only used by active filters
    const originalFilterRule = useMemo(() => {
        if (!dashboard) return;

        return dashboard.filters.dimensions.find(
            (item) => item.id === filterRule.id,
        );
    }, [dashboard, filterRule]);

    const filterRuleLabels = useMemo(() => {
        if (field) {
            return getConditionalRuleLabelFromItem(filterRule, field);
        } else {
            const column = Object.values(sqlChartTilesMetadata)
                .flatMap((tileMetadata) => tileMetadata.columns)
                .find(
                    ({ reference }) => reference === filterRule.target.fieldId,
                );
            if (column) {
                return getConditionalRuleLabel(
                    filterRule,
                    getFilterTypeFromItemType(column.type),
                    column.reference,
                );
            }
            return getConditionalRuleLabel(
                filterRule,
                getFilterTypeFromItemType(
                    filterRule.target.fallbackType ?? DimensionType.STRING,
                ),
                filterRule.target.fieldId,
            );
        }
    }, [
        filterRule,
        field,
        sqlChartTilesMetadata,
        getConditionalRuleLabel,
        getConditionalRuleLabelFromItem,
    ]);

    const filterRuleTables = useMemo(() => {
        if (!field || !allFilterableFields) return;

        return getFilterRuleTables(filterRule, field, allFilterableFields);
    }, [filterRule, field, allFilterableFields]);

    const hasUnsetRequiredFilter =
        filterRule.required && !hasFilterValueSet(filterRule);

    const inactiveFilterInfo = useMemo(() => {
        if (activeTabUuid && !appliesToTabs.includes(activeTabUuid)) {
            const appliedTabList = appliesToTabs
                .map((tabId) => {
                    return `'${
                        dashboardTabs.find((tab) => tab.uuid === tabId)?.name
                    }'`;
                })
                .join(', ');
            return appliedTabList
                ? ` ${t(
                      'components_dashboard_filter.filter.inactive_filter.part_1',
                      {
                          suffix: appliesToTabs.length === 1 ? '' : 's',
                      },
                  )}: ${appliedTabList}`
                : t(
                      'components_dashboard_filter.filter.inactive_filter.part_2',
                  );
        }
    }, [activeTabUuid, appliesToTabs, dashboardTabs, t]);

    const handleClose = useCallback(() => {
        closeTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
        closeTimeoutIdsRef.current = [];
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handleSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            onUpdate(newRule);
            handleClose();
        },
        [onUpdate, handleClose],
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
        return dashboardTiles?.filter((tl) => tl.tabUuid === activeTabUuid);
    }, [dashboardTiles, activeTabUuid, filterScope]);

    const appliedFilterableFieldsByTileUuid = useMemo(() => {
        if (filterScope === 'global') {
            return filterableFieldsByTileUuid;
        }
        return Object.keys(filterableFieldsByTileUuid ?? {}).reduce(
            (acc, tileUuid) => {
                const tile = appliedDashboardTiles?.find(
                    (tl) => tl.uuid === tileUuid,
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

    return (
        <>
            <Popover
                position="bottom-start"
                trapFocus
                opened={isPopoverOpen}
                closeOnEscape={!isSubPopoverOpen}
                closeOnClickOutside={!isSubPopoverOpen}
                onClose={handleClose}
                disabled={disabled || (isFilterReadOnly && !isEditMode)}
                transitionProps={{ transition: 'pop-top-left' }}
                withArrow
                shadow="md"
                offset={1}
                arrowOffset={14}
                withinPortal
            >
                <Popover.Target>
                    <Indicator
                        inline
                        position="top-end"
                        size={16}
                        disabled={!hasUnsetRequiredFilter}
                        label={
                            <Tooltip
                                fz="xs"
                                label={t(
                                    'components_dashboard_filter.filter.tooltip_set.label',
                                )}
                            >
                                <Text fz="9px" fw={500}>
                                    {t(
                                        'components_dashboard_filter.filter.tooltip_set.content',
                                    )}
                                </Text>
                            </Tooltip>
                        }
                    >
                        <Tooltip
                            fz="xs"
                            label={inactiveFilterInfo}
                            disabled={!inactiveFilterInfo}
                            withinPortal
                        >
                            <Button
                                pos="relative"
                                size="xs"
                                radius="md"
                                variant={
                                    isTemporary || hasUnsetRequiredFilter
                                        ? 'outline'
                                        : 'default'
                                }
                                className={`${classes.root} ${
                                    hasUnsetRequiredFilter
                                        ? classes.unsetRequiredFilter
                                        : ''
                                } ${
                                    inactiveFilterInfo
                                        ? classes.inactiveFilter
                                        : ''
                                }`}
                                leftIcon={
                                    isDraggable && (
                                        <MantineIcon
                                            icon={IconGripVertical}
                                            color="gray"
                                            cursor="grab"
                                            size="sm"
                                        />
                                    )
                                }
                                rightIcon={
                                    (isEditMode || isTemporary) && (
                                        <CloseButton
                                            size="sm"
                                            onClick={onRemove}
                                        />
                                    )
                                }
                                styles={{
                                    inner: {
                                        color: 'black',
                                    },
                                    label: {
                                        maxWidth: '800px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    },
                                    root: {
                                        maxWidth: '100%',
                                        flexShrink: 1,
                                    },
                                }}
                                onClick={() =>
                                    isPopoverOpen
                                        ? handleClose()
                                        : onPopoverOpen(popoverId)
                                }
                            >
                                <Box
                                    sx={{
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <Text fz="xs" truncate>
                                        <Tooltip
                                            withinPortal
                                            position="top-start"
                                            disabled={
                                                isPopoverOpen ||
                                                !filterRuleTables?.length
                                            }
                                            openDelay={1000}
                                            offset={8}
                                            label={
                                                <Text fz="xs">
                                                    {filterRuleTables?.length ===
                                                    1
                                                        ? t(
                                                              'components_dashboard_filter.filter.table',
                                                          )
                                                        : t(
                                                              'components_dashboard_filter.filter.tables',
                                                          )}
                                                    <Text span fw={600}>
                                                        {filterRuleTables?.join(
                                                            ', ',
                                                        )}
                                                    </Text>
                                                </Text>
                                            }
                                        >
                                            <Text fw={600} span truncate>
                                                {filterRule?.label ||
                                                    filterRuleLabels?.field}{' '}
                                            </Text>
                                        </Tooltip>
                                        {filterRule?.disabled ? (
                                            <Text span color="gray.6" truncate>
                                                {t(
                                                    'components_dashboard_filter.filter.filter_rules.part_1',
                                                )}
                                            </Text>
                                        ) : (
                                            <>
                                                <Text
                                                    span
                                                    color="gray.7"
                                                    truncate
                                                >
                                                    {
                                                        filterRuleLabels?.operator
                                                    }{' '}
                                                </Text>
                                                <Text fw={700} span truncate>
                                                    {filterRuleLabels?.value}
                                                </Text>
                                            </>
                                        )}
                                    </Text>
                                </Box>
                            </Button>
                        </Tooltip>
                    </Indicator>
                </Popover.Target>

                <Popover.Dropdown
                    className={
                        isPopoverOpen
                            ? `${dropdownClasses.classes.dropdown} ${dropdownClasses.classes.dropdownWithSubOpen}`
                            : dropdownClasses.classes.dropdown
                    }
                >
                    {appliedDashboardTiles && (
                        <Box
                            className={
                                isPopoverOpen
                                    ? dropdownClasses.classes.dropdownContent
                                    : undefined
                            }
                        >
                            <FilterConfiguration
                                isCreatingNew={false}
                                isEditMode={isEditMode}
                                isTemporary={isTemporary}
                                field={field}
                                fields={allFilterableFields || []}
                                tiles={appliedDashboardTiles}
                                tabs={appliedDashboardTabs}
                                activeTabUuid={activeTabUuid}
                                originalFilterRule={originalFilterRule}
                                availableTileFilters={
                                    appliedFilterableFieldsByTileUuid ?? {}
                                }
                                defaultFilterRule={defaultFilterRule}
                                onSave={handleSaveChanges}
                                popoverProps={{
                                    onOpen: openSubPopoverWrapped,
                                    onClose: closeSubPopoverWrapped,
                                }}
                                filterScope={filterScope}
                                tabUuid={
                                    filterScope === 'tab'
                                        ? (appliesToTabs[0] ?? activeTabUuid)
                                        : undefined
                                }
                            />
                        </Box>
                    )}
                </Popover.Dropdown>
            </Popover>
        </>
    );
};

export default Filter;

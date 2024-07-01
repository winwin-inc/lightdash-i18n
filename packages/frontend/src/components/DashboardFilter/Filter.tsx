import {
    applyDefaultTileTargets,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Button,
    CloseButton,
    Indicator,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useDashboardContext } from '../../providers/DashboardProvider';
import {
    getFilterRuleTables,
    useConditionalRuleLabel,
} from '../common/Filters/FilterInputs';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';
import { hasFilterValueSet } from './FilterConfiguration/utils';

type Props = {
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    field?: FilterableDimension;
    filterRule?: DashboardFilterRule;
    openPopoverId: string | undefined;
    activeTabUuid?: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onSave?: (value: DashboardFilterRule) => void;
    onUpdate?: (filter: DashboardFilterRule) => void;
    onRemove?: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    isCreatingNew,
    isTemporary,
    field,
    filterRule,
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
    onSave,
    onUpdate,
    onRemove,
}) => {
    const { t } = useTranslation();

    const popoverId = useId();
    const getConditionalRuleLabel = useConditionalRuleLabel();

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
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

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const defaultFilterRule = useMemo(() => {
        if (!filterableFieldsByTileUuid || !field || !filterRule) return;

        return applyDefaultTileTargets(
            filterRule,
            field,
            filterableFieldsByTileUuid,
        );
    }, [filterableFieldsByTileUuid, field, filterRule]);

    // Only used by active filters
    const originalFilterRule = useMemo(() => {
        if (!dashboard || !filterRule) return;

        return dashboard.filters.dimensions.find(
            (item) => item.id === filterRule.id,
        );
    }, [dashboard, filterRule]);

    const filterRuleLabels = useMemo(() => {
        if (!filterRule || !field) return;

        return getConditionalRuleLabel(filterRule, field);
    }, [filterRule, field, getConditionalRuleLabel]);

    const filterRuleTables = useMemo(() => {
        if (!filterRule || !field || !allFilterableFields) return;

        return getFilterRuleTables(filterRule, field, allFilterableFields);
    }, [filterRule, field, allFilterableFields]);

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handelSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            if (isCreatingNew && onSave) {
                onSave(newRule);
            } else if (onUpdate) {
                onUpdate(newRule);
            }
            handleClose();
        },
        [isCreatingNew, onSave, onUpdate, handleClose],
    );

    const isPopoverDisabled =
        !filterableFieldsByTileUuid || !allFilterableFields;

    return (
        <Popover
            position="bottom-start"
            trapFocus
            opened={isPopoverOpen}
            closeOnEscape={!isSubPopoverOpen}
            closeOnClickOutside={!isSubPopoverOpen}
            onClose={handleClose}
            disabled={isPopoverDisabled}
            transitionProps={{ transition: 'pop-top-left' }}
            withArrow
            shadow="md"
            offset={1}
            arrowOffset={14}
        >
            <Popover.Target>
                {isCreatingNew ? (
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
                                )}{' '}
                                <Text span fw={600}>
                                    '{' '}
                                    {t(
                                        'components_dashboard_filter.filter.tooltip_creating_new.label.part_2',
                                    )}
                                    '
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
                            leftIcon={
                                <MantineIcon color="blue" icon={IconFilter} />
                            }
                            disabled={!allFilterableFields}
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
                            {t(
                                'components_dashboard_filter.filter.tooltip_creating_new.content',
                            )}
                        </Button>
                    </Tooltip>
                ) : (
                    <Indicator
                        inline
                        position="top-end"
                        size={16}
                        disabled={
                            !(
                                filterRule?.required &&
                                !hasFilterValueSet(filterRule)
                            )
                        }
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
                        styles={(theme) => ({
                            common: {
                                top: -5,
                                right: 24,
                                borderRadius: theme.radius.xs,
                                borderBottomRightRadius: 0,
                                borderBottomLeftRadius: 0,
                            },
                        })}
                    >
                        <Button
                            pos="relative"
                            size="xs"
                            variant={
                                isTemporary ||
                                (filterRule?.required &&
                                    !hasFilterValueSet(filterRule))
                                    ? 'outline'
                                    : 'default'
                            }
                            bg="white"
                            rightIcon={
                                (isEditMode || isTemporary) && (
                                    <CloseButton size="sm" onClick={onRemove} />
                                )
                            }
                            styles={{
                                inner: {
                                    color: 'black',
                                },
                                root: {
                                    borderWidth:
                                        filterRule?.required &&
                                        !hasFilterValueSet(filterRule)
                                            ? 3
                                            : 'default',
                                },
                            }}
                            onClick={() =>
                                isPopoverOpen
                                    ? handleClose()
                                    : onPopoverOpen(popoverId)
                            }
                        >
                            <Text fz="xs">
                                <Tooltip
                                    withinPortal
                                    position="top-start"
                                    disabled={
                                        isPopoverOpen ||
                                        !filterRuleTables?.length
                                    }
                                    offset={8}
                                    label={
                                        <Text fz="xs">
                                            {filterRuleTables?.length === 1
                                                ? `${t(
                                                      'components_dashboard_filter.filter.table',
                                                  )}: `
                                                : `${t(
                                                      'components_dashboard_filter.filter.tables',
                                                  )}: `}
                                            <Text span fw={600}>
                                                {filterRuleTables?.join(', ')}
                                            </Text>
                                        </Text>
                                    }
                                >
                                    <Text fw={600} span>
                                        {filterRule?.label ||
                                            filterRuleLabels?.field}{' '}
                                    </Text>
                                </Tooltip>
                                <Text fw={400} span>
                                    {filterRule?.disabled ? (
                                        <Text span color="gray.6">
                                            {t(
                                                'components_dashboard_filter.filter.filter_rules.part_1',
                                            )}
                                        </Text>
                                    ) : (
                                        <>
                                            <Text span color="gray.7">
                                                {filterRuleLabels?.operator}{' '}
                                            </Text>
                                            <Text fw={700} span>
                                                {filterRuleLabels?.value}
                                            </Text>
                                        </>
                                    )}
                                </Text>
                            </Text>
                        </Button>
                    </Indicator>
                )}
            </Popover.Target>

            <Popover.Dropdown>
                {filterableFieldsByTileUuid && dashboardTiles && (
                    <FilterConfiguration
                        isCreatingNew={isCreatingNew}
                        isEditMode={isEditMode}
                        isTemporary={isTemporary}
                        field={field}
                        fields={allFilterableFields || []}
                        tiles={dashboardTiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        originalFilterRule={originalFilterRule}
                        availableTileFilters={filterableFieldsByTileUuid}
                        defaultFilterRule={defaultFilterRule}
                        onSave={handelSaveChanges}
                        popoverProps={{
                            onOpen: openSubPopover,
                            onClose: closeSubPopover,
                        }}
                    />
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default Filter;

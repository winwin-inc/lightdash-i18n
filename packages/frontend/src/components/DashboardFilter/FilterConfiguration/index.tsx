import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    createDashboardFilterRuleFromSqlColumn,
    DimensionType,
    FilterType,
    findDefaultTileFilterField,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    getItemId,
    isFilterableField,
    isMetric,
    isTableCalculation,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type ResultColumn,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Select,
    Stack,
    Tabs,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconRotate2, IconSql } from '@tabler/icons-react';
import { produce } from 'immer';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useIsMobileDevice } from '../../../hooks/useIsMobileDevice';
import { useProject } from '../../../hooks/useProject';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { isCategoryField } from '../../../utils/categoryFilters';
import FieldSelect from '../../common/FieldSelect';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import MantineIcon from '../../common/MantineIcon';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import { DEFAULT_TAB, FilterActions, FilterTabs } from './constants';
import {
    getFilterRuleRevertableObject,
    hasFilterValueSet,
    hasSavedFilterValueChanged,
    isFilterEnabled,
} from './utils';

interface Props {
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    field?: DashboardFilterableField;
    fields?: DashboardFilterableField[];
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    originalFilterRule?: DashboardFilterRule;
    defaultFilterRule?: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onSave: (value: DashboardFilterRule) => void;
    onDraftChange?: (value: DashboardFilterRule | undefined) => void;
    isPopoverOpen?: boolean;
    filterScope: 'global' | 'tab';
    tabUuid?: string;
    onSelectedTabChange?: (tab: FilterTabs) => void;
}

const getDefaultField = (
    fields: DashboardFilterableField[],
    selectedField: DashboardFilterableField,
) => findDefaultTileFilterField(fields, selectedField);

const FilterConfiguration: FC<Props> = ({
    isEditMode,
    isCreatingNew = false,
    isTemporary = false,
    tiles,
    tabs,
    activeTabUuid,
    field,
    fields,
    availableTileFilters,
    originalFilterRule,
    defaultFilterRule,
    popoverProps,
    onSave,
    onDraftChange,
    isPopoverOpen = false,
    filterScope,
    tabUuid,
    onSelectedTabChange,
}) => {
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const isCustomerUse = project?.isCustomerUse ?? false;
    const isMobileDevice = useIsMobileDevice();

    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);
    const [selectedField, setSelectedField] = useState<
        DashboardFilterableField | undefined
    >(field);

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >(defaultFilterRule);
    const [pendingExcludedValue, setPendingExcludedValue] =
        useState<string>('');

    const getRuleWithPendingExcludedValue = useCallback(
        (rule: DashboardFilterRule): DashboardFilterRule => {
            const pendingValue = pendingExcludedValue.trim();
            if (!pendingValue) {
                return rule;
            }
            const mergedExcludedValues = Array.from(
                new Set([...(rule.excludedValues ?? []), pendingValue]),
            );
            return {
                ...rule,
                excludedValues:
                    mergedExcludedValues.length > 0
                        ? mergedExcludedValues
                        : undefined,
            };
        },
        [pendingExcludedValue],
    );
    const draftFilterRuleWithPendingExcludedValue = useMemo(
        () =>
            draftFilterRule
                ? getRuleWithPendingExcludedValue(draftFilterRule)
                : undefined,
        [draftFilterRule, getRuleWithPendingExcludedValue],
    );

    const wasPopoverOpenRef = useRef(false);
    useEffect(() => {
        const justOpened = isPopoverOpen && !wasPopoverOpenRef.current;
        wasPopoverOpenRef.current = isPopoverOpen;

        if (justOpened && defaultFilterRule) {
            setDraftFilterRule(defaultFilterRule);
            setPendingExcludedValue('');
        }
    }, [isPopoverOpen, defaultFilterRule]);

    useEffect(() => {
        onDraftChange?.(draftFilterRuleWithPendingExcludedValue);
    }, [draftFilterRuleWithPendingExcludedValue, onDraftChange]);

    /** 与看板已保存配置对比，用于「还原」等需回到持久化状态的逻辑 */
    const isDraftModifiedFromSaved = useMemo(() => {
        if (!originalFilterRule || !draftFilterRule) return false;

        return hasSavedFilterValueChanged(originalFilterRule, draftFilterRule);
    }, [originalFilterRule, draftFilterRule]);

    /**
     * 与当前已应用的筛选对比（打开 Popover 时的 defaultFilterRule）。
     * 若仅用 isDraftModifiedFromSaved，会出现：先应用不存在的自定义值，再选回与已保存相同的合法选项时，
     * 草稿与磁盘一致但被误判为「未修改」，无法再次点应用。
     */
    const isDraftModifiedFromApplied = useMemo(() => {
        if (!defaultFilterRule || !draftFilterRuleWithPendingExcludedValue)
            return false;

        return hasSavedFilterValueChanged(
            defaultFilterRule,
            draftFilterRuleWithPendingExcludedValue,
        );
    }, [defaultFilterRule, draftFilterRuleWithPendingExcludedValue]);

    const handleChangeField = (newField: DashboardFilterableField) => {
        const isCreatingTemporary = isCreatingNew && !isEditMode;

        if (
            newField &&
            isFilterableField(newField) &&
            !isTableCalculation(newField) &&
            !isMetric(newField)
        ) {
            setDraftFilterRule(
                createDashboardFilterRuleFromField({
                    field: newField,
                    availableTileFilters,
                    isTemporary: isCreatingTemporary,
                }),
            );

            setSelectedField(newField);
        }
    };

    const handleRevert = useCallback(() => {
        if (!originalFilterRule) return;

        setDraftFilterRule((oldDraftFilterRule) => {
            return oldDraftFilterRule
                ? {
                      ...oldDraftFilterRule,
                      ...getFilterRuleRevertableObject(originalFilterRule),
                  }
                : undefined;
        });
    }, [originalFilterRule, setDraftFilterRule]);

    const handleChangeFilterRule = useCallback(
        (newFilterRule: DashboardFilterRule) => {
            const isNewFilterDisabled = hasFilterValueSet(newFilterRule)
                ? false
                : isEditMode
                  ? newFilterRule.disabled
                  : true;
            const updatedRule = {
                ...newFilterRule,
                disabled: isNewFilterDisabled,
            };

            setDraftFilterRule(updatedRule);
            onDraftChange?.(getRuleWithPendingExcludedValue(updatedRule));
        },
        [isEditMode, onDraftChange, getRuleWithPendingExcludedValue],
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const dashboardFiltersFromContext = useDashboardContext(
        (c) => c.dashboardFilters,
    );
    const allFiltersFromContext = useDashboardContext((c) => c.allFilters);
    const tabFiltersFromContext = useDashboardContext((c) => c.tabFilters);
    const columnsOptions = useMemo(() => {
        const allColumns = Object.values(sqlChartTilesMetadata).flatMap(
            (tileMetadata) => tileMetadata.columns,
        );
        const uniqueColumnsMap = new Map(
            allColumns.map((column) => [column.reference, column]),
        );
        return Array.from(uniqueColumnsMap.values());
    }, [sqlChartTilesMetadata]);

    const handleChangeColumn = useCallback(
        (newColumn: ResultColumn) => {
            const isCreatingTemporary = isCreatingNew && !isEditMode;
            setDraftFilterRule(
                createDashboardFilterRuleFromSqlColumn({
                    column: newColumn,
                    availableTileColumns: Object.fromEntries(
                        Object.entries(sqlChartTilesMetadata).map(
                            ([tileUuid, tileMetadata]) => [
                                tileUuid,
                                tileMetadata.columns,
                            ],
                        ),
                    ),
                    isTemporary: isCreatingTemporary,
                }),
            );
        },
        [isCreatingNew, isEditMode, sqlChartTilesMetadata],
    );

    const filterType: FilterType = useMemo(() => {
        if (selectedField) {
            return getFilterTypeFromItem(selectedField);
        }

        if (draftFilterRule?.target.fieldId) {
            const selectedColumn = columnsOptions.find(
                (column) => column.reference === draftFilterRule.target.fieldId,
            );
            return getFilterTypeFromItemType(
                selectedColumn?.type ??
                    draftFilterRule.target.fallbackType ??
                    DimensionType.STRING,
            );
        }

        return FilterType.STRING;
    }, [
        columnsOptions,
        draftFilterRule?.target.fallbackType,
        draftFilterRule?.target.fieldId,
        selectedField,
    ]);

    const handleChangeTileConfiguration = useCallback(
        (
            action: FilterActions,
            tileUuid: string,
            newTarget?: DashboardFieldTarget,
        ) => {
            const changedFilterRule = produce(draftFilterRule, (draftState) => {
                if (!draftState) return;

                draftState.tileTargets = draftState.tileTargets ?? {};

                switch (action) {
                    case FilterActions.ADD: {
                        let target: DashboardFieldTarget | undefined =
                            newTarget;

                        // Find fallback target
                        if (!target) {
                            const defaultColumn: ResultColumn | undefined =
                                sqlChartTilesMetadata[tileUuid]?.columns[0];
                            const defaultField = selectedField
                                ? getDefaultField(
                                      availableTileFilters[tileUuid] ?? [],
                                      selectedField,
                                  )
                                : undefined;

                            if (defaultColumn) {
                                // Set SQL chart fallback column
                                target = {
                                    fieldId: defaultColumn.reference,
                                    tableName: 'mock_table',
                                    isSqlColumn: true,
                                    fallbackType: defaultColumn.type,
                                };
                            } else if (defaultField) {
                                // Set default field
                                target = {
                                    fieldId: getItemId(defaultField),
                                    tableName: defaultField.table,
                                };
                            }
                        }

                        if (!target) return draftState;

                        draftState.tileTargets[tileUuid] = target;
                        return draftState;
                    }
                    case FilterActions.REMOVE:
                        draftState.tileTargets[tileUuid] = false;
                        return draftState;

                    default:
                        return assertUnreachable(
                            action,
                            'Invalid FilterActions',
                        );
                }
            });

            setDraftFilterRule(changedFilterRule);
        },
        [
            selectedField,
            availableTileFilters,
            setDraftFilterRule,
            draftFilterRule,
            sqlChartTilesMetadata,
        ],
    );

    const handleToggleAll = useCallback(
        (checked: boolean, targetTileUuids: string[]) => {
            if (!checked) {
                const newFilterRule = produce(draftFilterRule, (draftState) => {
                    if (!draftState || !selectedField) return;

                    Object.entries(availableTileFilters).forEach(
                        ([tileUuid]) => {
                            if (
                                !draftState.tileTargets ||
                                !targetTileUuids.includes(tileUuid)
                            )
                                return;
                            draftState.tileTargets[tileUuid] = false;
                        },
                    );
                    return draftState;
                });

                setDraftFilterRule(newFilterRule);
            } else {
                const newFilterRule = produce(draftFilterRule, (draftState) => {
                    if (!draftState || !selectedField) return;
                    targetTileUuids.forEach((tileUuid) => {
                        if (!draftState.tileTargets || !selectedField) return;
                        const defaultField = findDefaultTileFilterField(
                            availableTileFilters[tileUuid] ?? [],
                            selectedField,
                        );
                        if (!defaultField) return;
                        draftState.tileTargets[tileUuid] = {
                            fieldId: getItemId(defaultField),
                            tableName: defaultField.table,
                        };
                    });
                    return draftState;
                });

                setDraftFilterRule(newFilterRule);
            }
        },
        [
            selectedField,
            availableTileFilters,
            setDraftFilterRule,
            draftFilterRule,
        ],
    );

    const isApplyDisabled = useMemo(() => {
        if (!draftFilterRuleWithPendingExcludedValue) {
            return true;
        }

        const baselineFilterRule = originalFilterRule ?? defaultFilterRule;
        if (!baselineFilterRule) {
            return !isFilterEnabled(
                draftFilterRuleWithPendingExcludedValue,
                isEditMode,
                isCreatingNew,
            );
        }

        if (!isDraftModifiedFromApplied) {
            return true;
        }

        if (hasFilterValueSet(draftFilterRuleWithPendingExcludedValue)) {
            return false;
        }

        // 草稿无取值：允许「清空已生效的筛选」，或草稿与已应用状态不一致（如 disabled 标志）
        return (
            !hasFilterValueSet(baselineFilterRule) &&
            !isDraftModifiedFromApplied
        );
    }, [
        draftFilterRuleWithPendingExcludedValue,
        originalFilterRule,
        defaultFilterRule,
        isDraftModifiedFromApplied,
        isEditMode,
        isCreatingNew,
    ]);

    const parentFilterOptions = useMemo(() => {
        if (!draftFilterRule?.target) return [];

        const globalFilters =
            dashboardFiltersFromContext?.dimensions &&
            dashboardFiltersFromContext.dimensions.length > 0
                ? dashboardFiltersFromContext.dimensions
                : (allFiltersFromContext?.dimensions ?? []);

        const sourceFilters =
            filterScope === 'global'
                ? globalFilters
                : tabUuid
                  ? (tabFiltersFromContext?.[tabUuid]?.dimensions ?? [])
                  : [];

        const childLevel = draftFilterRule.categoryLevel;
        const currentId = draftFilterRule.id;
        const currentFieldId = draftFilterRule.target.fieldId;

        return sourceFilters
            .filter((candidate) => {
                if (!isCategoryField(candidate)) return false;
                if (candidate.id && currentId && candidate.id === currentId)
                    return false;
                if (candidate.target.fieldId === currentFieldId) return false;
                if (
                    childLevel &&
                    candidate.categoryLevel &&
                    candidate.categoryLevel >= childLevel
                ) {
                    return false;
                }
                return true;
            })
            .map((candidate) => {
                const baseLabel =
                    candidate.label ||
                    candidate.target.fieldLabel ||
                    candidate.target.fieldId;

                const levelLabel = candidate.categoryLevel
                    ? t(
                          `components_dashboard_filter.configuration.category_level.level${candidate.categoryLevel}`,
                      )
                    : undefined;

                return {
                    value: candidate.target.fieldId,
                    label: levelLabel
                        ? `${baseLabel} • ${levelLabel}`
                        : baseLabel,
                    categoryLevel: candidate.categoryLevel,
                };
            });
    }, [
        draftFilterRule,
        filterScope,
        allFiltersFromContext,
        dashboardFiltersFromContext,
        tabFiltersFromContext,
        tabUuid,
        t,
    ]);

    return (
        <Stack
            sx={{
                width: '100%',
                maxWidth: '100%',
                height: '100%',
                minHeight: 0,
            }}
        >
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    // 图表图块：仅内层列表滚动；查看模式：超出 60vh 可滚；编辑模式：不压高度，无需外层滚动
                    overflow:
                        selectedTabId === FilterTabs.TILES ||
                        isEditMode ||
                        isMobileDevice
                            ? 'hidden'
                            : 'auto',
                }}
                data-filter-scroll-content
            >
                <Tabs
                    value={selectedTabId}
                    onTabChange={(tabId: FilterTabs) => {
                        setSelectedTabId(tabId);
                        onSelectedTabChange?.(tabId);
                    }}
                >
                    {isCreatingNew || isEditMode || isTemporary ? (
                        <Tabs.List mb="md">
                            <Tooltip
                                label={t(
                                    'components_dashboard_filter.tabs.tooltip_filter.label',
                                )}
                                position="top-start"
                            >
                                <Tabs.Tab value={FilterTabs.SETTINGS}>
                                    {t(
                                        'components_dashboard_filter.tabs.tooltip_filter.content',
                                    )}
                                </Tabs.Tab>
                            </Tooltip>

                            <Tooltip
                                label={t(
                                    'components_dashboard_filter.tabs.tooltip_chart_tile.label',
                                )}
                                position="top-start"
                            >
                                <Tabs.Tab
                                    value={FilterTabs.TILES}
                                    disabled={!draftFilterRule}
                                >
                                    {t(
                                        'components_dashboard_filter.tabs.tooltip_chart_tile.content',
                                    )}
                                </Tabs.Tab>
                            </Tooltip>
                        </Tabs.List>
                    ) : null}

                    <Tabs.Panel
                        value={FilterTabs.SETTINGS}
                        miw={isMobileDevice ? 0 : 350}
                        maw={isMobileDevice ? '100%' : 520}
                        w={isMobileDevice ? '100%' : undefined}
                    >
                        <Stack spacing="sm">
                            {isCreatingNew ? (
                                !!fields && fields.length > 0 ? (
                                    <FieldSelect
                                        data-testid="FilterConfiguration/FieldSelect"
                                        size="xs"
                                        focusOnRender={true}
                                        label={
                                            <Text>
                                                {t(
                                                    'components_dashboard_filter.tabs.select_dimension',
                                                )}{' '}
                                                <Text color="red" span>
                                                    *
                                                </Text>{' '}
                                            </Text>
                                        }
                                        withinPortal={
                                            popoverProps?.withinPortal ?? true
                                        }
                                        onDropdownOpen={popoverProps?.onOpen}
                                        onDropdownClose={popoverProps?.onClose}
                                        hasGrouping
                                        item={selectedField}
                                        items={fields}
                                        onChange={(newField) => {
                                            if (!newField) return;

                                            handleChangeField(newField);
                                        }}
                                    />
                                ) : (
                                    <Select
                                        size="xs"
                                        label={
                                            <Text>
                                                {t(
                                                    'components_dashboard_filter.tabs.select_column',
                                                )}{' '}
                                                <Text color="red" span>
                                                    *
                                                </Text>{' '}
                                            </Text>
                                        }
                                        placeholder={t(
                                            'components_dashboard_filter.tabs.select_column_placeholder',
                                        )}
                                        value={draftFilterRule?.target.fieldId}
                                        data={columnsOptions.map(
                                            ({ reference }) => reference,
                                        )}
                                        onChange={(newValue) => {
                                            if (!newValue) return;
                                            const selectedColumn =
                                                columnsOptions.find(
                                                    (column) =>
                                                        column.reference ===
                                                        newValue,
                                                );
                                            if (!selectedColumn) return;
                                            handleChangeColumn(selectedColumn);
                                        }}
                                    />
                                )
                            ) : selectedField ? (
                                <Group spacing="xs">
                                    <FieldIcon item={selectedField} />
                                    {originalFilterRule?.label &&
                                    !isEditMode ? (
                                        <Text span fw={500}>
                                            {originalFilterRule.label}
                                        </Text>
                                    ) : (
                                        <FieldLabel item={selectedField} />
                                    )}
                                </Group>
                            ) : (
                                <Group spacing="xs">
                                    <MantineIcon
                                        icon={IconSql}
                                        size={'lg'}
                                        color={'#0E5A8A'}
                                    />
                                    {originalFilterRule?.label &&
                                    !isEditMode ? (
                                        <Text span fw={500}>
                                            {originalFilterRule.label}
                                        </Text>
                                    ) : (
                                        <Text span fw={500}>
                                            {draftFilterRule?.target.fieldId ||
                                                t(
                                                    'components_dashboard_filter.tabs.select_column_sql',
                                                )}
                                        </Text>
                                    )}
                                </Group>
                            )}

                            {draftFilterRule && (
                                <FilterSettings
                                    isEditMode={isEditMode}
                                    isCreatingNew={isCreatingNew}
                                    filterType={filterType}
                                    field={selectedField}
                                    filterRule={draftFilterRule}
                                    onChangeFilterRule={handleChangeFilterRule}
                                    onPendingExcludedValueChange={
                                        setPendingExcludedValue
                                    }
                                    popoverProps={popoverProps}
                                    isCustomerUse={isCustomerUse}
                                    parentFilterOptions={parentFilterOptions}
                                />
                            )}
                        </Stack>
                    </Tabs.Panel>

                    {draftFilterRule && (
                        <Tabs.Panel
                            value={FilterTabs.TILES}
                            w={isMobileDevice ? '100%' : 500}
                            miw={0}
                            maw="100%"
                            data-testid="DashboardFilterConfiguration/ChartTiles"
                        >
                            <TileFilterConfiguration
                                field={selectedField}
                                tabs={tabs}
                                activeTabUuid={activeTabUuid}
                                filterRule={draftFilterRule}
                                filterScope={filterScope}
                                tiles={tiles}
                                availableTileFilters={availableTileFilters}
                                onChange={handleChangeTileConfiguration}
                                onToggleAll={handleToggleAll}
                            />
                        </Tabs.Panel>
                    )}
                </Tabs>
            </Box>

            <Box
                sx={{
                    position: 'relative',
                    zIndex: 1002,
                    flexShrink: 0,
                }}
            >
                <Flex gap="sm">
                    <Box sx={{ flexGrow: 1 }} />

                    {!isTemporary &&
                        isDraftModifiedFromSaved &&
                        selectedTabId === FilterTabs.SETTINGS &&
                        !isEditMode && (
                            <Tooltip
                                label={t(
                                    'components_dashboard_filter.tabs.tooltip_reset.label',
                                )}
                                position="left"
                            >
                                <Button
                                    aria-label={t(
                                        'components_dashboard_filter.tabs.tooltip_reset.reset',
                                    )}
                                    size="xs"
                                    variant="default"
                                    color="gray"
                                    onClick={handleRevert}
                                >
                                    <MantineIcon icon={IconRotate2} />
                                </Button>
                            </Tooltip>
                        )}

                    <Tooltip
                        label={t(
                            'components_dashboard_filter.tabs.tooltip_filter_field.label',
                        )}
                        disabled={!isApplyDisabled}
                    >
                        <Box>
                            <Button
                                size="xs"
                                variant="filled"
                                disabled={isApplyDisabled}
                                onMouseDown={(
                                    e: MouseEvent<HTMLButtonElement>,
                                ) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedTabId(FilterTabs.SETTINGS);
                                    popoverProps?.onClose?.();
                                    if (draftFilterRule) {
                                        onSave(
                                            draftFilterRuleWithPendingExcludedValue ??
                                                draftFilterRule,
                                        );
                                        setPendingExcludedValue('');
                                    }
                                }}
                            >
                                {t(
                                    'components_dashboard_filter.tabs.tooltip_filter_field.content',
                                )}
                            </Button>
                        </Box>
                    </Tooltip>
                </Flex>
            </Box>
        </Stack>
    );
};

export default FilterConfiguration;

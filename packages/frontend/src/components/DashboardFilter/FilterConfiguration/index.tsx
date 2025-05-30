import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    getItemId,
    isField,
    isFilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Stack,
    Tabs,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import { produce } from 'immer';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
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
    field?: FilterableDimension;
    fields?: FilterableDimension[];
    availableTileFilters: Record<string, FilterableDimension[]>;
    originalFilterRule?: DashboardFilterRule;
    defaultFilterRule?: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onSave: (value: DashboardFilterRule) => void;
}

const getDefaultField = (
    fields: FilterableDimension[],
    selectedField: FilterableDimension,
) => {
    return (
        fields.find(matchFieldExact(selectedField)) ??
        fields.find(matchFieldByTypeAndName(selectedField)) ??
        fields.find(matchFieldByType(selectedField))
    );
};

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
}) => {
    const { t } = useTranslation();
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);

    const [selectedField, setSelectedField] = useState<
        FilterableDimension | undefined
    >(field);

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >(defaultFilterRule);

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule || !draftFilterRule) return false;

        return hasSavedFilterValueChanged(originalFilterRule, draftFilterRule);
    }, [originalFilterRule, draftFilterRule]);

    const handleChangeField = (newField: FilterableDimension) => {
        const isCreatingTemporary = isCreatingNew && !isEditMode;

        if (newField && isField(newField) && isFilterableField(newField)) {
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
            setDraftFilterRule(() => {
                // When a disabled filter has a value set, it should be enabled by setting it to false
                const isNewFilterDisabled =
                    newFilterRule.disabled && !hasFilterValueSet(newFilterRule);
                return { ...newFilterRule, disabled: isNewFilterDisabled };
            });
        },
        [setDraftFilterRule],
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const handleChangeTileConfiguration = useCallback(
        (
            action: FilterActions,
            tileUuid: string,
            newTarget?: DashboardFieldTarget,
        ) => {
            const changedFilterRule = produce(draftFilterRule, (draftState) => {
                if (!draftState || !selectedField) return;

                draftState.tileTargets = draftState.tileTargets ?? {};

                switch (action) {
                    case FilterActions.ADD: {
                        let target: DashboardFieldTarget | undefined =
                            newTarget;

                        // Find fallback target
                        if (!target) {
                            const defaultColumn: string | undefined =
                                sqlChartTilesMetadata[tileUuid]?.columns[0]
                                    ?.reference;
                            const defaultField = getDefaultField(
                                availableTileFilters[tileUuid] ?? [],
                                selectedField,
                            );

                            if (defaultColumn) {
                                // Set SQL chart fallback column
                                target = {
                                    fieldId: defaultColumn,
                                    tableName: 'mock_table',
                                    isSqlColumn: true,
                                };
                            } else if (defaultField) {
                                // Set default field
                                target = {
                                    fieldId: getItemId(defaultField),
                                    tableName: defaultField.name,
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
                        if (!draftState.tileTargets) return;
                        draftState.tileTargets[tileUuid] = {
                            fieldId: getItemId(selectedField),
                            tableName: selectedField.table,
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

    const isApplyDisabled = !isFilterEnabled(
        draftFilterRule,
        isEditMode,
        isCreatingNew,
    );

    return (
        <Stack>
            <Tabs
                value={selectedTabId}
                onTabChange={(tabId: FilterTabs) => setSelectedTabId(tabId)}
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
                                disabled={!selectedField}
                            >
                                {t(
                                    'components_dashboard_filter.tabs.tooltip_chart_tile.content',
                                )}
                            </Tabs.Tab>
                        </Tooltip>
                    </Tabs.List>
                ) : null}

                <Tabs.Panel value={FilterTabs.SETTINGS} miw={350} maw={520}>
                    <Stack spacing="sm">
                        {!!fields && isCreatingNew ? (
                            <FieldSelect
                                data-testid="FilterConfiguration/FieldSelect"
                                size="xs"
                                focusOnRender={true}
                                label={
                                    <Text>
                                        {t(
                                            'components_dashboard_filter.tabs.select',
                                        )}{' '}
                                        <Text color="red" span>
                                            *
                                        </Text>{' '}
                                    </Text>
                                }
                                withinPortal={popoverProps?.withinPortal}
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
                            selectedField && (
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
                            )
                        )}

                        {!!selectedField && draftFilterRule && (
                            <FilterSettings
                                isEditMode={isEditMode}
                                isCreatingNew={isCreatingNew}
                                field={selectedField}
                                filterRule={draftFilterRule}
                                onChangeFilterRule={handleChangeFilterRule}
                                popoverProps={popoverProps}
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                {!!selectedField && draftFilterRule && (
                    <Tabs.Panel
                        value={FilterTabs.TILES}
                        w={500}
                        data-testid="DashboardFilterConfiguration/ChartTiles"
                    >
                        <TileFilterConfiguration
                            field={selectedField}
                            tabs={tabs}
                            activeTabUuid={activeTabUuid}
                            filterRule={draftFilterRule}
                            popoverProps={popoverProps}
                            tiles={tiles}
                            availableTileFilters={availableTileFilters}
                            onChange={handleChangeTileConfiguration}
                            onToggleAll={handleToggleAll}
                        />
                    </Tabs.Panel>
                )}
            </Tabs>

            <Flex gap="sm">
                <Box sx={{ flexGrow: 1 }} />

                {!isTemporary &&
                    isFilterModified &&
                    selectedTabId === FilterTabs.SETTINGS &&
                    !isEditMode && (
                        <Tooltip
                            label={t(
                                'components_dashboard_filter.tabs.tooltip_reset.label',
                            )}
                            position="left"
                        >
                            <Button
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
                            onClick={() => {
                                setSelectedTabId(FilterTabs.SETTINGS);

                                if (!!draftFilterRule) onSave(draftFilterRule);
                            }}
                        >
                            {t(
                                'components_dashboard_filter.tabs.tooltip_filter_field.content',
                            )}
                        </Button>
                    </Box>
                </Tooltip>
            </Flex>
        </Stack>
    );
};

export default FilterConfiguration;

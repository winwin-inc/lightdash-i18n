import {
    getItemId,
    isCompiledCustomSqlDimension,
    isDashboardChartTileType,
    isDashboardFieldTarget,
    isDashboardSqlChartTile,
    isField,
    matchFieldByLabel,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type ChartKind,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type DashboardTab,
    type DashboardTile,
    type Field,
    type Item,
} from '@lightdash/common';
import {
    Accordion,
    Box,
    Checkbox,
    Flex,
    Select,
    Stack,
    Switch,
    Text,
    Tooltip,
    useMantineTheme,
    type PopoverProps,
} from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon/utils';
import { FilterActions } from './constants';

type TileWithTargetFields = {
    key: string;
    label: string;
    checked: boolean;
    disabled: boolean;
    invalidField?: string;
    tileUuid: string;
    tileChartKind?: ChartKind | undefined;
    sortedFilters: DashboardFilterableField[] | undefined;
    selectedField: DashboardFilterableField | undefined;
    tabUuid?: string;
};

type TileWithTargetColumns = {
    key: string;
    label: string;
    checked: boolean;
    disabled: boolean;
    invalidField?: string;
    tileUuid: string;
    tileChartKind?: ChartKind | undefined;
    sortedFilters: string[];
    selectedField: string | undefined;
    tabUuid?: string;
};

type Props = {
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    availableTileFilters: Record<
        string,
        DashboardFilterableField[] | undefined
    >;
    field?: DashboardFilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChange: (
        action: FilterActions,
        tileUuid: string,
        target?: DashboardFieldTarget,
    ) => void;
    onToggleAll: (checked: boolean, tileUuids: string[]) => void;
};

const TileFilterConfiguration: FC<Props> = ({
    tiles,
    tabs,
    activeTabUuid,
    field,
    filterRule,
    availableTileFilters,
    popoverProps,
    onChange,
    onToggleAll,
}) => {
    const { t } = useTranslation();

    const theme = useMantineTheme();
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const sortTilesByFieldMatch = useCallback(
        (
            fieldMatcher: (a: Field) => (b: Field) => boolean,
            a: DashboardFilterableField[] | undefined,
            b: DashboardFilterableField[] | undefined,
        ) => {
            if (!a || !b || !field) return 0;

            const fieldAsField = field as unknown as Field;
            const matchA = a.some((x) =>
                fieldMatcher(fieldAsField)(x as unknown as Field),
            );
            const matchB = b.some((x) =>
                fieldMatcher(fieldAsField)(x as unknown as Field),
            );
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortFieldsByMatch = useCallback(
        (
            fieldMatcher: (a: Field) => (b: Field) => boolean,
            a: Field,
            b: Field,
        ) => {
            if (!field) return 0;
            const fieldAsField = field as unknown as Field;
            const matchA = fieldMatcher(fieldAsField)(a as Field);
            const matchB = fieldMatcher(fieldAsField)(b as Field);
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortedTileWithFilters = useMemo(() => {
        return Object.entries(availableTileFilters)
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldByType, a, b),
            )
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldByTypeAndName, a, b),
            )
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldByLabel, a, b),
            )
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldExact, a, b),
            );
    }, [sortTilesByFieldMatch, availableTileFilters]);

    const tileTargetList = useMemo(() => {
        const tileWithTargetFields =
            sortedTileWithFilters.map<TileWithTargetFields>(
                ([tileUuid, filters], index) => {
                    const tile = tiles.find((it) => it.uuid === tileUuid);
                    const tabUuidFromTile = tile?.tabUuid;

                    // tileConfig overrides the default filter state for a tile
                    // if it is a field, we use that field for the filter.
                    // If it is the empty string, the filter is disabled.
                    const tileConfig = filterRule.tileTargets?.[tileUuid];

                    let selectedField: DashboardFilterableField | undefined;
                    let invalidField: string | undefined;
                    if (tileConfig !== false) {
                        selectedField =
                            tileConfig && isDashboardFieldTarget(tileConfig)
                                ? filters?.find(
                                      (f) =>
                                          tileConfig?.fieldId === getItemId(f),
                                  )
                                : field
                                ? filters?.find(
                                      (f) => getItemId(f) === getItemId(field),
                                  )
                                : undefined;

                        // If tileConfig?.fieldId is set, but the field is not found in the filters, we mark it as invalid filter (missing dimension in model)
                        invalidField =
                            tileConfig &&
                            isDashboardFieldTarget(tileConfig) &&
                            tileConfig?.fieldId !== undefined &&
                            selectedField === undefined
                                ? tileConfig?.fieldId
                                : undefined;
                    }

                    const isFilterAvailable = field
                        ? filters?.some(
                              (f) => getItemId(f) === getItemId(field),
                          ) ?? false
                        : false;

                    const sortedFilters:
                        | DashboardFilterableField[]
                        | undefined =
                        field && filters
                            ? isCompiledCustomSqlDimension(field)
                                ? filters.filter(
                                      (f) => getItemId(f) === getItemId(field),
                                  )
                                : filters
                                      .filter((f) =>
                                          matchFieldByType(
                                              field as unknown as Field,
                                          )(f as unknown as Field),
                                      )
                                      .sort((a, b) =>
                                          sortFieldsByMatch(
                                              matchFieldByType,
                                              a as Field,
                                              b as Field,
                                          ),
                                      )
                                      .sort((a, b) =>
                                          sortFieldsByMatch(
                                              matchFieldByTypeAndName,
                                              a as Field,
                                              b as Field,
                                          ),
                                      )
                                      .sort((a, b) =>
                                          sortFieldsByMatch(
                                              matchFieldByLabel,
                                              a as Field,
                                              b as Field,
                                          ),
                                      )
                                      .sort((a, b) =>
                                          sortFieldsByMatch(
                                              matchFieldExact,
                                              a as Field,
                                              b as Field,
                                          ),
                                      )
                            : filters;

                    const tileWithoutTitle =
                        !tile?.properties.title ||
                        tile.properties.title.length === 0;
                    const isChartTileType =
                        tile && isDashboardChartTileType(tile);

                    let tileLabel = '';
                    if (tile) {
                        if (tileWithoutTitle && isChartTileType) {
                            tileLabel = tile.properties.chartName || '';
                        } else if (tile.properties.title) {
                            tileLabel = tile.properties.title;
                        }
                    }

                    return {
                        key: tileUuid + index,
                        label: tileLabel,
                        checked: !!selectedField,
                        disabled: !isFilterAvailable,
                        invalidField,
                        tileUuid,
                        ...(tile &&
                            isDashboardChartTileType(tile) && {
                                tileChartKind:
                                    tile.properties.lastVersionChartKind ??
                                    undefined,
                            }),
                        sortedFilters,
                        selectedField,
                        tabUuid: tabUuidFromTile,
                    };
                },
            );
        const tileWithTargetColumns = Object.entries(
            sqlChartTilesMetadata,
        ).reduce<TileWithTargetColumns[]>(
            (acc, [tileUuid, metadata], index) => {
                const columns = metadata.columns.map(
                    ({ reference }) => reference,
                );
                const tile = tiles.find((it) => it.uuid === tileUuid);
                if (!tile) {
                    return acc;
                }

                // tileConfig overrides the default filter state for a tile
                // if it is a field, we use that field for the filter.
                // If it is the empty string, the filter is disabled.
                const tileConfig = filterRule.tileTargets?.[tileUuid];

                let selectedField;
                let invalidField: string | undefined;
                if (tileConfig !== false) {
                    selectedField =
                        tileConfig && isDashboardFieldTarget(tileConfig)
                            ? columns?.find((f) => tileConfig?.fieldId === f)
                            : undefined;

                    // If tileConfig?.fieldId is set, but the field is not found in the filters, we mark it as invalid filter (missing dimension in model)
                    invalidField =
                        tileConfig &&
                        isDashboardFieldTarget(tileConfig) &&
                        tileConfig?.fieldId !== undefined &&
                        selectedField === undefined
                            ? tileConfig?.fieldId
                            : undefined;
                }

                const tileWithoutTitle =
                    !tile.properties.title ||
                    tile.properties.title.length === 0;
                const isSqlTileType = tile && isDashboardSqlChartTile(tile);
                let tileLabel = '';
                if (tileWithoutTitle && isSqlTileType) {
                    tileLabel = tile.properties.chartName || '';
                } else if (tile.properties.title) {
                    tileLabel = tile.properties.title;
                }
                acc.push({
                    key: tileUuid + index,
                    label: tileLabel,
                    checked: !!selectedField,
                    disabled: false,
                    invalidField,
                    tileUuid,
                    sortedFilters: columns,
                    selectedField,
                    tabUuid: tile.tabUuid,
                });
                return acc;
            },
            [],
        );

        return [...tileWithTargetFields, ...tileWithTargetColumns];
    }, [
        sortedTileWithFilters,
        sqlChartTilesMetadata,
        tiles,
        filterRule.tileTargets,
        field,
        sortFieldsByMatch,
    ]);

    const filteredTileTargetList = (tabUUid: string) => {
        return tileTargetList.filter((v) => v.tabUuid === tabUUid);
    };

    const SwitchToggle = ({
        tileList,
        tabName,
    }: {
        tileList: any[];
        tabName: string;
    }) => {
        const isAllChecked = tileList.every(({ checked }) => checked);
        const isIndeterminate =
            !isAllChecked && tileList.some(({ checked }) => checked);
        const tileUuids = tileList.map((tile) => tile.tileUuid);
        const shouldBeChecked = isAllChecked || isIndeterminate;
        const tooltipLabel = shouldBeChecked
            ? t('components_dashboard_filter.tile_filter.tooltip_label.off', {
                  tabName,
              })
            : t('components_dashboard_filter.tile_filter.tooltip_label.on', {
                  tabName,
              });

        return (
            <Tooltip label={tooltipLabel} position="right">
                <Switch
                    size="sm"
                    checked={shouldBeChecked}
                    styles={{
                        label: {
                            paddingRight: theme.spacing.xs,
                        },
                    }}
                    onChange={() => {
                        if (isIndeterminate) {
                            onToggleAll(false, tileUuids);
                        } else {
                            onToggleAll(!isAllChecked, tileUuids);
                        }
                    }}
                />
            </Tooltip>
        );
    };

    const StackSubComponent = ({
        tileList,
    }: {
        tileList: Array<TileWithTargetFields | TileWithTargetColumns>;
    }) => {
        return (
            <Stack spacing="md">
                {tileList.map((value) => (
                    <Box key={value.key}>
                        <Tooltip
                            label={
                                value.invalidField
                                    ? t(
                                          'components_dashboard_filter.tile_filter.tooltip_invalid_field.not_valid',
                                          { invalidField: value.invalidField },
                                      )
                                    : t(
                                          'components_dashboard_filter.tile_filter.tooltip_invalid_field.no_fields',
                                      )
                            }
                            position="left"
                            disabled={
                                !value.disabled &&
                                value.invalidField === undefined
                            }
                        >
                            <Box>
                                <Checkbox
                                    size="xs"
                                    fw={500}
                                    disabled={value.disabled}
                                    label={
                                        <Flex align="center" gap="xxs">
                                            <MantineIcon
                                                color="blue.6"
                                                icon={getChartIcon(
                                                    value.tileChartKind,
                                                )}
                                            />
                                            <Text
                                                color={
                                                    value.invalidField
                                                        ? 'red'
                                                        : undefined
                                                }
                                            >
                                                {value.label}
                                            </Text>
                                        </Flex>
                                    }
                                    styles={{
                                        label: {
                                            paddingLeft: theme.spacing.xs,
                                        },
                                    }}
                                    checked={value.checked}
                                    onChange={(event) => {
                                        onChange(
                                            event.currentTarget.checked
                                                ? FilterActions.ADD
                                                : FilterActions.REMOVE,
                                            value.tileUuid,
                                            event.currentTarget.checked &&
                                                typeof value.selectedField ===
                                                    'string'
                                                ? {
                                                      fieldId:
                                                          value.selectedField,
                                                      tableName: 'mock_table',
                                                      isSqlColumn: true,
                                                  }
                                                : undefined,
                                        );
                                    }}
                                />
                            </Box>
                        </Tooltip>

                        {value.sortedFilters && (
                            <Box
                                ml="xl"
                                mt="sm"
                                display={!value.checked ? 'none' : 'auto'}
                            >
                                {isField(value.selectedField) ||
                                isCompiledCustomSqlDimension(
                                    value.selectedField,
                                ) ? (
                                    <FieldSelect
                                        size="xs"
                                        disabled={!value.checked}
                                        item={value.selectedField as Item}
                                        items={value.sortedFilters as Item[]}
                                        withinPortal={
                                            popoverProps?.withinPortal
                                        }
                                        onDropdownOpen={popoverProps?.onOpen}
                                        onDropdownClose={popoverProps?.onClose}
                                        onChange={(newField) => {
                                            onChange(
                                                FilterActions.ADD,
                                                value.tileUuid,
                                                newField &&
                                                    (isField(newField) ||
                                                        isCompiledCustomSqlDimension(
                                                            newField,
                                                        ))
                                                    ? {
                                                          fieldId:
                                                              getItemId(
                                                                  newField,
                                                              ),
                                                          tableName:
                                                              newField.table,
                                                      }
                                                    : undefined,
                                            );
                                        }}
                                    />
                                ) : (
                                    <Select
                                        w="100%"
                                        size="xs"
                                        searchable
                                        dropdownComponent="div"
                                        icon={undefined}
                                        allowDeselect={false}
                                        value={value.selectedField}
                                        data={value.sortedFilters as string[]}
                                        onChange={(newField) => {
                                            onChange(
                                                FilterActions.ADD,
                                                value.tileUuid,
                                                newField
                                                    ? {
                                                          fieldId: newField,
                                                          tableName:
                                                              'mock_table',
                                                          isSqlColumn: true,
                                                      }
                                                    : undefined,
                                            );
                                        }}
                                    />
                                )}
                            </Box>
                        )}
                    </Box>
                ))}
            </Stack>
        );
    };

    const isAllChecked = useMemo(
        () => tileTargetList.every(({ checked }) => checked),
        [tileTargetList],
    );
    const isIndeterminate = useMemo(
        () => !isAllChecked && tileTargetList.some(({ checked }) => checked),
        [tileTargetList, isAllChecked],
    );

    const tileList =
        tabs.length > 0 ? (
            <Accordion defaultValue={activeTabUuid} variant="contained">
                {tabs.map((tab, index) => (
                    <Flex align="center" gap="sm" key={index}>
                        <Accordion.Item
                            key={index}
                            value={tab.uuid}
                            style={{ flexGrow: 1 }}
                        >
                            <Accordion.Control
                                fw={500}
                                style={{ fontSize: '14px', fontWeight: 500 }}
                            >
                                {tab.name}
                            </Accordion.Control>
                            <Accordion.Panel>
                                <StackSubComponent
                                    tileList={filteredTileTargetList(tab.uuid)}
                                />
                            </Accordion.Panel>
                        </Accordion.Item>
                        <SwitchToggle
                            tileList={filteredTileTargetList(tab.uuid)}
                            tabName={tab.name}
                        />
                    </Flex>
                ))}
            </Accordion>
        ) : (
            <StackSubComponent tileList={tileTargetList} />
        );

    return (
        <Stack spacing="lg">
            <Checkbox
                size="xs"
                checked={isAllChecked}
                indeterminate={isIndeterminate}
                label={
                    <Text fw={500}>
                        {t(
                            'components_dashboard_filter.tile_filter.checkbox.part_1',
                        )}{' '}
                        {isIndeterminate
                            ? ` (${
                                  tileTargetList.filter((v) => v.checked).length
                              } ${t(
                                  'components_dashboard_filter.tile_filter.checkbox.part_2',
                              )})`
                            : ''}
                    </Text>
                }
                styles={{
                    label: {
                        paddingLeft: theme.spacing.xs,
                    },
                }}
                onChange={() => {
                    const tileUuids = tileTargetList.map((v) => v.tileUuid);
                    if (isIndeterminate) {
                        onToggleAll(false, tileUuids);
                    } else {
                        onToggleAll(!isAllChecked, tileUuids);
                    }
                }}
            />
            {tileList}
        </Stack>
    );
};

export default TileFilterConfiguration;

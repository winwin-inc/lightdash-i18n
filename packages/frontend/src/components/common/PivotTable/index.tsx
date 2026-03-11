import {
    formatItemValue,
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getItemId,
    isDimension,
    isField,
    isHexCodeColor,
    isNumericItem,
    isSummable,
    type BaseFilterRule,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type ConditionalFormattingRowFields,
    type ConditionalRuleLabel,
    type FilterableItem,
    type ItemsMap,
    type PivotData,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { Button, Group, Text, type BoxProps } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import {
    flexRender,
    getCoreRowModel,
    getExpandedRowModel,
    useReactTable,
    type GroupingState,
    type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
    WorkerRequest,
    WorkerResponse,
} from '../../../workers/conditionalFormatting.worker.types';
import isEqual from 'lodash/isEqual';
import last from 'lodash/last';
import { readableColor } from 'polished';
import React, {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
    getGroupingValuesAndSubtotalKey,
    getSubtotalValueFromGroup,
} from '../../../hooks/tableVisualization/getDataAndColumns';
import {
    formatCellContent,
    getFormattedValueCell,
} from '../../../hooks/useColumns';
import { getColorFromRange } from '../../../utils/colorUtils';
import { useConditionalRuleLabelFromItem } from '../Filters/FilterInputs/utils';
import Table from '../LightTable';
import { CELL_HEIGHT } from '../LightTable/constants';
import MantineIcon from '../MantineIcon';
import { ROW_NUMBER_COLUMN_ID } from '../Table/constants';
import { getGroupedRowModelLightdash } from '../Table/getGroupedRowModelLightdash';
import { columnHelper, type TableColumn } from '../Table/types';
import { countSubRows } from '../Table/utils';
import TotalCellMenu from './TotalCellMenu';
import ValueCellMenu from './ValueCellMenu';

type MenuCallbackProps = {
    isOpen: boolean;
    onClose: () => void;
    onCopy: () => void;
};

type RenderCallback = () => React.ReactNode;

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    cell: (props) => props.row.index + 1,
    enableGrouping: false,
};

const allPivotedSpacerColumn: TableColumn = {
    id: 'all-pivoted-spacer',
    cell: () => null,
    enableGrouping: false,
};

const VirtualizedArea: FC<{
    cellCount: number;
    height: number;
}> = ({ cellCount, height }) => {
    return (
        <Table.Row index={-1}>
            {[...Array(cellCount)].map((_, index) => (
                <Table.Cell
                    key={index}
                    h={height}
                    style={{
                        backgroundColor: 'var(--mantine-color-gray-0, #f8f9fa)',
                    }}
                />
            ))}
        </Table.Row>
    );
};

type CellFormatCacheValue = {
    backgroundColor?: string;
    fontColor?: string;
    tooltipContent?: string;
};

function getConditionalFormatCacheKey(
    fieldId: string,
    value: unknown,
    rowFields: ConditionalFormattingRowFields,
): string {
    const rowPart = Object.entries(rowFields)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v?.value}`)
        .join(';');
    return `${fieldId}:${JSON.stringify(value)}:${rowPart}`;
}

function getRowFieldsForRow(row: Row<ResultRow>): ConditionalFormattingRowFields {
    return row
        .getVisibleCells()
        .reduce<ConditionalFormattingRowFields>((acc, cell) => {
            const meta = cell.column.columnDef.meta;
            if (meta?.item) {
                const cellValue = cell.getValue() as ResultRow[0] | undefined;
                acc[getItemId(meta.item)] = {
                    field: meta.item,
                    value: cellValue?.value?.raw,
                };
            }
            return acc;
        }, {});
}

function computeCellFormatMapForRow(
    row: Row<ResultRow>,
    rowFields: ConditionalFormattingRowFields,
    cache: Map<string, CellFormatCacheValue>,
    minMaxMap: ConditionalFormattingMinMaxMap | undefined,
    conditionalFormattings: ConditionalFormattingConfig[],
    getConditionalRuleLabel: (
        rule: BaseFilterRule,
        item: FilterableItem,
    ) => ConditionalRuleLabel,
): Record<string, CellFormatCacheValue> {
    const map: Record<string, CellFormatCacheValue> = {};
    row.getVisibleCells().forEach((cell) => {
        const meta = cell.column.columnDef.meta;
        const field = meta?.item;
        const rawValue = (cell.getValue() as ResultRow[0] | undefined)?.value
            ?.raw;
        const fieldId = field ? getItemId(field) : '';
        const cacheKey = getConditionalFormatCacheKey(
            fieldId,
            rawValue,
            rowFields,
        );
        const cached = cache.get(cacheKey);
        if (cached) {
            map[cell.id] = cached;
            return;
        }
        const config = getConditionalFormattingConfig({
            field,
            value: rawValue,
            minMaxMap,
            conditionalFormattings,
            rowFields,
        });
        const color = getConditionalFormattingColor({
            field,
            value: rawValue,
            minMaxMap,
            config,
            getColorFromRange,
        });
        const colorApplyTo = config?.colorApplyTo ?? 'background';
        let backgroundColor: string | undefined;
        let fontColor: string | undefined;
        if (color) {
            if (colorApplyTo === 'font') {
                fontColor = color;
            } else {
                backgroundColor = color;
                fontColor =
                    readableColor(color) === 'white' ? 'white' : undefined;
            }
        } else if (meta?.frozen) {
            backgroundColor = 'white';
        }
        const tooltipContent = getConditionalFormattingDescription(
            field,
            config,
            rowFields,
            getConditionalRuleLabel,
        );
        const value: CellFormatCacheValue = {
            backgroundColor,
            fontColor,
            tooltipContent,
        };
        map[cell.id] = value;
        cache.set(cacheKey, value);
    });
    return map;
}

type PivotTableRowProps = {
    rowIndex: number;
    row: Row<ResultRow>;
    data: PivotData;
    conditionalFormattings: ConditionalFormattingConfig[];
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    getField: (fieldId: string) => ItemsMap[string] | undefined;
    getConditionalRuleLabelFromItem: (
        rule: BaseFilterRule,
        item: FilterableItem,
    ) => ConditionalRuleLabel;
    getUnderlyingFieldValues: (
        rowIndex: number,
        colIndex: number,
    ) => Record<string, ResultValue>;
    formatCacheRef: React.MutableRefObject<Map<string, CellFormatCacheValue>>;
    /** 是否在视口优先区间内，优先行下一帧算格式，其余延后算 */
    isPriorityRow: boolean;
    /** 可选：用 Worker 算条件格式，主线程只补 tooltip */
    requestFormatFromWorker?: (
        payload: WorkerRequest,
        onResult: (map: Record<string, { backgroundColor?: string; fontColor?: string }>) => void,
    ) => void;
    /** 取消该行的 worker 回调（effect 清理时调用） */
    cancelFormatRequest?: (rowIndex: number) => void;
};

const PivotTableRow: FC<PivotTableRowProps> = memo(
    ({
        rowIndex,
        row,
        data,
        conditionalFormattings,
        minMaxMap,
        getField,
        getConditionalRuleLabelFromItem,
        getUnderlyingFieldValues,
        formatCacheRef,
        isPriorityRow,
        requestFormatFromWorker,
        cancelFormatRequest,
    }) => {
        const getConditionalRuleLabelFromItemRef = useRef(
            getConditionalRuleLabelFromItem,
        );
        getConditionalRuleLabelFromItemRef.current =
            getConditionalRuleLabelFromItem;

        const rowFields = useMemo(
            () =>
                row
                    .getVisibleCells()
                    .reduce<ConditionalFormattingRowFields>((acc, cell) => {
                        const meta = cell.column.columnDef.meta;
                        if (meta?.item) {
                            const cellValue = cell.getValue() as
                                | ResultRow[0]
                                | undefined;
                            acc[getItemId(meta.item)] = {
                                field: meta.item,
                                value: cellValue?.value?.raw,
                            };
                        }
                        return acc;
                    }, {}),
            [row],
        );

        const [cellFormatMap, setCellFormatMap] = useState<
            Record<string, CellFormatCacheValue>
        >({});
        const deferredCellFormatMap = useDeferredValue(cellFormatMap);
        const idleIdRef = useRef<number | null>(null);

        useEffect(() => {
            const runCompute = () => {
                const map = computeCellFormatMapForRow(
                    row,
                    rowFields,
                    formatCacheRef.current,
                    minMaxMap,
                    conditionalFormattings,
                    getConditionalRuleLabelFromItemRef.current,
                );
                setCellFormatMap(map);
            };

            const applyWorkerResult = (
                map: Record<string, { backgroundColor?: string; fontColor?: string }>,
            ) => {
                const withTooltip: Record<string, CellFormatCacheValue> = {};
                row.getVisibleCells().forEach((cell) => {
                    const v = map[cell.id];
                    if (!v) return;
                    const meta = cell.column.columnDef.meta;
                    const field = meta?.item;
                    const rawValue = (cell.getValue() as ResultRow[0] | undefined)?.value?.raw;
                    const config = getConditionalFormattingConfig({
                        field,
                        value: rawValue,
                        minMaxMap,
                        conditionalFormattings,
                        rowFields,
                    });
                    const tooltipContent = getConditionalFormattingDescription(
                        field,
                        config,
                        rowFields,
                        getConditionalRuleLabelFromItemRef.current,
                    );
                    withTooltip[cell.id] = { ...v, tooltipContent };
                });
                setCellFormatMap(withTooltip);
            };

            if (requestFormatFromWorker) {
                const cells = row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    const item = meta?.item;
                    const cellValue = cell.getValue() as ResultRow[0] | undefined;
                    return {
                        cellId: cell.id,
                        fieldId: item ? getItemId(item) : '',
                        rawValue: cellValue?.value?.raw,
                        field: item,
                    };
                });
                const cacheSnapshot: Record<
                    string,
                    { backgroundColor?: string; fontColor?: string }
                > = {};
                formatCacheRef.current.forEach((v, k) => {
                    cacheSnapshot[k] = {
                        backgroundColor: v.backgroundColor,
                        fontColor: v.fontColor,
                    };
                });
                const payload: WorkerRequest = {
                    rowIndex,
                    cells,
                    rowFields,
                    minMaxMap,
                    conditionalFormattings,
                    cacheSnapshot,
                };
                requestFormatFromWorker(payload, applyWorkerResult);
                return () => {
                    cancelFormatRequest?.(rowIndex);
                };
            }

            const rafId = requestAnimationFrame(() => {
                if (isPriorityRow) {
                    runCompute();
                } else if (typeof requestIdleCallback !== 'undefined') {
                    idleIdRef.current = requestIdleCallback(runCompute, {
                        timeout: 32,
                    });
                } else {
                    runCompute();
                }
            });
            return () => {
                cancelAnimationFrame(rafId);
                if (
                    idleIdRef.current != null &&
                    typeof cancelIdleCallback !== 'undefined'
                ) {
                    cancelIdleCallback(idleIdRef.current);
                    idleIdRef.current = null;
                }
            };
        }, [
            row,
            rowIndex,
            conditionalFormattings,
            minMaxMap,
            rowFields,
            formatCacheRef,
            isPriorityRow,
            requestFormatFromWorker,
            cancelFormatRequest,
        ]);

        const toggleExpander = row.getToggleExpandedHandler();

        return (
            <Table.Row index={rowIndex}>
                {row.getVisibleCells().map((cell, colIndex) => {
                    const meta = cell.column.columnDef.meta;
                    const isRowTotal = meta?.type === 'rowTotal';
                    let item = meta?.item;
                    if (item && isDimension(item)) {
                        const underlyingId = data.indexValues[rowIndex]?.find(
                            (indexValue) => indexValue.type === 'label',
                        )?.fieldId;
                        item = underlyingId ? getField(underlyingId) : item;
                    }
                    const fullValue = cell.getValue() as ResultRow[0];
                    const value = fullValue?.value;
                    const format = deferredCellFormatMap[cell.id];
                    const expanderFontColor = format?.fontColor
                        ? format.fontColor
                        : format?.backgroundColor
                        ? readableColor(format.backgroundColor) === 'white'
                            ? 'white'
                            : undefined
                        : undefined;
                    const suppressContextMenu =
                        (value === undefined || cell.getIsPlaceholder()) &&
                        !cell.getIsAggregated() &&
                        !cell.getIsGrouped();
                    const allowInteractions = suppressContextMenu
                        ? undefined
                        : !!value?.formatted;
                    const TableCellComponent = isRowTotal
                        ? Table.CellHead
                        : Table.Cell;
                    const cellStyle = meta?.style;

                    return (
                        <TableCellComponent
                            key={`value-${rowIndex}-${colIndex}`}
                            withAlignRight={isNumericItem(item)}
                            withColor={format?.fontColor}
                            withBoldFont={meta?.type === 'label'}
                            withBackground={format?.backgroundColor}
                            withTooltip={format?.tooltipContent}
                            withInteractions={allowInteractions}
                            withValue={value?.formatted}
                            style={cellStyle}
                            withMenu={(
                                { isOpen, onClose, onCopy }: MenuCallbackProps,
                                render: RenderCallback,
                            ) => (
                                <ValueCellMenu
                                    opened={isOpen}
                                    rowIndex={rowIndex}
                                    colIndex={colIndex}
                                    item={item}
                                    value={value}
                                    getUnderlyingFieldValues={
                                        isRowTotal
                                            ? undefined
                                            : (
                                                  colIndex: number,
                                                  rIndex: number,
                                              ) =>
                                                  getUnderlyingFieldValues(
                                                      rIndex,
                                                      colIndex,
                                                  )
                                    }
                                    onClose={onClose}
                                    onCopy={onCopy}
                                >
                                    {render()}
                                </ValueCellMenu>
                            )}
                        >
                            {cell.getIsGrouped() ? (
                                <Group spacing="two" noWrap>
                                    <Button
                                        compact
                                        size="xs"
                                        variant="subtle"
                                        styles={(theme) => ({
                                            root: {
                                                height: 'unset',
                                                paddingLeft: theme.spacing.two,
                                                paddingRight: theme.spacing.xxs,
                                                fontFamily:
                                                    "'Inter', sans-serif",
                                                fontFeatureSettings: "'tnum'",
                                            },
                                            leftIcon: { marginRight: 0 },
                                        })}
                                        onClick={(
                                            e: React.MouseEvent<HTMLButtonElement>,
                                        ) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            toggleExpander();
                                        }}
                                        leftIcon={
                                            <MantineIcon
                                                size={14}
                                                icon={
                                                    row.getIsExpanded()
                                                        ? IconChevronDown
                                                        : IconChevronRight
                                                }
                                            />
                                        }
                                        style={{
                                            color:
                                                expanderFontColor ?? 'inherit',
                                        }}
                                    >
                                        ({countSubRows(row as Row<ResultRow>)})
                                    </Button>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                    )}
                                </Group>
                            ) : cell.getIsAggregated() ? (
                                flexRender(
                                    cell.column.columnDef.aggregatedCell ??
                                        cell.column.columnDef.cell,
                                    cell.getContext(),
                                )
                            ) : cell.getIsPlaceholder() ? null : (
                                flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                )
                            )}
                        </TableCellComponent>
                    );
                })}
            </Table.Row>
        );
    },
);
PivotTableRow.displayName = 'PivotTableRow';

type PivotTableBodyProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    rows: Row<ResultRow>[];
    data: PivotData;
    hideRowNumbers: boolean;
    conditionalFormattings: ConditionalFormattingConfig[];
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    getField: (fieldId: string) => ItemsMap[string] | undefined;
    getConditionalRuleLabelFromItem: (
        rule: BaseFilterRule,
        item: FilterableItem,
    ) => ConditionalRuleLabel;
    getUnderlyingFieldValues: (
        rowIndex: number,
        colIndex: number,
    ) => Record<string, ResultValue>;
};

/** 独立组件内使用 useVirtualizer，滚动时仅 body 重渲染，表头/表尾不参与，减轻透视表卡顿 */
const PivotTableBody: FC<PivotTableBodyProps> = ({
    containerRef,
    rows,
    data,
    hideRowNumbers,
    conditionalFormattings,
    minMaxMap,
    getField,
    getConditionalRuleLabelFromItem,
    getUnderlyingFieldValues,
}) => {
    const formatCacheRef = useRef<Map<string, CellFormatCacheValue>>(new Map());
    const workerRef = useRef<Worker | null>(null);
    const [workerReady, setWorkerReady] = useState(false);
    const pendingCallbacksRef = useRef<
        Map<number, (map: Record<string, { backgroundColor?: string; fontColor?: string }>) => void>
    >(new Map());

    useEffect(() => {
        formatCacheRef.current.clear();
    }, [conditionalFormattings, minMaxMap]);

    useEffect(() => {
        try {
            workerRef.current = new Worker(
                new URL(
                    '../../../workers/conditionalFormatting.worker.ts',
                    import.meta.url,
                ),
                { type: 'module' },
            );
            workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
                const { rowIndex, map, cacheUpdates, error } = e.data;
                if (error) {
                    const cb = pendingCallbacksRef.current.get(rowIndex);
                    if (cb) {
                        pendingCallbacksRef.current.delete(rowIndex);
                        cb({});
                    }
                    return;
                }
                Object.entries(cacheUpdates).forEach(([k, v]) => {
                    if (v && typeof v === 'object')
                        formatCacheRef.current.set(k, { ...v, tooltipContent: undefined });
                });
                const cb = pendingCallbacksRef.current.get(rowIndex);
                if (cb) {
                    pendingCallbacksRef.current.delete(rowIndex);
                    cb(map);
                }
            };
            setWorkerReady(true);
        } catch {
            workerRef.current = null;
        }
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    const requestFormatFromWorker = useCallback(
        (
            payload: WorkerRequest,
            onResult: (map: Record<string, { backgroundColor?: string; fontColor?: string }>) => void,
        ) => {
            if (!workerRef.current) return;
            pendingCallbacksRef.current.set(payload.rowIndex, onResult);
            workerRef.current.postMessage(payload);
        },
        [],
    );

    const cancelFormatRequest = useCallback((rowIndex: number) => {
        pendingCallbacksRef.current.delete(rowIndex);
    }, []);

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => containerRef.current,
        count: rows.length,
        estimateSize: () => CELL_HEIGHT,
        overscan: 18,
        // 3.13+：关闭 flushSync，滚动时由 React 批量更新，减轻主线程阻塞
        useFlushSync: false,
    } as Parameters<typeof useVirtualizer>[0]);
    const virtualRows = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows[virtualRows.length - 1]?.end ?? 0)
            : 0;
    const cellsCountWithRowNumber = (hideRowNumbers ? 0 : 1) + data.cellsCount;

    const priorityRange = useMemo(() => {
        if (virtualRows.length === 0) return { first: 0, last: -1 };
        const start = Math.floor(virtualRows.length * 0.25);
        const end = Math.ceil(virtualRows.length * 0.75);
        return {
            first: virtualRows[start]?.index ?? 0,
            last:
                virtualRows[Math.min(end, virtualRows.length - 1)]?.index ?? 0,
        };
    }, [virtualRows]);

    return (
        <Table.Body>
            {paddingTop > 0 && (
                <VirtualizedArea
                    cellCount={cellsCountWithRowNumber}
                    height={paddingTop}
                />
            )}
            {virtualRows.map((virtualRow) => {
                const rowIndex = virtualRow.index;
                const row = rows[rowIndex];
                if (!row) return null;
                const isPriorityRow =
                    rowIndex >= priorityRange.first &&
                    rowIndex <= priorityRange.last;
                return (
                    <PivotTableRow
                        key={row.id}
                        rowIndex={rowIndex}
                        row={row}
                        data={data}
                        conditionalFormattings={conditionalFormattings}
                        minMaxMap={minMaxMap}
                        getField={getField}
                        getConditionalRuleLabelFromItem={
                            getConditionalRuleLabelFromItem
                        }
                        getUnderlyingFieldValues={getUnderlyingFieldValues}
                        formatCacheRef={formatCacheRef}
                        isPriorityRow={isPriorityRow}
                        requestFormatFromWorker={
                            workerReady ? requestFormatFromWorker : undefined
                        }
                        cancelFormatRequest={cancelFormatRequest}
                    />
                );
            })}
            {paddingBottom > 0 && (
                <VirtualizedArea
                    cellCount={cellsCountWithRowNumber}
                    height={paddingBottom}
                />
            )}
        </Table.Body>
    );
};

type PivotTableProps = BoxProps & // TODO: remove this
    React.RefAttributes<HTMLTableElement> & {
        data: PivotData;
        conditionalFormattings: ConditionalFormattingConfig[];
        minMaxMap: ConditionalFormattingMinMaxMap | undefined;
        hideRowNumbers: boolean;
        getFieldLabel: (fieldId: string) => string | undefined;
        getField: (fieldId: string) => ItemsMap[string] | undefined;
        showSubtotals?: boolean;
        columnProperties?: Record<string, ColumnProperties>;
    };

const PivotTable: FC<PivotTableProps> = ({
    data,
    conditionalFormattings,
    minMaxMap = {},
    hideRowNumbers = false,
    getFieldLabel,
    getField,
    className,
    showSubtotals = false,
    columnProperties = {},
    ...tableProps
}) => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const [grouping, setGrouping] = React.useState<GroupingState>([]);

    const getConditionalRuleLabelFromItem = useConditionalRuleLabelFromItem();

    const hasColumnTotals = data.pivotConfig.columnTotals;

    const hasRowTotals = data.pivotConfig.rowTotals;

    const metricIdsForRows = useMemo(() => {
        if (!data.pivotConfig.metricsAsRows || !data.indexValues?.length)
            return [];
        const ids = new Set<string>();
        data.indexValues.forEach((row) => {
            const labelCell = row.find(
                (c): c is { type: 'label'; fieldId: string } =>
                    c.type === 'label',
            );
            if (labelCell) ids.add(labelCell.fieldId);
        });
        return Array.from(ids);
    }, [data.pivotConfig.metricsAsRows, data.indexValues]);

    const { columns, columnOrder } = useMemo(() => {
        // Pivoting all dimensions requires a spacer column under the pivoted headers.
        const allDimensionsPivoted =
            data.indexValueTypes.length === 0 &&
            data.titleFields[0].length === 1;

        const indexPlaceholders: Record<string, ResultValue>[] = Array(
            data.indexValueTypes.length,
        ).fill({});

        const headerPlaceholders: Record<string, ResultValue>[] = Array(
            data.headerValues.length,
        ).fill({});

        const headerInfoForColumns = data.headerValues.reduce<
            Array<Record<string, ResultValue>>
        >((acc, headerRow) => {
            return headerRow.map((headerColValue, headerColIndex) =>
                'value' in headerColValue
                    ? {
                          ...acc[headerColIndex],
                          [headerColValue.fieldId]: headerColValue.value,
                      }
                    : acc[headerColIndex],
            );
        }, headerPlaceholders);

        const finalHeaderInfoForColumns = [
            ...indexPlaceholders,
            ...headerInfoForColumns,
        ];

        const newColumnOrder: string[] = [];
        if (!hideRowNumbers) newColumnOrder.push(ROW_NUMBER_COLUMN_ID);
        if (allDimensionsPivoted)
            newColumnOrder.push(allPivotedSpacerColumn.id);

        let newColumns = data.retrofitData.pivotColumnInfo.map(
            (col, colIndex) => {
                newColumnOrder.push(col.fieldId);

                const itemId = col.underlyingId || col.baseId || col.fieldId;
                const item = itemId ? getField(itemId) : undefined;

                // Check if this column should have bar chart display
                const hasBarDisplay =
                    itemId &&
                    columnProperties?.[itemId]?.displayStyle === 'bar';

                const column: TableColumn = columnHelper.accessor(
                    (row: ResultRow) => {
                        return row[col.fieldId];
                    },
                    {
                        id: col.fieldId,
                        cell: getFormattedValueCell,
                        meta: {
                            item: item,
                            type: col.columnType,
                            headerInfo:
                                colIndex < finalHeaderInfoForColumns.length
                                    ? finalHeaderInfoForColumns[colIndex]
                                    : undefined,
                            // Set fixed width for bar chart columns to ensure consistent bar widths
                            // Same percentage values will display the same bar width across all cells
                            // Text is overlaid on the bar, so fixed width ensures visual consistency
                            ...(hasBarDisplay && {
                                style: {
                                    width: '160px',
                                    minWidth: '160px',
                                    maxWidth: '160px',
                                },
                            }),
                        },
                        aggregatedCell: (info) => {
                            if (info.row.getIsGrouped()) {
                                const groupingValuesAndSubtotalKey =
                                    getGroupingValuesAndSubtotalKey(info);

                                if (!groupingValuesAndSubtotalKey) {
                                    return null;
                                }

                                const { groupingValues, subtotalGroupKey } =
                                    groupingValuesAndSubtotalKey;

                                // Get the pivoted header values for the column
                                const pivotedHeaderValues =
                                    finalHeaderInfoForColumns[colIndex];

                                // Find the subtotal for the row, this is used to find the subtotal in the groupedSubtotals object
                                const subtotal = data.groupedSubtotals?.[
                                    subtotalGroupKey
                                ]?.find((sub) => {
                                    try {
                                        return (
                                            // All grouping values in the row must match the subtotal values
                                            Object.keys(groupingValues).every(
                                                (key) => {
                                                    return (
                                                        groupingValues[key]
                                                            ?.value.raw ===
                                                        sub[key]
                                                    );
                                                },
                                            ) &&
                                            // All pivoted header values in the row must match the subtotal values
                                            Object.keys(
                                                pivotedHeaderValues,
                                            ).every((key) => {
                                                return (
                                                    pivotedHeaderValues[key]
                                                        ?.raw === sub[key]
                                                );
                                            })
                                        );
                                    } catch (e) {
                                        console.error(e);
                                        return false;
                                    }
                                });

                                const subtotalValue = getSubtotalValueFromGroup(
                                    subtotal,
                                    col.baseId ?? col.fieldId,
                                );

                                if (subtotalValue === null) {
                                    return null;
                                }

                                return (
                                    <Text span fw={600}>
                                        {formatItemValue(item, subtotalValue)}
                                    </Text>
                                );
                            }
                        },
                    },
                );
                return column;
            },
        );

        if (allDimensionsPivoted)
            newColumns = [allPivotedSpacerColumn, ...newColumns];
        if (!hideRowNumbers) newColumns = [rowColumn, ...newColumns];

        return { columns: newColumns, columnOrder: newColumnOrder };
    }, [data, hideRowNumbers, getField, columnProperties]);

    const getMetricIdByLabel = useCallback(
        (label: string) =>
            metricIdsForRows.find((id) => getFieldLabel(id) === label),
        [metricIdsForRows, getFieldLabel],
    );

    const table = useReactTable({
        data: data.retrofitData.allCombinedData,
        columns: columns,
        state: {
            grouping,
            columnOrder: columnOrder,
            columnPinning: {
                left: [ROW_NUMBER_COLUMN_ID],
            },
        },
        onGroupingChange: setGrouping,
        getExpandedRowModel: getExpandedRowModel(),
        getGroupedRowModel: getGroupedRowModelLightdash(),
        getCoreRowModel: getCoreRowModel(),
        meta: {
            columnProperties,
            minMaxMap,
            getField,
            pivotConfig: data.pivotConfig,
            getMetricIdByLabel,
        },
    });

    const { rows } = table.getRowModel();

    const getColumnTotalValueFromAxis = useCallback(
        (total: unknown, colIndex: number): ResultValue | null => {
            const value = last(data.headerValues)?.[colIndex];
            if (!value || !value.fieldId)
                throw new Error(
                    t('components_common_pivot_table.invalid_pivot_data'),
                );

            const item = getField(value.fieldId);
            if (!isSummable(item)) {
                return null;
            }
            const formattedValue = formatItemValue(item, total);

            return {
                raw: total,
                formatted: formattedValue,
            };
        },
        [data.headerValues, getField, t],
    );

    const getMetricAsRowColumnTotalValueFromAxis = useCallback(
        (total: unknown, rowIndex: number): ResultValue => {
            const value = last(data.columnTotalFields?.[rowIndex]);
            if (!value || !value.fieldId)
                throw new Error(
                    t('components_common_pivot_table.invalid_pivot_data'),
                );

            const item = getField(value.fieldId);

            const formattedValue = formatItemValue(item, total);

            return {
                raw: total,
                formatted: formattedValue,
            };
        },
        [data.columnTotalFields, getField, t],
    );

    const getUnderlyingFieldValues = useCallback(
        (rowIndex: number, colIndex: number): Record<string, ResultValue> => {
            const visibleCells = rows[rowIndex].getVisibleCells();
            const visibleCell = visibleCells[colIndex];
            const item = visibleCell.column.columnDef.meta?.item;
            const fullItemValue = visibleCell.getValue() as ResultRow[0];
            const itemValue = fullItemValue.value;
            let underlyingValues =
                isField(item) && itemValue
                    ? { [getItemId(item)]: itemValue }
                    : {};
            visibleCells.forEach((cell, cellIndex) => {
                if (cell.column.columnDef.meta?.type === 'indexValue') {
                    if (cell.column.columnDef.id) {
                        const fullValue = cell.getValue() as
                            | ResultRow[0]
                            | undefined;

                        if (fullValue) {
                            underlyingValues[cell.column.columnDef.id] =
                                fullValue.value;
                        }
                    }
                } else if (cell.column.columnDef.meta?.type === 'label') {
                    const info = data.indexValues[rowIndex].find(
                        (indexValue) => indexValue.type === 'label',
                    );
                    if (info) underlyingValues[info.fieldId] = itemValue;
                } else if (
                    colIndex === cellIndex &&
                    cell.column.columnDef.meta?.headerInfo
                ) {
                    underlyingValues = {
                        ...underlyingValues,
                        ...cell.column.columnDef.meta.headerInfo,
                    };
                }
            });
            return underlyingValues;
        },
        [rows, data.indexValues],
    );

    useEffect(() => {
        // TODO: Remove code duplicated from non-pivot table version.
        if (showSubtotals) {
            const groupedColumns = data.indexValueTypes.map(
                (valueType) => valueType.fieldId,
            );

            const sortedColumns = table
                .getState()
                .columnOrder.reduce<string[]>((acc, sortedId) => {
                    return groupedColumns.includes(sortedId)
                        ? [...acc, sortedId]
                        : acc;
                }, [])
                // The last dimension column essentially groups rows for each unique value in that column.
                // Grouping on it would result in many useless expandable groups containing just one item.
                .slice(0, -1);

            if (!isEqual(sortedColumns, table.getState().grouping)) {
                table.setGrouping(sortedColumns);
            }
        } else {
            if (table.getState().grouping.length > 0) {
                table.resetGrouping();
            }
        }
    }, [showSubtotals, data.indexValueTypes, table, columnOrder]);

    return (
        <Table
            miw="100%"
            className={className}
            {...tableProps}
            containerRef={containerRef}
        >
            <Table.Head withSticky>
                {data.headerValues.map((headerValues, headerRowIndex) => (
                    <Table.Row
                        key={`header-row-${headerRowIndex}`}
                        index={headerRowIndex}
                    >
                        {/* shows empty cell if row numbers are visible */}
                        {hideRowNumbers ? null : headerRowIndex <
                          data.headerValues.length - 1 ? (
                            <Table.Cell withMinimalWidth />
                        ) : (
                            <Table.CellHead withMinimalWidth withBoldFont>
                                #
                            </Table.CellHead>
                        )}
                        {/* renders the title labels */}
                        {data.titleFields[headerRowIndex].map(
                            (titleField, titleFieldIndex) => {
                                const field = titleField?.fieldId
                                    ? getField(titleField?.fieldId)
                                    : undefined;

                                const isEmpty = !titleField?.fieldId;

                                const isHeaderTitle =
                                    titleField?.direction === 'header';

                                return isEmpty ? (
                                    <Table.Cell
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        withMinimalWidth
                                    />
                                ) : (
                                    <Table.CellHead
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        withAlignRight={isHeaderTitle}
                                        withMinimalWidth
                                        withBoldFont
                                        withTooltip={
                                            isField(field)
                                                ? field.description
                                                : undefined
                                        }
                                    >
                                        {titleField?.fieldId
                                            ? getFieldLabel(titleField?.fieldId)
                                            : undefined}
                                    </Table.CellHead>
                                );
                            },
                        )}
                        {/* renders the header values or labels */}
                        {headerValues.map((headerValue, headerColIndex) => {
                            const isLabel = headerValue.type === 'label';
                            const field = getField(headerValue.fieldId);

                            const description =
                                isLabel && isField(field)
                                    ? field.description
                                    : undefined;

                            // Get column width from table column meta if this is the last header row
                            const isLastHeaderRow =
                                headerRowIndex === data.headerValues.length - 1;
                            let columnStyle: React.CSSProperties | undefined;
                            if (isLastHeaderRow && !isLabel) {
                                const tableColumn = table
                                    .getAllColumns()
                                    .find(
                                        (col) => col.id === headerValue.fieldId,
                                    );
                                columnStyle =
                                    tableColumn?.columnDef.meta?.style;
                            }

                            return isLabel || headerValue.colSpan > 0 ? (
                                <Table.CellHead
                                    key={`header-${headerRowIndex}-${headerColIndex}`}
                                    withBoldFont={isLabel}
                                    withTooltip={description}
                                    colSpan={
                                        isLabel
                                            ? undefined
                                            : headerValue.colSpan
                                    }
                                    style={columnStyle}
                                >
                                    {isLabel
                                        ? getFieldLabel(headerValue.fieldId)
                                        : formatCellContent(headerValue)}
                                </Table.CellHead>
                            ) : null;
                        })}
                        {/* render the total label */}
                        {hasRowTotals
                            ? data.rowTotalFields?.[headerRowIndex].map(
                                  (totalLabel, headerColIndex) =>
                                      totalLabel ? (
                                          <Table.CellHead
                                              key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                              withBoldFont
                                              withMinimalWidth
                                          >
                                              {totalLabel.fieldId
                                                  ? `${t(
                                                        'components_common_pivot_table.total',
                                                    )} ${getFieldLabel(
                                                        totalLabel.fieldId,
                                                    )}`
                                                  : `${t(
                                                        'components_common_pivot_table.total',
                                                    )}`}
                                          </Table.CellHead>
                                      ) : (
                                          <Table.Cell
                                              key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                              withMinimalWidth
                                          />
                                      ),
                              )
                            : null}
                    </Table.Row>
                ))}
            </Table.Head>

            <PivotTableBody
                containerRef={containerRef}
                rows={rows}
                data={data}
                hideRowNumbers={hideRowNumbers}
                conditionalFormattings={conditionalFormattings}
                minMaxMap={minMaxMap}
                getField={getField}
                getConditionalRuleLabelFromItem={
                    getConditionalRuleLabelFromItem
                }
                getUnderlyingFieldValues={getUnderlyingFieldValues}
            />

            {hasColumnTotals ? (
                <Table.Footer withSticky>
                    {data.columnTotals?.map((row, totalRowIndex) => (
                        <Table.Row
                            key={`column-total-${totalRowIndex}`}
                            index={totalRowIndex}
                        >
                            {/* shows empty cell if row numbers are visible */}
                            {hideRowNumbers ? null : <Table.Cell />}

                            {/* render the total label */}
                            {data.columnTotalFields?.[totalRowIndex].map(
                                (totalLabel, totalColIndex) =>
                                    totalLabel ? (
                                        <Table.CellHead
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                            withAlignRight
                                            withBoldFont
                                        >
                                            {totalLabel.fieldId
                                                ? `${t(
                                                      'components_common_pivot_table.total',
                                                  )} ${getFieldLabel(
                                                      totalLabel.fieldId,
                                                  )}`
                                                : `${t(
                                                      'components_common_pivot_table.total',
                                                  )}`}
                                        </Table.CellHead>
                                    ) : (
                                        <Table.Cell
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                        />
                                    ),
                            )}

                            {row.map((total, totalColIndex) => {
                                const value = data.pivotConfig.metricsAsRows
                                    ? getMetricAsRowColumnTotalValueFromAxis(
                                          total,
                                          totalRowIndex,
                                      )
                                    : getColumnTotalValueFromAxis(
                                          total,
                                          totalColIndex,
                                      );
                                return value ? (
                                    <Table.CellHead
                                        key={`column-total-${totalRowIndex}-${totalColIndex}`}
                                        withAlignRight
                                        withBoldFont
                                        withInteractions
                                        withValue={value.formatted}
                                        withMenu={(
                                            {
                                                isOpen,
                                                onClose,
                                                onCopy,
                                            }: MenuCallbackProps,
                                            render: RenderCallback,
                                        ) => (
                                            <TotalCellMenu
                                                opened={isOpen}
                                                onClose={onClose}
                                                onCopy={onCopy}
                                            >
                                                {render()}
                                            </TotalCellMenu>
                                        )}
                                    >
                                        {value.formatted}
                                    </Table.CellHead>
                                ) : (
                                    <Table.Cell
                                        key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                    />
                                );
                            })}

                            {hasRowTotals
                                ? data.rowTotalFields?.[0].map((_, index) => (
                                      <Table.Cell
                                          key={`footer-empty-${totalRowIndex}-${index}`}
                                      />
                                  ))
                                : null}
                        </Table.Row>
                    ))}
                </Table.Footer>
            ) : null}
        </Table>
    );
};

export default PivotTable;

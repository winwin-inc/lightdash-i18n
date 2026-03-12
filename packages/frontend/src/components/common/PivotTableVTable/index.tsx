/**
 * 透视表 v2：基于 VTable（Canvas）的高性能实现
 * 使用 @visactor/vtable 的 imperative API，避免 @visactor/react-vtable 在 React 19 下的 react-reconciler 兼容问题。
 */
import type {
    ColumnProperties,
    ConditionalFormattingConfig,
    ConditionalFormattingMinMaxMap,
    ItemsMap,
    PivotData,
    ResultRow,
} from '@lightdash/common';
import {
    ListTable,
    TABLE_EVENT_TYPE,
    type ListTableConstructorOptions,
} from '@visactor/vtable';
import { Box, Menu, Portal, type BoxProps } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type Cell } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';

import { useConditionalRuleLabelFromItem } from '../Filters/FilterInputs/utils';
import { type CellContextMenuProps } from '../Table/types';
import {
    computePivotFormatMap,
    type CellFormatValue,
} from './pivotFormatMap';
import {
    pivotDataToVTable,
    type VTableColumnDef,
    type VTableColumnGroup,
    type VTableListOption,
} from './pivotDataToVTable';

import { ROW_NUMBER_COLUMN_ID } from '../Table/constants';

const ALL_PIVOTED_SPACER_FIELD = '__pivot_spacer__';

/**
 * 对列树递归添加条件格式 style；条形图列（progressbar 或 customRender）不设置 bgColor，避免盖住条形图
 */
function addConditionalStyleToColumns(
    cols: (VTableColumnDef | VTableColumnGroup)[],
    formatMap: Map<string, { backgroundColor?: string; fontColor?: string }>,
    dataRowCount: number,
    startIndex: number,
): { result: (VTableColumnDef | VTableColumnGroup)[]; nextIndex: number } {
    const result: (VTableColumnDef | VTableColumnGroup)[] = [];
    let idx = startIndex;
    for (const c of cols) {
        if ('field' in c) {
            const fieldId = c.field;
            const isBarColumn = c.cellType === 'progressbar' || !!(c as VTableColumnDef).customRender;
            const staticStyle =
                typeof c.style === 'object' && c.style
                    ? (c.style as Record<string, string>)
                    : undefined;
            const styleFn =
                formatMap.size > 0 && fieldId
                    ? (args: { row: number; col: number }) => {
                          if (args.row >= dataRowCount)
                              return staticStyle ?? {};
                          const key = `${args.row}-${fieldId}`;
                          const format = formatMap.get(key);
                          const style: Record<string, string> = {
                              ...staticStyle,
                          };
                          if (format?.fontColor) style.color = format.fontColor;
                          if (!isBarColumn && format?.backgroundColor)
                              style.bgColor = format.backgroundColor;
                          return style;
                      }
                    : staticStyle
                      ? () => staticStyle
                      : undefined;
            result.push({
                ...c,
                ...(styleFn && { style: styleFn }),
            });
            idx += 1;
        } else {
            const { result: children, nextIndex } = addConditionalStyleToColumns(
                c.columns,
                formatMap,
                dataRowCount,
                idx,
            );
            result.push({ ...c, columns: children });
            idx = nextIndex;
        }
    }
    return { result, nextIndex: idx };
}

/** 扁平化列树得到叶子列顺序，用于 colIndex -> fieldId */
function flattenLeafColumns(
    cols: (VTableColumnDef | VTableColumnGroup)[],
): VTableColumnDef[] {
    const out: VTableColumnDef[] = [];
    for (const c of cols) {
        if ('field' in c) out.push(c);
        else out.push(...flattenLeafColumns(c.columns));
    }
    return out;
}

/**
 * 列树深度 = 表头行数（VTable 中 row 0..depth-1 为表头，body 从 row=depth 开始）
 */
function getHeaderRowCount(cols: (VTableColumnDef | VTableColumnGroup)[]): number {
    let max = 1;
    for (const c of cols) {
        if (!('field' in c)) {
            max = Math.max(max, 1 + getHeaderRowCount(c.columns));
        }
    }
    return max;
}

/** VTable 实例：含 on、updateOption、getCopyValue */
type ListTableInstance = {
    on: (event: string, cb: (args: unknown) => void) => void;
    updateOption: (opt: ListTableConstructorOptions) => Promise<unknown>;
    getCopyValue?: () => string;
};

export type PivotTableVTableProps = BoxProps &
    React.RefAttributes<HTMLDivElement> & {
        data: PivotData;
        conditionalFormattings: ConditionalFormattingConfig[];
        minMaxMap: ConditionalFormattingMinMaxMap | undefined;
        hideRowNumbers: boolean;
        getFieldLabel: (fieldId: string) => string | undefined;
        getField: (fieldId: string) => ItemsMap[string] | undefined;
        showSubtotals?: boolean;
        columnProperties?: Record<string, ColumnProperties>;
        cellContextMenu?: FC<React.PropsWithChildren<CellContextMenuProps>>;
    };

const PivotTableVTable: FC<PivotTableVTableProps> = ({
    data,
    conditionalFormattings = [],
    minMaxMap = {},
    hideRowNumbers = false,
    getFieldLabel,
    getField,
    columnProperties = {},
    cellContextMenu: CellContextMenuComponent,
    className,
    ...boxProps
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<ListTableInstance | null>(null);
    const [cellMenuState, setCellMenuState] = useState<{
        x: number;
        y: number;
        cell: Cell<ResultRow, unknown>;
    } | null>(null);
    const [menuOpened, { open: openMenu, close: closeMenu }] = useDisclosure(false);
    const getConditionalRuleLabel = useConditionalRuleLabelFromItem();

    const formatMap = useMemo(() => {
        if (!conditionalFormattings?.length) return new Map<string, CellFormatValue>();
        return computePivotFormatMap({
            data,
            conditionalFormattings,
            minMaxMap,
            getField,
            getConditionalRuleLabel,
        });
    }, [
        data,
        conditionalFormattings,
        minMaxMap,
        getField,
        getConditionalRuleLabel,
    ]);

    const dataRowCount = data.retrofitData.allCombinedData.length;
    const allRecordsRef = useRef<Record<string, string | number | null | undefined>[]>([]);
    const flattenedColsRef = useRef<VTableColumnDef[]>([]);
    const originalRowsRef = useRef<ResultRow[]>([]);
    const pivotColumnInfoRef = useRef(data.retrofitData.pivotColumnInfo);
    const headerRowCountRef = useRef(1);
    const getFieldRef = useRef(getField);
    getFieldRef.current = getField;

    const option = useMemo<VTableListOption>(() => {
        const base = pivotDataToVTable(data, {
            getFieldLabel,
            hideRowNumbers,
            minMaxMap,
            columnProperties,
            getField,
        });

        const allRecords = [
            ...base.records,
            ...(base.columnTotalsRecords ?? []),
        ];
        const { result: columnsWithStyle } = addConditionalStyleToColumns(
            base.columns,
            formatMap,
            dataRowCount,
            0,
        );
        allRecordsRef.current = allRecords;
        flattenedColsRef.current = flattenLeafColumns(columnsWithStyle);
        originalRowsRef.current = data.retrofitData.allCombinedData;
        pivotColumnInfoRef.current = data.retrofitData.pivotColumnInfo;
        headerRowCountRef.current = getHeaderRowCount(columnsWithStyle);

        const fullOption: Record<string, unknown> = {
            columns: columnsWithStyle,
            records: allRecords,
            select: {
                disableSelect: true,
            },
            defaultRowHeight: 32,
            defaultHeaderRowHeight: 32,
            theme: {
                bodyStyle: {
                    fontSize: 13,
                    lineHeight: 16,
                    bgColor: (args: { row: number }) =>
                        args.row % 2 === 1 ? '#fafafa' : '#ffffff',
                    borderColor: '#e8e8e8',
                    borderLineWidth: 1,
                    padding: [1, 8],
                },
                headerStyle: {
                    fontSize: 13,
                    lineHeight: 16,
                    bgColor: '#f5f5f5',
                    borderColor: '#e8e8e8',
                    borderLineWidth: 1,
                },
                frameStyle: {
                    borderColor: '#e8e8e8',
                    borderLineWidth: 1,
                },
                scrollStyle: {
                    hoverOn: false,
                    visible: 'scrolling',
                    width: 6,
                },
            },
            tooltip: {
                isShowOverflowTextTooltip: true,
            },
            menu: {
                contextMenuItems: ['copy'],
            },
        };

        return fullOption as VTableListOption;
    }, [
        data,
        getFieldLabel,
        hideRowNumbers,
        formatMap,
        dataRowCount,
    ]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const table = new ListTable(container, {
            ...option,
            heightMode: 'standard',
            autoFillHeight: true,
        } as ListTableConstructorOptions);
        tableRef.current = table as unknown as ListTableInstance;

        table.on('dropdown_menu_click', (args: { menuKey?: string }) => {
            if (args?.menuKey === 'copy') {
                const copyVal = table.getCopyValue?.();
                if (copyVal) void navigator.clipboard?.writeText(copyVal);
            }
        });

        const showCellMenu = (col: number, row: number, clientX: number, clientY: number) => {
            if (!CellContextMenuComponent) return;
            const cols = flattenedColsRef.current;
            const records = allRecordsRef.current;
            const headerRowCount = headerRowCountRef.current;
            const recordIndex = row - headerRowCount;
            if (col < 0 || col >= cols.length || recordIndex < 0 || recordIndex >= records.length) return;
            const colDef = cols[col];
            const fieldId = colDef.field;
            const record = records[recordIndex];
            const displayVal = record[fieldId];
            const pivotCol = pivotColumnInfoRef.current.find((c) => c.fieldId === fieldId);
            const originalRows = originalRowsRef.current;
            const originalRow =
                recordIndex < originalRows.length ? originalRows[recordIndex] : null;
            const cellValue = originalRow?.[fieldId];
            const value =
                cellValue && typeof cellValue === 'object' && 'value' in cellValue
                    ? (cellValue as { value: { raw?: unknown; formatted?: string } }).value
                    : { raw: displayVal, formatted: displayVal != null ? String(displayVal) : '-' };

            const rowOriginal = recordIndex < originalRows.length ? originalRows[recordIndex] : null;
            const rowRecord = records[recordIndex];
            const allRowCells: Cell<ResultRow, unknown>[] = cols.map((c) => {
                const fid = c.field;
                const rec = rowRecord;
                const orig = rowOriginal;
                const cv = orig?.[fid];
                const val =
                    cv && typeof cv === 'object' && 'value' in cv
                        ? (cv as { value: { raw?: unknown; formatted?: string } }).value
                        : { raw: rec[fid], formatted: rec[fid] != null ? String(rec[fid]) : '-' };
                const pc = pivotColumnInfoRef.current.find((x) => x.fieldId === fid);
                const bid = pc?.underlyingId ?? pc?.baseId ?? fid;
                const item = getFieldRef.current?.(bid);
                return {
                    getValue: () => ({ value: val }),
                    column: { columnDef: { meta: { item } }, id: fid },
                    row: {} as Cell<ResultRow, unknown>['row'],
                } as unknown as Cell<ResultRow, unknown>;
            });
            const rowObj = {
                original: (rowOriginal ?? rowRecord) as ResultRow,
                getAllCells: () => allRowCells,
                getVisibleCells: () => allRowCells,
            };
            allRowCells.forEach((c) => {
                (c as { row: typeof rowObj }).row = rowObj;
            });

            const syntheticCell = allRowCells[col];
            setCellMenuState({ x: clientX, y: clientY, cell: syntheticCell });
            openMenu();
        };

        const handleCellClick = (args: unknown) => {
            const a = args as { col: number; row: number; event?: { clientX: number; clientY: number } };
            if (a?.event) showCellMenu(a.col, a.row, a.event.clientX, a.event.clientY);
        };
        const handleContextMenu = (args: unknown) => {
            const a = args as { col: number; row: number; event?: { clientX: number; clientY: number; preventDefault?: () => void } };
            if (a?.event) {
                a.event.preventDefault?.();
                showCellMenu(a.col, a.row, a.event.clientX, a.event.clientY);
            }
        };
        table.on(TABLE_EVENT_TYPE.CLICK_CELL, handleCellClick as () => void);
        table.on(TABLE_EVENT_TYPE.CONTEXTMENU_CELL, handleContextMenu as () => void);

        return () => {
            if (typeof (table as unknown as { release?: () => void }).release === 'function') {
                (table as unknown as { release: () => void }).release();
            }
            tableRef.current = null;
        };
    }, []); // 仅挂载/卸载时创建/销毁，option 变更通过 updateOption 处理

    useEffect(() => {
        const table = tableRef.current;
        if (!table) return;
        void table.updateOption(option as ListTableConstructorOptions);
    }, [option]);

    return (
        <>
            <Box
                ref={containerRef}
                miw="100%"
                h="100%"
                pr={6}
                className={className}
                {...boxProps}
            />
            {CellContextMenuComponent && cellMenuState && menuOpened && (
                <Portal>
                    <Menu
                        opened
                        onClose={() => {
                            closeMenu();
                            setCellMenuState(null);
                        }}
                        closeOnClickOutside
                        closeOnEscape
                        shadow="md"
                        position="bottom-start"
                        withinPortal={false}
                    >
                        <Menu.Target>
                            <div
                                style={{
                                    position: 'fixed',
                                    left: cellMenuState.x,
                                    top: cellMenuState.y,
                                    width: 0,
                                    height: 0,
                                }}
                            />
                        </Menu.Target>
                        <Menu.Dropdown>
                            <CellContextMenuComponent
                                cell={cellMenuState.cell as Cell<ResultRow, ResultRow[0]>}
                            />
                        </Menu.Dropdown>
                    </Menu>
                </Portal>
            )}
        </>
    );
};

export default PivotTableVTable;

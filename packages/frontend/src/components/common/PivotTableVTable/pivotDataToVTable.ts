/**
 * 将 PivotData 转换为 VTable ListTable 的 option
 * 支持分组表头、条件格式、条形图列（customRender 自绘，复刻 BarChartDisplay 的文字在柱上/柱后与颜色逻辑）
 */
import {
    convertFormattedValue,
    formatItemValue,
    hasPercentageFormat,
    type ColumnProperties,
    type ConditionalFormattingMinMaxMap,
    type ItemsMap,
    type PivotData,
} from '@lightdash/common';

import { ROW_NUMBER_COLUMN_ID } from '../Table/constants';

const ALL_PIVOTED_SPACER_FIELD = '__pivot_spacer__';
/** 条形图列：主 field 存格式化显示文字，该后缀字段存 0–100 数值驱动条形长度 */
const BAR_VALUE_FIELD_SUFFIX = '__bar';

type FieldValue =
    | {
          type: 'value';
          fieldId: string;
          value: { raw?: unknown; formatted?: string };
          colSpan: number;
      }
    | { type: 'label'; fieldId: string };

export type PivotDataToVTableOptions = {
    getFieldLabel: (fieldId: string) => string | undefined;
    hideRowNumbers: boolean;
    minMaxMap?: ConditionalFormattingMinMaxMap;
    columnProperties?: Record<string, ColumnProperties>;
    getField?: (fieldId: string) => ItemsMap[string] | undefined;
};

/** customRender 条形图用：与 BarChartDisplay 一致的柱上/柱后文字与颜色 */
export type BarCustomRenderOptions = {
    fieldId: string;
    barValueFieldId: string;
    min: number;
    max: number;
    barColor?: string;
};

/** 数据列（非条形图）最小宽度，避免合并表头下子列过窄导致表头文字省略 */
const DATA_COLUMN_MIN_WIDTH = 88;

export type VTableColumnDef = {
    field: string;
    title: string;
    width?: number;
    minWidth?: number;
    cellType?: string;
    dependField?: string;
    min?: (args: { row: number; col: number }) => number;
    max?: (args: { row: number; col: number }) => number;
    format?: (value: unknown) => string;
    /** 条形图列使用 customRender 自绘，复刻「文字在柱上为白/在柱后为继承色」逻辑 */
    customRender?: (args: {
        row: number;
        col: number;
        table: {
            getCellOriginRecord: (
                col: number,
                row: number,
            ) => Record<string, unknown> | undefined;
        };
        value: unknown;
        dataValue: unknown;
        rect?: { width?: number; height?: number };
    }) => {
        elements: Array<
            | {
                  type: 'rect';
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  fill?: string;
                  radius?: number;
              }
            | {
                  type: 'text';
                  x: number;
                  y: number;
                  text: string;
                  fill?: string;
                  fontSize?: number;
                  textBaseline?: string;
              }
        >;
        expectedHeight: number;
        expectedWidth: number;
    };
    style?:
        | {
              barColor?: string;
              barBgColor?: string;
              barHeight?: number | string;
              barPadding?: (number | string)[];
              barBottom?: number | string;
          }
        | ((args: { row: number; col: number }) => Record<string, string>);
};

/** 分组表头：多级 columns */
export type VTableColumnGroup = {
    title: string;
    columns: (VTableColumnDef | VTableColumnGroup)[];
};

export type VTableListOption = {
    columns: (VTableColumnDef | VTableColumnGroup)[];
    records: Record<string, string | number | null | undefined>[];
    columnTotalsRecords?: Record<string, string | number | null | undefined>[];
};

function getHeaderDisplay(
    cell: FieldValue,
    getFieldLabel: (fieldId: string) => string | undefined,
): string {
    if (cell.type === 'label') {
        return getFieldLabel(cell.fieldId) ?? cell.fieldId;
    }
    const v = cell.value;
    return v?.formatted ?? (v?.raw != null ? String(v.raw) : '');
}

const BAR_RENDER_PADDING = 8;
const BAR_RENDER_HEIGHT = 20;
const BAR_RENDER_WIDTH = 160;
const MAX_BAR_WIDTH_PERCENT = 90;
/** 与 BarChartDisplay 默认一致 */
const BAR_COLOR = '#5470c6';
/** 文字与左边缘/柱右边缘的间距，避免文字太贴边 */
const BAR_TEXT_PADDING = 12;

/**
 * 与 BarChartDisplay 一致：柱够宽时文字叠在柱上（白色），否则在柱后（继承色）；无灰色底色；条形圆角 2px；垂直居中、文字左间距。
 */
function makeBarCustomRender(
    opts: BarCustomRenderOptions,
): VTableColumnDef['customRender'] {
    const {
        fieldId,
        barValueFieldId,
        min: minVal,
        max: maxVal,
        barColor = BAR_COLOR,
    } = opts;
    return (args) => {
        const record = args.table?.getCellOriginRecord?.(args.col, args.row) as
            | Record<string, unknown>
            | undefined;
        const formatted = (
            record?.[fieldId] != null
                ? String(record[fieldId])
                : args.value != null
                ? String(args.value)
                : '-'
        ) as string;
        const barNum = record?.[barValueFieldId];
        const num = typeof barNum === 'number' ? barNum : Number(barNum);
        const range = maxVal - minVal;
        const percentage =
            range > 0
                ? Math.max(0, Math.min(100, ((num - minVal) / range) * 100))
                : 0;
        const barWidthPercent = Math.min(percentage, MAX_BAR_WIDTH_PERCENT);
        const showBar = !Number.isNaN(num) && num > 0;
        const cellW = args.rect?.width ?? BAR_RENDER_WIDTH;
        const cellH = args.rect?.height ?? BAR_RENDER_HEIGHT;
        const contentW = cellW - BAR_RENDER_PADDING * 2;
        const barWidthPx = showBar
            ? Math.max(2, (contentW * barWidthPercent) / 100)
            : 0;
        const estimatedTextWidthPx = formatted.length * 7 + 16;
        const minBarWidthForText = Math.max(
            30,
            (estimatedTextWidthPx / 250) * 100,
        );
        const showTextOnBar = showBar && barWidthPercent >= minBarWidthForText;
        const textColor = showTextOnBar ? '#ffffff' : '#333333';
        const textX = showTextOnBar
            ? BAR_TEXT_PADDING
            : showBar
            ? BAR_RENDER_PADDING + barWidthPx + BAR_TEXT_PADDING
            : BAR_TEXT_PADDING;
        const offsetY = Math.max(0, (cellH - BAR_RENDER_HEIGHT) / 2);
        const elements: ReturnType<
            NonNullable<VTableColumnDef['customRender']>
        >['elements'] = [];
        if (showBar) {
            elements.push({
                type: 'rect',
                x: BAR_RENDER_PADDING,
                y: offsetY,
                width: barWidthPx,
                height: BAR_RENDER_HEIGHT,
                fill: barColor,
                radius: 2,
            });
        }
        elements.push({
            type: 'text',
            x: textX,
            y: offsetY + BAR_RENDER_HEIGHT / 2,
            text: formatted,
            fill: textColor,
            fontSize: 12,
            textBaseline: 'middle',
        });
        return {
            elements,
            expectedHeight: BAR_RENDER_HEIGHT,
            expectedWidth: BAR_RENDER_WIDTH,
        };
    };
}

/**
 * 根据 headerValues 多级表头构建分组 column 树（仅数据列，不含维度列）
 * valueColumnStart: pivotColumnInfo 中「数据列」起始下标，headerValues 与数据列一一对应
 */
function buildGroupedDataColumns(
    data: PivotData,
    options: PivotDataToVTableOptions,
    depth: number,
    colIndices: number[],
    valueColumnStart: number,
): (VTableColumnDef | VTableColumnGroup)[] {
    const {
        getFieldLabel,
        minMaxMap = {},
        columnProperties = {},
        getField,
    } = options;
    const headerValues = data.headerValues ?? [];
    const pivotColumnInfo = data.retrofitData.pivotColumnInfo;
    const nRows = headerValues.length;

    const makeLeafCol = (
        colIndex: number,
        headerTitle?: string,
    ): VTableColumnDef => {
        const col = pivotColumnInfo[colIndex];
        const baseId = col.underlyingId || col.baseId || col.fieldId;
        const title = headerTitle ?? getFieldLabel(baseId) ?? col.fieldId;
        const item = getField?.(baseId);
        const minMax = minMaxMap[baseId] ?? minMaxMap[col.fieldId];
        const isBarColumn =
            minMax && columnProperties[baseId]?.displayStyle === 'bar' && item;
        const colDef: VTableColumnDef = { field: col.fieldId, title };
        if (isBarColumn) {
            const isPercentageField = hasPercentageFormat(item);
            const minVal = isPercentageField ? 0 : minMax?.min ?? 0;
            const maxVal = isPercentageField ? 100 : minMax?.max ?? 100;
            colDef.width = BAR_RENDER_WIDTH;
            colDef.customRender = makeBarCustomRender({
                fieldId: col.fieldId,
                barValueFieldId: col.fieldId + BAR_VALUE_FIELD_SUFFIX,
                min: minVal,
                max: maxVal,
            });
        } else {
            colDef.minWidth = DATA_COLUMN_MIN_WIDTH;
        }
        return colDef;
    };

    if (depth >= nRows || colIndices.length === 0) {
        return colIndices.map((i) => makeLeafCol(i));
    }

    const sorted = [...colIndices].sort((a, b) => a - b);
    const row = headerValues[depth];
    const groups: { display: string; indices: number[] }[] = [];
    for (const i of sorted) {
        const headerColIndex = i - valueColumnStart;
        const cell = row?.[headerColIndex];
        const display = cell ? getHeaderDisplay(cell, getFieldLabel) : '';
        if (
            groups.length > 0 &&
            groups[groups.length - 1].display === display
        ) {
            groups[groups.length - 1].indices.push(i);
        } else {
            groups.push({ display, indices: [i] });
        }
    }

    const result: (VTableColumnDef | VTableColumnGroup)[] = [];
    for (const g of groups) {
        if (depth + 1 >= nRows) {
            // 最后一层：直接输出带分组标题的叶子列，只占 2 列表头行，避免「多行一样」
            result.push(
                ...g.indices.map((colIndex) => ({
                    ...makeLeafCol(colIndex, g.display),
                })),
            );
        } else {
            const children = buildGroupedDataColumns(
                data,
                options,
                depth + 1,
                g.indices,
                valueColumnStart,
            );
            result.push({ title: g.display, columns: children });
        }
    }
    return result;
}

/**
 * 将 PivotData 转为 VTable ListTable 可用的 option
 */
export function pivotDataToVTable(
    data: PivotData,
    options: PivotDataToVTableOptions,
): VTableListOption {
    const {
        getFieldLabel,
        hideRowNumbers,
        minMaxMap = {},
        columnProperties = {},
        getField,
    } = options;

    const allDimensionsPivoted =
        data.indexValueTypes.length === 0 && data.titleFields[0]?.length === 1;

    const headerValues = data.headerValues ?? [];
    const pivotColumnInfo = data.retrofitData.pivotColumnInfo;
    const valueColumnStart = pivotColumnInfo.findIndex(
        (c) => c.columnType !== 'indexValue' && c.columnType !== 'label',
    );
    const hasRowTotal = pivotColumnInfo.some(
        (c) => c.columnType === 'rowTotal',
    );
    const valueColumnEnd =
        hasRowTotal &&
        pivotColumnInfo.findIndex((c) => c.columnType === 'rowTotal') >= 0
            ? pivotColumnInfo.findIndex((c) => c.columnType === 'rowTotal')
            : pivotColumnInfo.length;
    const valueColIndices =
        valueColumnStart >= 0
            ? Array.from(
                  { length: valueColumnEnd - valueColumnStart },
                  (_, i) => valueColumnStart + i,
              )
            : [];
    const useGroupedHeaders =
        headerValues.length > 1 && valueColIndices.length > 0;

    const indexColumns: VTableColumnDef[] = [];
    if (!hideRowNumbers) {
        indexColumns.push({
            field: ROW_NUMBER_COLUMN_ID,
            title: '#',
            width: 48,
        });
    }
    if (allDimensionsPivoted) {
        indexColumns.push({
            field: ALL_PIVOTED_SPACER_FIELD,
            title: '',
            width: 24,
        });
    }

    const dimensionColumns: VTableColumnDef[] = pivotColumnInfo
        .slice(
            0,
            valueColumnStart >= 0 ? valueColumnStart : pivotColumnInfo.length,
        )
        .map((col) => {
            const baseId = col.underlyingId || col.baseId || col.fieldId;
            return {
                field: col.fieldId,
                title: getFieldLabel(baseId) ?? col.fieldId,
            };
        });

    const dataColumns: (VTableColumnDef | VTableColumnGroup)[] =
        useGroupedHeaders
            ? buildGroupedDataColumns(
                  data,
                  options,
                  0,
                  valueColIndices,
                  valueColumnStart,
              )
            : valueColumnStart >= 0
            ? pivotColumnInfo
                  .slice(valueColumnStart, valueColumnEnd)
                  .map((col) => {
                      const baseId =
                          col.underlyingId || col.baseId || col.fieldId;
                      const title = getFieldLabel(baseId) ?? col.fieldId;
                      const item = getField?.(baseId);
                      const minMax =
                          minMaxMap[baseId] ?? minMaxMap[col.fieldId];
                      const isBarColumn =
                          minMax &&
                          columnProperties[baseId]?.displayStyle === 'bar' &&
                          item;
                      const colDef: VTableColumnDef = {
                          field: col.fieldId,
                          title,
                      };
                      if (isBarColumn) {
                          const isPercentageField = hasPercentageFormat(item);
                          const minVal = isPercentageField
                              ? 0
                              : minMax?.min ?? 0;
                          const maxVal = isPercentageField
                              ? 100
                              : minMax?.max ?? 100;
                          colDef.width = BAR_RENDER_WIDTH;
                          colDef.customRender = makeBarCustomRender({
                              fieldId: col.fieldId,
                              barValueFieldId:
                                  col.fieldId + BAR_VALUE_FIELD_SUFFIX,
                              min: minVal,
                              max: maxVal,
                          });
                      } else {
                          colDef.minWidth = DATA_COLUMN_MIN_WIDTH;
                      }
                      return colDef;
                  })
            : [];

    const rowTotalColumns: VTableColumnDef[] =
        hasRowTotal && valueColumnEnd < pivotColumnInfo.length
            ? pivotColumnInfo.slice(valueColumnEnd).map((col) => ({
                  field: col.fieldId,
                  title:
                      getFieldLabel(col.baseId ?? col.fieldId) ?? col.fieldId,
              }))
            : [];

    const columns: (VTableColumnDef | VTableColumnGroup)[] = [
        ...indexColumns,
        ...dimensionColumns,
        ...dataColumns,
        ...rowTotalColumns,
    ];

    const records: Record<string, string | number | null | undefined>[] =
        data.retrofitData.allCombinedData.map((row, rowIndex) => {
            const record: Record<string, string | number | null | undefined> =
                {};

            if (!hideRowNumbers) {
                record[ROW_NUMBER_COLUMN_ID] = rowIndex + 1;
            }
            if (allDimensionsPivoted) {
                record[ALL_PIVOTED_SPACER_FIELD] = '';
            }

            data.retrofitData.pivotColumnInfo.forEach((col) => {
                const cell = row[col.fieldId];
                const value = cell?.value;
                const baseId = col.underlyingId || col.baseId || col.fieldId;
                const item = getField?.(baseId);
                const minMax = minMaxMap?.[baseId] ?? minMaxMap?.[col.fieldId];
                const isBarColumn =
                    minMax &&
                    columnProperties?.[baseId]?.displayStyle === 'bar' &&
                    item;

                if (isBarColumn && value) {
                    const raw = value.raw;
                    const num = typeof raw === 'number' ? raw : Number(raw);
                    if (!Number.isNaN(num)) {
                        const converted = convertFormattedValue(num, item);
                        const barNum =
                            typeof converted === 'number' ? converted : num;
                        record[col.fieldId + BAR_VALUE_FIELD_SUFFIX] = barNum;
                        record[col.fieldId] = item
                            ? formatItemValue(item, raw)
                            : value.formatted ?? String(raw ?? '');
                    } else {
                        record[col.fieldId] = item
                            ? formatItemValue(item, raw)
                            : value.formatted ?? value.raw ?? '';
                    }
                } else {
                    record[col.fieldId] = item
                        ? formatItemValue(item, value?.raw)
                        : value?.formatted ?? value?.raw ?? null ?? '';
                }
            });

            return record;
        });

    let columnTotalsRecords:
        | Record<string, string | number | null | undefined>[]
        | undefined;

    if (data.pivotConfig.columnTotals && data.columnTotals) {
        columnTotalsRecords = data.columnTotals.map(
            (totalsRow, totalRowIndex) => {
                const record: Record<
                    string,
                    string | number | null | undefined
                > = {};

                if (!hideRowNumbers) {
                    record[ROW_NUMBER_COLUMN_ID] = '';
                }
                if (allDimensionsPivoted) {
                    record[ALL_PIVOTED_SPACER_FIELD] = '';
                }

                data.retrofitData.pivotColumnInfo.forEach((col, colIndex) => {
                    const total = totalsRow[colIndex];
                    if (total == null) {
                        record[col.fieldId] = '';
                        return;
                    }
                    const baseId =
                        col.underlyingId || col.baseId || col.fieldId;
                    const item = getField?.(baseId);
                    record[col.fieldId] = item
                        ? formatItemValue(item, total)
                        : typeof total === 'number'
                        ? String(total)
                        : (total as string);
                });

                return record;
            },
        );
    }

    return {
        columns,
        records,
        columnTotalsRecords,
    };
}

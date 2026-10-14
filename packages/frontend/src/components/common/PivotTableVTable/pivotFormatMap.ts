/**
 * Compute pivot table conditional-format Map for VTable customCellStyle.
 * Reuses getConditionalFormattingConfig / getConditionalFormattingColor.
 * rowFields include index dims from the row AND pivot header dim values
 * for the current column (e.g. 数据期间 = "单月同比增长") so existing
 * "field values" AND rules can match period labels.
 */
import {
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getItemId,
    type BaseFilterRule,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type ConditionalFormattingRowFields,
    type ConditionalRuleLabel,
    type FilterableItem,
    type ItemsMap,
    type PivotData,
    type ResultRow,
} from '@lightdash/common';
import { readableColor } from 'polished';

import { getColorFromRange } from '../../../utils/colorUtils';

export type CellFormatValue = {
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
        .map(([k, v]) => `${k}:${(v as { value?: unknown })?.value}`)
        .join(';');
    return `${fieldId}:${JSON.stringify(value)}:${rowPart}`;
}

/** Map a retrofit data column fieldId to headerValues column index (data cols only). */
function getHeaderColIndexForPivotColumn(
    data: Pick<PivotData, 'retrofitData'>,
    columnFieldId: string,
): number | undefined {
    const { pivotColumnInfo } = data.retrofitData;
    const colIndex = pivotColumnInfo.findIndex(
        (c) => c.fieldId === columnFieldId,
    );
    if (colIndex < 0) return undefined;

    const col = pivotColumnInfo[colIndex];
    if (
        col.columnType === 'indexValue' ||
        col.columnType === 'label' ||
        col.columnType === 'rowTotal'
    ) {
        return undefined;
    }

    let dataSeen = 0;
    for (let i = 0; i <= colIndex; i += 1) {
        const c = pivotColumnInfo[i];
        if (
            c.columnType !== 'indexValue' &&
            c.columnType !== 'label' &&
            c.columnType !== 'rowTotal'
        ) {
            if (i === colIndex) return dataSeen;
            dataSeen += 1;
        }
    }
    return undefined;
}

/**
 * Build CF rowFields for one pivot cell:
 * - index (row) dimension values from the row
 * - pivot header dimension values for this column (period / group-by labels)
 */
export function getRowFieldsForPivotCell(
    row: ResultRow,
    data: PivotData,
    getField: (fieldId: string) => ItemsMap[string] | undefined,
    columnFieldId: string,
): ConditionalFormattingRowFields {
    const rowFields: ConditionalFormattingRowFields = {};

    data.retrofitData.pivotColumnInfo.forEach((col) => {
        if (col.columnType !== 'indexValue') return;
        const item = getField(col.underlyingId || col.baseId || col.fieldId);
        if (!item) return;
        const cell = row[col.fieldId];
        rowFields[getItemId(item)] = {
            field: item,
            value: cell?.value?.raw,
        };
    });

    const headerColIndex = getHeaderColIndexForPivotColumn(data, columnFieldId);
    if (headerColIndex === undefined) return rowFields;

    for (const headerRow of data.headerValues ?? []) {
        const headerCell = headerRow[headerColIndex];
        if (!headerCell || headerCell.type !== 'value') continue;
        const item = getField(headerCell.fieldId);
        if (!item) continue;
        rowFields[getItemId(item)] = {
            field: item,
            value: headerCell.value?.raw,
        };
    }

    return rowFields;
}

export type ComputeFormatMapOptions = {
    data: PivotData;
    conditionalFormattings: ConditionalFormattingConfig[];
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    getField: (fieldId: string) => ItemsMap[string] | undefined;
    getConditionalRuleLabel: (
        rule: BaseFilterRule,
        item: FilterableItem,
    ) => ConditionalRuleLabel;
};

/**
 * Compute full-table CF map, key = `${rowIndex}-${fieldId}`
 */
export function computePivotFormatMap(
    options: ComputeFormatMapOptions,
): Map<string, CellFormatValue> {
    const {
        data,
        conditionalFormattings,
        minMaxMap,
        getField,
        getConditionalRuleLabel,
    } = options;

    const cache = new Map<string, CellFormatValue>();
    const result = new Map<string, CellFormatValue>();

    data.retrofitData.allCombinedData.forEach((row, rowIndex) => {
        data.retrofitData.pivotColumnInfo.forEach((col) => {
            const field = getField(
                col.underlyingId || col.baseId || col.fieldId,
            );
            const cell = row[col.fieldId];
            const rawValue = cell?.value?.raw;
            const fieldId = col.fieldId;

            const rowFields = getRowFieldsForPivotCell(
                row,
                data,
                getField,
                fieldId,
            );

            const cacheKey = getConditionalFormatCacheKey(
                fieldId,
                rawValue,
                rowFields,
            );
            const cached = cache.get(cacheKey);
            if (cached) {
                result.set(`${rowIndex}-${fieldId}`, cached);
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
            }

            const tooltipContent = getConditionalFormattingDescription(
                field,
                config,
                rowFields,
                getConditionalRuleLabel,
            );
            const value: CellFormatValue = {
                backgroundColor,
                fontColor,
                tooltipContent,
            };
            cache.set(cacheKey, value);
            result.set(`${rowIndex}-${fieldId}`, value);
        });
    });

    return result;
}

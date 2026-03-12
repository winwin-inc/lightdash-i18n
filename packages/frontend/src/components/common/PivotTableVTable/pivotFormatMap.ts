/**
 * 计算透视表条件格式 Map，供 VTable customCellStyle 使用
 * 复用与 PivotTable 相同的逻辑（getConditionalFormattingConfig、getConditionalFormattingColor）
 * 当前在主线程同步计算，未使用 conditionalFormatting.worker；逻辑与旧表一致，大数据量时可考虑接入 worker
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

/**
 * 从 PivotData 的一行中构建 rowFields（用于条件格式上下文）
 */
function getRowFieldsFromPivotRow(
    row: ResultRow,
    data: PivotData,
    getField: (fieldId: string) => ItemsMap[string] | undefined,
): ConditionalFormattingRowFields {
    const rowFields: ConditionalFormattingRowFields = {};
    data.retrofitData.pivotColumnInfo.forEach((col) => {
        const item = getField(col.underlyingId || col.baseId || col.fieldId);
        if (!item) return;
        const cell = row[col.fieldId];
        const rawValue = cell?.value?.raw;
        rowFields[getItemId(item)] = {
            field: item,
            value: rawValue,
        };
    });
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
 * 计算全表条件格式 Map，key = `${rowIndex}-${fieldId}`
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
        const rowFields = getRowFieldsFromPivotRow(row, data, getField);

        data.retrofitData.pivotColumnInfo.forEach((col) => {
            const field = getField(col.underlyingId || col.baseId || col.fieldId);
            const cell = row[col.fieldId];
            const rawValue = cell?.value?.raw;
            const fieldId = col.fieldId;

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

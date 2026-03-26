/**
 * Web Worker：条件格式计算（backgroundColor / fontColor），减轻主线程 Scripting。
 * tooltipContent 仍在主线程用 getConditionalFormattingDescription 补算。
 */
/* eslint-disable no-restricted-globals -- Worker 内 self 为全局对象 */
import {
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    type ConditionalFormattingRowFields,
} from '@lightdash/common';
import { getColorFromRange, readableColor } from '../utils/colorUtils';
import type { WorkerRequest, WorkerResponse } from './conditionalFormatting.worker.types';

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

function computeRowFormat(request: WorkerRequest): WorkerResponse {
    const {
        cells,
        rowFields,
        minMaxMap,
        conditionalFormattings,
        cacheSnapshot,
    } = request;
    const map: Record<string, { backgroundColor?: string; fontColor?: string }> = {};
    const cacheUpdates: Record<string, { backgroundColor?: string; fontColor?: string }> = {};

    cells.forEach(({ cellId, fieldId, rawValue, field }) => {
        const cacheKey = getConditionalFormatCacheKey(fieldId, rawValue, rowFields);
        const cached = cacheSnapshot[cacheKey];
        if (cached) {
            map[cellId] = cached;
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
            config,
            minMaxMap,
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

        const value = { backgroundColor, fontColor };
        map[cellId] = value;
        cacheUpdates[cacheKey] = value;
    });

    return {
        rowIndex: request.rowIndex,
        map,
        cacheUpdates,
    };
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
    try {
        const response = computeRowFormat(e.data);
        self.postMessage(response);
    } catch (err) {
        self.postMessage({
            rowIndex: e.data.rowIndex,
            map: {},
            cacheUpdates: {},
            error: err instanceof Error ? err.message : String(err),
        } as WorkerResponse & { error?: string });
    }
};

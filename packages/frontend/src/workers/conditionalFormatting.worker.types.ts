/**
 * 条件格式 Worker 消息类型，供主线程与 worker 共用。
 */
import type {
    ConditionalFormattingConfig,
    ConditionalFormattingMinMaxMap,
    ConditionalFormattingRowFields,
    ItemsMap,
} from '@lightdash/common';

export type WorkerFormatCell = {
    cellId: string;
    fieldId: string;
    rawValue: unknown;
    field: ItemsMap[string] | undefined;
};

export type WorkerRequest = {
    rowIndex: number;
    cells: WorkerFormatCell[];
    rowFields: ConditionalFormattingRowFields;
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    conditionalFormattings: ConditionalFormattingConfig[];
    cacheSnapshot: Record<
        string,
        { backgroundColor?: string; fontColor?: string }
    >;
};

export type WorkerResponse = {
    rowIndex: number;
    map: Record<string, { backgroundColor?: string; fontColor?: string }>;
    cacheUpdates: Record<
        string,
        { backgroundColor?: string; fontColor?: string }
    >;
    error?: string;
};

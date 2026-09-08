import { type MetricQueryResponse } from './metricQuery';
import { type PivotConfig } from './pivot';
import { type TraceTaskBase } from './scheduler';

export type ApiGdriveAccessTokenResponse = {
    status: 'ok';
    results: string;
};

export type CustomLabel = {
    [key: string]: string;
};
export type UploadMetricGsheet = {
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQueryResponse; // tsoa doesn't support complex types like MetricQuery
    showTableNames: boolean;
    columnOrder: string[];
    customLabels?: CustomLabel;
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
};

export type GsheetColumnType =
    | 'string'
    | 'number'
    | 'date'
    | 'timestamp'
    | 'boolean';

export type GsheetColumn = {
    key: string;
    label?: string;
    type?: GsheetColumnType;
};

export type GsheetRow = Record<string, string | number | boolean | null>;

export type UploadGsheetFromRows = {
    projectUuid: string;
    title: string;
    columns: GsheetColumn[];
    rows: GsheetRow[];
};

export type UploadMetricGsheetPayload = TraceTaskBase & UploadMetricGsheet;

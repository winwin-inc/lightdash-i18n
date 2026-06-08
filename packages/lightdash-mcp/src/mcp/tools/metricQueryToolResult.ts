import type { ApiExecuteAsyncMetricQueryResults } from '@lightdash/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { metricQueryResultToCsvColumns, rowsToCsv } from '../../lib/csvUtils';
import {
    rowsToScalarFlat,
    type MetricQueryValueFormat,
} from '../../lib/toolOutput';

export function buildMetricQueryToolResult(params: {
    queryUuid: string;
    rows: unknown[];
    columns: unknown;
    executeResult: ApiExecuteAsyncMetricQueryResults;
    full: boolean;
    valueFormat?: MetricQueryValueFormat;
    extraStructured?: Record<string, unknown>;
}): CallToolResult {
    const {
        queryUuid,
        rows,
        columns,
        executeResult,
        full,
        valueFormat = 'raw',
        extraStructured,
    } = params;
    const rowsUnknown = rows as unknown[];
    const { columnIds, headerLabels } = metricQueryResultToCsvColumns({
        columns,
        fields: executeResult.fields,
        rows: rowsUnknown,
    });
    const flatRows = rowsToScalarFlat(rowsUnknown, valueFormat);
    const csv =
        columnIds.length > 0
            ? rowsToCsv({
                  columnIds,
                  headerLabels,
                  rows: flatRows,
              })
            : '';
    const structuredContent = {
        ...(full
            ? {
                  queryUuid,
                  rows,
                  columns,
                  fields: executeResult.fields,
                  warnings: executeResult.warnings,
              }
            : {
                  queryUuid,
                  valueFormat,
                  rows: flatRows,
              }),
        ...extraStructured,
    };
    return {
        content: [
            {
                type: 'text',
                text: csv.length > 0 ? csv : '(no tabular columns)',
            },
            ...(full
                ? [
                      {
                          type: 'text' as const,
                          text: JSON.stringify(structuredContent, null, 2),
                      },
                  ]
                : []),
        ],
        structuredContent,
    };
}

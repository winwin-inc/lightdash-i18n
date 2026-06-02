import type { ApiExecuteAsyncMetricQueryResults } from '@lightdash/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { metricQueryResultToCsvColumns, rowsToCsv } from '../../lib/csvUtils';
import { rowsToScalarFlat } from '../../lib/toolOutput';

export function buildMetricQueryToolResult(params: {
    queryUuid: string;
    rows: unknown[];
    columns: unknown;
    executeResult: ApiExecuteAsyncMetricQueryResults;
    full: boolean;
    extraStructured?: Record<string, unknown>;
}): CallToolResult {
    const { queryUuid, rows, columns, executeResult, full, extraStructured } =
        params;
    const rowsUnknown = rows as unknown[];
    const rowRecords = rowsUnknown.filter(
        (r): r is Record<string, unknown> =>
            r !== null && typeof r === 'object' && !Array.isArray(r),
    );
    const { columnIds, headerLabels } = metricQueryResultToCsvColumns({
        columns,
        fields: executeResult.fields,
        rows: rowsUnknown,
    });
    const csv =
        columnIds.length > 0
            ? rowsToCsv({
                  columnIds,
                  headerLabels,
                  rows: rowRecords,
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
                  rows: rowsToScalarFlat(rows),
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

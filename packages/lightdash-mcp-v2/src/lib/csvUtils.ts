/** Escape one CSV cell (RFC-style: quote if comma, quote, or newline). */
function escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export type RowsToCsvParams = {
    /** Column keys in row objects, in display order */
    columnIds: string[];
    /** One header label per column (same length as columnIds) */
    headerLabels: string[];
    /** Result rows as plain objects */
    rows: Record<string, unknown>[];
};

/**
 * Build a CSV string (header row + data rows). run_metric_query 用于优先返回 CSV 文本块。
 */
export function rowsToCsv(params: RowsToCsvParams): string {
    const { columnIds, headerLabels, rows } = params;
    if (columnIds.length === 0) {
        return '';
    }
    const header = headerLabels.map(escapeCsvCell).join(',');
    const lines = rows.map((row) =>
        columnIds.map((id) => escapeCsvCell(row[id])).join(','),
    );
    return [header, ...lines].join('\n');
}

function inferColumnIds(
    columns: unknown,
    fields: unknown,
    sampleRow: Record<string, unknown> | undefined,
): string[] {
    if (Array.isArray(columns)) {
        return columns.map((c) => String(c));
    }
    if (columns && typeof columns === 'object' && !Array.isArray(columns)) {
        return Object.keys(columns as Record<string, unknown>);
    }
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        return Object.keys(fields as Record<string, unknown>);
    }
    if (sampleRow) {
        return Object.keys(sampleRow);
    }
    return [];
}

function labelForField(
    fields: unknown,
    columnId: string,
): string {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return columnId;
    }
    const map = fields as Record<string, { label?: unknown; name?: unknown }>;
    const item = map[columnId];
    if (item && typeof item === 'object') {
        if (typeof item.label === 'string' && item.label.length > 0) {
            return item.label;
        }
        if (typeof item.name === 'string' && item.name.length > 0) {
            return item.name;
        }
    }
    return columnId;
}

/** Derive ordered column ids and human-readable header labels from query API shape. */
export function metricQueryResultToCsvColumns(params: {
    columns: unknown;
    fields: unknown;
    rows: unknown[];
}): { columnIds: string[]; headerLabels: string[] } {
    const firstRow =
        params.rows.length > 0 &&
        params.rows[0] &&
        typeof params.rows[0] === 'object' &&
        !Array.isArray(params.rows[0])
            ? (params.rows[0] as Record<string, unknown>)
            : undefined;
    const columnIds = inferColumnIds(
        params.columns,
        params.fields,
        firstRow,
    );
    const headerLabels = columnIds.map((id) =>
        labelForField(params.fields, id),
    );
    return { columnIds, headerLabels };
}

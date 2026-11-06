/**
 * 结果聚合与落盘：把 MB 级明细压成 KB 级摘要，明细只回 handle。
 */

export type RowRecord = Record<string, unknown>;

export type QueryOutcome = {
    label: string;
    ok: boolean;
    rowCount: number;
    columns: string[];
    numericTotals: Record<string, number>;
    sample: RowRecord | null;
    elapsedMs: number;
    error: string | null;
};

function isRecord(value: unknown): value is RowRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 从上游 tools/call 结果里取出 rows（兼容 structuredContent 与纯文本 JSON） */
export function extractRows(result: unknown): RowRecord[] {
    if (!isRecord(result)) return [];

    const structured = result.structuredContent;
    if (isRecord(structured) && Array.isArray(structured.rows)) {
        return structured.rows.filter(isRecord);
    }

    const content = result.content;
    if (Array.isArray(content)) {
        for (const item of content) {
            if (isRecord(item) && item.type === 'text' && typeof item.text === 'string') {
                const rows = rowsFromJson(item.text);
                if (rows) return rows;
            }
        }
    }
    return [];
}

function rowsFromJson(text: string): RowRecord[] | null {
    try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.filter(isRecord);
        if (isRecord(parsed) && Array.isArray(parsed.rows)) {
            return parsed.rows.filter(isRecord);
        }
    } catch {
        return null;
    }
    return null;
}

/** 上游错误文本（isError=true 时使用） */
export function extractErrorText(result: unknown): string {
    if (!isRecord(result)) return 'unknown upstream error';
    const content = result.content;
    if (Array.isArray(content)) {
        const text = content
            .filter((item): item is { type: string; text: string } => {
                return (
                    isRecord(item) &&
                    item.type === 'text' &&
                    typeof item.text === 'string'
                );
            })
            .map((item) => item.text)
            .join('\n');
        if (text) return text.slice(0, 500);
    }
    return 'upstream returned isError without message';
}

export function summarizeOutcome(
    label: string,
    rows: RowRecord[],
    elapsedMs: number,
    error: string | null,
): QueryOutcome {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

    const numericTotals: Record<string, number> = {};
    for (const column of columns) {
        let sum = 0;
        let seen = false;
        for (const row of rows) {
            const value = row[column];
            if (typeof value === 'number' && Number.isFinite(value)) {
                sum += value;
                seen = true;
            }
        }
        if (seen) {
            numericTotals[column] = Math.round(sum * 1000) / 1000;
        }
    }

    return {
        label,
        ok: error === null,
        rowCount: rows.length,
        columns,
        numericTotals,
        sample: rows[0] ?? null,
        elapsedMs,
        error,
    };
}

export function toNdjson(rows: RowRecord[]): string {
    return rows.map((row) => JSON.stringify(row)).join('\n');
}

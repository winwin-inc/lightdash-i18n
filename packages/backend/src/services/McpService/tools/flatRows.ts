/**
 * 查询结果的行扁平化（v1 独立包 `lightdash-mcp/src/lib/toolOutput.ts` 对齐）。
 *
 * Lightdash API 的 ResultRow 每个单元格是 `{ value: { raw, formatted } }`
 * 嵌套结构，直接进 MCP 工具返回会让体积膨胀数倍。MCP 工具统一用
 * `rowsToScalarFlat` 拍平成 `{ field: value }`，`valueFormat` 选择取
 * raw 还是 formatted（默认 raw，与 v1 一致）。
 */

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as AnyRecord;
}

export type ScalarCell = {
    raw: unknown;
    formatted: string | null;
};

function stringifyFormatted(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
}

/**
 * Extract a Lightdash ResultRow cell into a raw + formatted pair.
 *
 * Accepts the nested API cell shape (`{ value: { raw, formatted } }`), the
 * bare `{ raw, formatted }` shape and plain scalar values, so that dirty or
 * legacy payloads never throw.
 */
export function unwrapScalarCell(value: unknown): ScalarCell {
    const valueObj = asRecord(value);
    if (!valueObj) {
        return {
            raw: value,
            formatted: stringifyFormatted(value),
        };
    }
    const nestedValue = valueObj.value;
    const nestedObj = asRecord(nestedValue);
    if (nestedObj && ('raw' in nestedObj || 'formatted' in nestedObj)) {
        return {
            raw: nestedObj.raw ?? null,
            formatted: stringifyFormatted(nestedObj.formatted),
        };
    }
    if ('raw' in valueObj || 'formatted' in valueObj) {
        return {
            raw: valueObj.raw ?? null,
            formatted: stringifyFormatted(valueObj.formatted),
        };
    }
    return {
        raw: nestedValue ?? value,
        formatted: stringifyFormatted(nestedValue ?? value),
    };
}

export type MetricQueryValueFormat = 'raw' | 'formatted';

function scalarCellToFlatValue(
    cell: ScalarCell,
    valueFormat: MetricQueryValueFormat,
): unknown {
    if (valueFormat === 'formatted') {
        return cell.formatted ?? cell.raw;
    }
    return cell.raw;
}

/**
 * Flattens Lightdash ResultRows (`{ field: { value: { raw, formatted } } }`)
 * into plain scalar rows (`{ field: value }`).
 */
export function rowsToScalarFlat(
    rows: unknown,
    valueFormat: MetricQueryValueFormat = 'raw',
): Record<string, unknown>[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
                return null;
            }
            const record = row as AnyRecord;
            return Object.entries(record).reduce<Record<string, unknown>>(
                (acc, [k, v]) => {
                    acc[k] = scalarCellToFlatValue(
                        unwrapScalarCell(v),
                        valueFormat,
                    );
                    return acc;
                },
                {},
            );
        })
        .filter((row): row is Record<string, unknown> => row !== null);
}

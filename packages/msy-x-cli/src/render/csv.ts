import { parse } from 'csv-parse/sync';
import { CliError } from '../cli/errors';

/** csv-parse 产出的记录：全部是字符串值 */
export type CsvRow = Record<string, string>;

/** 首行摘要：截断到 60 字符，供 PARSE_ERROR message 使用 */
const firstLineSummary = (text: string): string => {
    const firstLine =
        text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
    const trimmed = firstLine.trim();
    if (trimmed === '') {
        return '(empty)';
    }
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
};

/**
 * 解析 CSV 文本（columns:true、skip_empty_lines、bom:true、relax_column_count:false）。
 * 列数不齐等解析异常 → CliError('PARSE_ERROR')，message 含首行摘要（§8.2 退出码 7）。
 */
export const parseCsv = (text: string): CsvRow[] => {
    try {
        const records = parse(text, {
            columns: true,
            skip_empty_lines: true,
            bom: true,
            relax_column_count: false,
        }) as CsvRow[];
        return records;
    } catch (error) {
        throw new CliError({
            code: 'PARSE_ERROR',
            message: `CSV 解析失败（首行：${firstLineSummary(text)}）`,
            hint: '服务端既没有返回结构化内容，text 也不是合法 CSV',
            cause: error,
        });
    }
};

/** 单元格转字符串：null/undefined → ''，对象 → 紧凑 JSON */
export const cellToString = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
    ) {
        return String(value);
    }
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return String(value);
    }
};

/** RFC 4180 风格转义：含逗号/引号/换行的字段加引号，内部引号翻倍 */
const escapeCsvField = (value: string): string => {
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
};

/** 把行数组序列化成 CSV 文本（含结尾换行）；'csv' 输出格式用 */
export const toCsv = (
    columns: string[],
    rows: Array<Record<string, unknown>>,
): string => {
    const escapeRow = (row: Record<string, unknown>) =>
        columns.map((column) => escapeCsvField(cellToString(row[column])));

    const lines = [
        columns.map(escapeCsvField).join(','),
        ...rows.map(escapeRow),
    ];
    return `${lines.join('\n')}\n`;
};

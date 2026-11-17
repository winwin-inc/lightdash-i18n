import type { ToolResult } from '../types';
import { parseCsv } from './csv';

/**
 * 渲染源六级探测（§7.3/§7.4）：
 * v2 的 26 个工具里只有看板门控阻断 payload 带 structuredContent，
 * 其余都是 content[].text 纯文本（JSON / CSV / XML / ```json 围栏）。
 */
export type RowSource =
    | 'structured'
    | 'json'
    | 'fenced-json'
    | 'csv'
    | 'xml'
    | 'none';

export type PickRowsResult = {
    source: RowSource;
    /** 首行键序；无行时为 null */
    columns: string[] | null;
    rows: Array<Record<string, unknown>> | null;
};

/** 单元格可能是 {value:{raw,formatted}} 包装；本层只取 raw（formatted 由调用方另行要求） */
export const unwrapCellValue = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }
    const wrapped = value as { value?: unknown };
    if (
        wrapped.value !== null &&
        typeof wrapped.value === 'object' &&
        !Array.isArray(wrapped.value) &&
        'raw' in (wrapped.value as Record<string, unknown>)
    ) {
        return (wrapped.value as { raw: unknown }).raw;
    }
    return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeRow = (row: unknown): Record<string, unknown> | null => {
    if (!isRecord(row)) {
        return null;
    }
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
        normalized[key] = unwrapCellValue(row[key]);
    }
    return normalized;
};

/** 从行数组里挑出键序（首行键优先，后续新键按出现顺序追加） */
export const collectColumns = (
    rows: Array<Record<string, unknown>>,
): string[] => {
    const columns: string[] = [];
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!columns.includes(key)) {
                columns.push(key);
            }
        }
    }
    return columns;
};

/** 拼接 content 里所有 text 块（JSON/围栏/CSV/XML 探测与降级展示的原文） */
export const joinText = (result: ToolResult): string =>
    (result.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');

/** xml / 无行场景下供上层原样展示的原始文本（§7.4 第 5 级） */
export const pickText = (result: ToolResult): string => joinText(result);

const fromStructured = (
    structuredContent: unknown,
): Array<Record<string, unknown>> | null => {
    if (!isRecord(structuredContent)) {
        return null;
    }
    if (Array.isArray(structuredContent.rows)) {
        return structuredContent.rows;
    }
    if (
        isRecord(structuredContent.data) &&
        Array.isArray(structuredContent.data.rows)
    ) {
        return structuredContent.data.rows;
    }
    if (Array.isArray(structuredContent.results)) {
        return structuredContent.results;
    }
    return null;
};

const toRowsResult = (
    source: RowSource,
    rawRows: unknown[],
): PickRowsResult => {
    const rows = rawRows
        .map(normalizeRow)
        .filter((row): row is Record<string, unknown> => row !== null);
    return {
        source,
        columns: rows.length > 0 ? collectColumns(rows) : null,
        rows,
    };
};

/** JSON.parse 失败返回 undefined（JSON.parse 本身不会产出 undefined，可作哨兵） */
const tryJsonParse = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
};

/**
 * 解析后的 JSON → 行结果：
 * - 数组：元素为对象的作为 rows（非对象元素丢弃）；
 * - 对象：含 rows / data.rows / results 则取之，否则整个对象当单行记录；
 * - 其它（字符串/数字/null 等）返回 null，由调用方继续往下探测。
 */
const fromParsedJson = (
    parsed: unknown,
    source: Extract<RowSource, 'json' | 'fenced-json'>,
): PickRowsResult | null => {
    if (Array.isArray(parsed)) {
        return toRowsResult(source, parsed);
    }
    if (isRecord(parsed)) {
        const nested = fromStructured(parsed);
        if (nested !== null) {
            return toRowsResult(source, nested);
        }
        return toRowsResult(source, [parsed]);
    }
    return null;
};

/** 剥 ```lang … ``` 围栏；非围栏或缺闭合返回 null */
const stripFence = (trimmed: string): string | null => {
    if (!trimmed.startsWith('```')) {
        return null;
    }
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline === -1) {
        return null;
    }
    const body = trimmed.slice(firstNewline + 1);
    const closing = body.lastIndexOf('```');
    if (closing === -1) {
        return null;
    }
    return body.slice(0, closing).trim();
};

const firstLineOf = (text: string): string => {
    const newline = text.indexOf('\n');
    return newline === -1 ? text : text.slice(0, newline);
};

/**
 * 六级渲染源探测（§7.4）：
 * 1. structuredContent 三种已知形状（{rows}/{data:{rows}}/{results}）；
 * 2. content text 拼接后以 {/[ 开头 → JSON.parse（失败往下走，不抛）；
 * 3. ``` 围栏 → 剥围栏后同上解析；
 * 4. 含换行且首行含 , → CSV（解析失败抛 PARSE_ERROR，见 §8 退出码 7）；
 * 5. < 开头 → XML 片段，不解析，原样按文本展示（rows/columns 为 null）；
 * 6. 都不匹配 → none。
 */
export const pickRows = (result: ToolResult): PickRowsResult => {
    // 1. structuredContent
    const structuredRows = fromStructured(result.structuredContent);
    if (structuredRows !== null) {
        return toRowsResult('structured', structuredRows);
    }

    const text = joinText(result);
    const trimmed = text.trim();

    // 2. 裸 JSON 文本
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = tryJsonParse(trimmed);
        const picked =
            parsed === undefined ? null : fromParsedJson(parsed, 'json');
        if (picked !== null) {
            return picked;
        }
    }

    // 3. ``` 围栏（```json 或裸 ```）
    const fenced = stripFence(trimmed);
    if (fenced !== null) {
        const parsed = tryJsonParse(fenced);
        const picked =
            parsed === undefined
                ? null
                : fromParsedJson(parsed, 'fenced-json');
        if (picked !== null) {
            return picked;
        }
    }

    // 4. CSV（含换行且首行含逗号）
    if (
        trimmed !== '' &&
        trimmed.includes('\n') &&
        firstLineOf(trimmed).includes(',')
    ) {
        const rows = parseCsv(text).map((row) => ({ ...row }));
        return toRowsResult('csv', rows);
    }

    // 5. XML 片段：不解析，原样展示
    if (trimmed.startsWith('<')) {
        return { source: 'xml', columns: null, rows: null };
    }

    // 6. 都不匹配
    return { source: 'none', columns: null, rows: null };
};

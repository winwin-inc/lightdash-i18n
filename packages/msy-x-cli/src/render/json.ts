import type { ToolResult } from '../types';
import { joinText, type PickRowsResult } from './detect';

export type RenderJsonParams = {
    tool: string;
    result: ToolResult;
    envelope: boolean;
    site: string;
    durationMs: number;
    /** renderResult 已探测过的渲染源，避免重复解析 */
    picked: PickRowsResult;
};

const hasStructuredObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const tryParseJson = (text: string): unknown | null => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
};

/** 剥 ```lang … ``` 围栏（detect 不导出，这里只重复最小逻辑） */
const stripFence = (trimmed: string): string | null => {
    if (!trimmed.startsWith('```')) return null;
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline === -1) return null;
    const body = trimmed.slice(firstNewline + 1);
    const closing = body.lastIndexOf('```');
    if (closing === -1) return null;
    return body.slice(0, closing).trim();
};

/**
 * 数据载荷（§7.3：默认原样输出工具返回的数据体）：
 * - structured → structuredContent 原样（与 MCP 客户端看到的一致）；
 * - json / fenced-json → 解析后的数据体本身（保留 pagination 等顶层键）；
 * - csv → {csv, rows}（仅真 CSV 源；json 文本不再包 csv 字段）；
 * - xml / none → 有结构化对象则透出，否则原样文本。
 */
export const buildJsonPayload = (
    result: ToolResult,
    picked: PickRowsResult,
): unknown => {
    const text = joinText(result);
    switch (picked.source) {
        case 'structured':
            return result.structuredContent;
        case 'json':
            return tryParseJson(text.trim()) ?? text;
        case 'fenced-json': {
            const fenced = stripFence(text.trim());
            return (fenced !== null ? tryParseJson(fenced) : null) ?? text;
        }
        case 'csv':
            return { csv: text, rows: picked.rows };
        default:
            if (hasStructuredObject(result.structuredContent)) {
                return result.structuredContent;
            }
            return text;
    }
};

/** JSON 输出：2 空格缩进、稳定键序、结尾换行 */
export const renderJson = (params: RenderJsonParams): string => {
    const { tool, result, envelope, site, durationMs, picked } = params;
    const data = buildJsonPayload(result, picked);

    let output: string;
    if (envelope) {
        output = JSON.stringify(
            {
                ok: true,
                tool,
                data,
                meta: { site, durationMs },
            },
            null,
            2,
        );
    } else {
        output = JSON.stringify(data, null, 2);
    }
    return `${output}\n`;
};

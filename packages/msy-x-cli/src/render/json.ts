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

/**
 * 数据载荷（§7.3）：
 * - 有结构化对象 → 原样（与 MCP 客户端看到的一致）；
 * - 无结构化但有 CSV → {csv, rows}；
 * - 都没有 → {csv: '', rows: []}（降级输出）。
 */
export const buildJsonPayload = (
    result: ToolResult,
    picked: PickRowsResult,
): unknown => {
    const { structuredContent } = result;
    if (hasStructuredObject(structuredContent)) {
        return structuredContent;
    }
    if (picked.rows !== null) {
        return { csv: joinText(result), rows: picked.rows };
    }
    if (structuredContent !== undefined && structuredContent !== null) {
        return structuredContent;
    }
    return { csv: joinText(result), rows: [] };
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

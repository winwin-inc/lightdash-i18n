import { type ResultRow } from '@lightdash/common';
import { lookupSyncedColor } from '../../hooks/useChartColorConfig/colorSyncKeys';
import { getHashColor } from '../../hooks/useChartColorConfig/hashColorAssignment';

/**
 * 自定义图表的颜色键解析。
 *
 * 标准图（笛卡尔/饼图）的颜色键来自「维度值」：
 * - 笛卡尔图用 pivot 的原始值（raw）
 * - 饼图用分组名（展示值，formatted）
 *
 * 自定义图表的 series 里只有 raw 值（见 useCustomVisualizationConfig），
 * 因此解析顺序是：raw 键 → 同字段的展示值键 → 哈希兜底。
 * 这样「同一维度值」在标准图与自定义图之间能落到同一个颜色。
 */

/** 字段 + raw 值 → 展示值（用于颜色键兜底匹配） */
export const buildFormattedValueMap = (
    rows: ResultRow[] | undefined,
): Map<string, string> => {
    const map = new Map<string, string>();
    if (!rows) return map;

    rows.forEach((row) => {
        Object.entries(row).forEach(([fieldId, cell]) => {
            const raw = cell?.value?.raw;
            const formatted = cell?.value?.formatted;
            if (raw === null || raw === undefined) return;
            if (formatted === null || formatted === undefined) return;
            const key = `${fieldId}\u0000${String(raw)}`;
            if (!map.has(key)) {
                map.set(key, String(formatted));
            }
        });
    });

    return map;
};

/** 生成「系列值 + 字段 → 颜色」的解析函数 */
export const createVegaColorResolver = ({
    palette,
    hashAssignments,
    knownHashAssignments,
    formattedValueMap,
}: {
    palette: string[];
    hashAssignments: Record<string, string>;
    /** known 系列（看板已保存配置里出现过的维度值）的颜色 */
    knownHashAssignments?: Record<string, string>;
    formattedValueMap?: Map<string, string>;
}): ((value: string, field: string) => string) => {
    return (value, field) => {
        const known = knownHashAssignments ?? {};
        const formatted = formattedValueMap?.get(`${field}\u0000${value}`);

        // 1. 看板已知系列（笛卡尔图的 pivot 值、饼图的分组名等）
        const knownRaw = lookupSyncedColor(value, known);
        if (knownRaw) return knownRaw;
        if (formatted) {
            const knownFormatted = lookupSyncedColor(formatted, known);
            if (knownFormatted) return knownFormatted;
        }

        // 2. 运行时追加的未知名（其他图已注册过、但这里不叫这个名）
        const appendedRaw = lookupSyncedColor(value, hashAssignments);
        if (appendedRaw) return appendedRaw;
        if (formatted) {
            const appendedFormatted = lookupSyncedColor(formatted, hashAssignments);
            if (appendedFormatted) return appendedFormatted;
        }

        // 3. 哈希兜底
        return getHashColor(value, palette);
    };
};

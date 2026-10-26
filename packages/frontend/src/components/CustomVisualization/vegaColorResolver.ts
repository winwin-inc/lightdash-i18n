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
    formattedValueMap,
}: {
    palette: string[];
    hashAssignments: Record<string, string>;
    formattedValueMap?: Map<string, string>;
}): ((value: string, field: string) => string) => {
    return (value, field) => {
        const direct = lookupSyncedColor(value, hashAssignments);
        if (direct) return direct;

        const formatted = formattedValueMap?.get(`${field}\u0000${value}`);
        if (formatted) {
            const byFormatted = lookupSyncedColor(formatted, hashAssignments);
            if (byFormatted) return byFormatted;
        }

        return getHashColor(value, palette);
    };
};

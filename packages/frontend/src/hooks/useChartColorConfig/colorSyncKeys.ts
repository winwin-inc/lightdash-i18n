import {
    ChartType,
    isDashboardChartTileType,
    type ChartConfig,
    type Dashboard,
    type ResultRow,
} from '@lightdash/common';

/**
 * 只剥饼图汇总尾巴，不切带 - / _ 的真系列名。
 * 例如: "其他品牌：包含494个" -> "其他品牌"
 *       "李子柒-原味" 保持原样
 */
const AGGREGATE_SUFFIXES = [
    /[：:]\s*包含\d+个\s*$/,
    /[（(]\s*\d+\s*个[）)]\s*$/,
];

const stripKeySuffix = (str: string): string => {
    let result = str.trim();
    AGGREGATE_SUFFIXES.forEach((pattern) => {
        const stripped = result.replace(pattern, '').trim();
        if (stripped.length > 0) {
            result = stripped;
        }
    });
    return result;
};

/** 系列名（品牌、类目、口味等）归一成颜色同步键。 */
export const toColorSyncKey = (identifier: string): string => {
    const normalized = stripKeySuffix(identifier).trim();
    return normalized.length > 0 ? normalized : identifier;
};

const fieldValueAsKey = (
    row: ResultRow | undefined,
    fieldId: string,
    preferRaw: boolean,
): string => {
    const cell = row?.[fieldId]?.value;
    if (!cell) return '';
    if (preferRaw && cell.raw != null && cell.raw !== '') {
        return String(cell.raw);
    }
    return cell.formatted ?? '';
};

const definedFieldIds = (
    groupFieldIds: Array<string | null | undefined>,
): string[] =>
    groupFieldIds.filter((fieldId): fieldId is string => Boolean(fieldId));

/** 从一行或多字段拼出饼图着色键；优先 raw，没有再 formatted。 */
export const pieSliceColorKey = (
    formattedName: string,
    rows: ResultRow[] | undefined,
    groupFieldIds: Array<string | null | undefined>,
): string => {
    const fieldIds = definedFieldIds(groupFieldIds);
    if (fieldIds.length === 0 || !rows?.[0]) return formattedName;
    const raw = fieldIds
        .map((fieldId) => fieldValueAsKey(rows[0], fieldId, true))
        .filter((part) => part.length > 0)
        .join(' - ');
    return raw.length > 0 ? raw : formattedName;
};

/** 从结果行收集饼图可见着色键，优先 raw。 */
export const pieRowColorKeys = (
    rows: ResultRow[] | undefined,
    groupFieldIds: Array<string | null | undefined>,
): string[] => {
    const fieldIds = definedFieldIds(groupFieldIds);
    if (!rows || fieldIds.length === 0) return [];
    return rows
        .map((row) => {
            const raw = fieldIds
                .map((fieldId) => fieldValueAsKey(row, fieldId, true))
                .filter((part) => part.length > 0)
                .join(' - ');
            if (raw.length > 0) return raw;
            return fieldIds
                .map((fieldId) => fieldValueAsKey(row, fieldId, false))
                .filter((part) => part.length > 0)
                .join(' - ');
        })
        .filter((name) => name.length > 0);
};

export const lookupSyncedColor = (
    identifier: string,
    colors: Record<string, string>,
): string | undefined => {
    if (!identifier) return undefined;
    if (colors[identifier]) return colors[identifier];
    const key = toColorSyncKey(identifier);
    if (key !== identifier && colors[key]) return colors[key];
    return undefined;
};

const assignManualColor = (
    target: Record<string, string>,
    name: string,
    color: string | undefined,
) => {
    if (!color || !name) return;
    const key = toColorSyncKey(name);
    if (!target[key]) {
        target[key] = color;
    }
};

/**
 * 从已保存图表配置收集「系列名 → 手配色」。
 * 只收录饼图切片色，以及笛卡尔图带 pivot（按维度值拆系列）的颜色。
 */
export const extractManualColorsFromChartConfig = (
    chartConfig: ChartConfig,
): Record<string, string> => {
    const out: Record<string, string> = {};

    if (chartConfig.type === ChartType.PIE) {
        const overrides = chartConfig.config?.groupColorOverrides;
        if (overrides) {
            Object.entries(overrides).forEach(([name, color]) => {
                assignManualColor(out, name, color);
            });
        }
        const pieMetadata = chartConfig.config?.metadata;
        if (pieMetadata) {
            Object.entries(pieMetadata).forEach(([name, meta]) => {
                assignManualColor(out, name, meta?.color);
            });
        }
        return out;
    }

    if (chartConfig.type === ChartType.CARTESIAN) {
        const cartesian = chartConfig.config;
        const series = cartesian?.eChartsConfig.series ?? [];
        const metadata = cartesian?.metadata;
        const metricFields = new Set(
            series
                .map((serie) => serie.encode?.yRef?.field)
                .filter((field): field is string => Boolean(field)),
        );

        series.forEach((serie) => {
            const pivotValues = serie.encode?.yRef?.pivotValues ?? [];
            if (pivotValues.length === 0) return;
            const value = String(pivotValues[0]?.value ?? '');
            assignManualColor(out, value, serie.color);
        });

        if (metadata) {
            Object.entries(metadata).forEach(([serieId, meta]) => {
                const lastSegment = serieId.split('.').pop() ?? serieId;
                // 未透视系列的 metadata 键是指标名，不能当成系列色
                if (metricFields.has(lastSegment)) return;
                assignManualColor(out, lastSegment, meta?.color);
            });
        }
    }

    return out;
};

const addColorSyncKey = (target: Set<string>, name: string) => {
    if (!name) return;
    const key = toColorSyncKey(name);
    if (key) target.add(key);
};

/**
 * 从已保存图表配置收集系列名（不管有没有手配色）。
 * 用于跨 Tab 稳定的哈希避让集合，不能并入当前筛选结果。
 */
export const extractColorSyncKeysFromChartConfig = (
    chartConfig: ChartConfig,
): string[] => {
    const keys = new Set<string>();

    if (chartConfig.type === ChartType.PIE) {
        Object.keys(chartConfig.config?.groupColorOverrides ?? {}).forEach(
            (name) => addColorSyncKey(keys, name),
        );
        Object.keys(chartConfig.config?.metadata ?? {}).forEach((name) =>
            addColorSyncKey(keys, name),
        );
        (chartConfig.config?.groupSortOverrides ?? []).forEach((name) =>
            addColorSyncKey(keys, name),
        );
        return [...keys];
    }

    if (chartConfig.type === ChartType.CARTESIAN) {
        const series = chartConfig.config?.eChartsConfig.series ?? [];
        const metricFields = new Set(
            series
                .map((serie) => serie.encode?.yRef?.field)
                .filter((field): field is string => Boolean(field)),
        );

        series.forEach((serie) => {
            const value = serie.encode?.yRef?.pivotValues?.[0]?.value;
            if (value != null) addColorSyncKey(keys, String(value));
        });

        Object.keys(chartConfig.config?.metadata ?? {}).forEach((serieId) => {
            const lastSegment = serieId.split('.').pop() ?? serieId;
            if (metricFields.has(lastSegment)) return;
            addColorSyncKey(keys, lastSegment);
        });
    }

    return [...keys];
};

/** 归一并按 UTF-16 排序，去掉空键。 */
export const normalizeColorSyncKeys = (names: string[]): string[] => {
    const keys = new Set<string>();
    names.forEach((name) => addColorSyncKey(keys, name));
    return [...keys].sort();
};

/** UTF-16 默认排序，与 locale 无关，跨浏览器同序。 */
export const mergeColorSyncKeys = (lists: string[][]): string[] =>
    normalizeColorSyncKeys(lists.flat());

/** 每张图各自一组系列名，供共现避让；空图丢弃。 */
export const collectChartColorKeyGroups = (
    chartConfigs: Array<ChartConfig | undefined>,
): string[][] =>
    chartConfigs
        .map((chartConfig) =>
            chartConfig
                ? normalizeColorSyncKeys(
                      extractColorSyncKeysFromChartConfig(chartConfig),
                  )
                : [],
        )
        .filter((group) => group.length > 0);

/** 按看板 tile 顺序收集需要同步的已保存图表，含未访问 Tab。 */
export const getSyncedSavedChartRefs = (
    tiles: Dashboard['tiles'] | undefined,
    syncChartTileUuids: string[],
): Array<{ tileUuid: string; savedChartUuid: string }> => {
    if (!tiles) return [];

    return tiles.flatMap((tile) => {
        if (!isDashboardChartTileType(tile)) return [];
        const savedChartUuid = tile.properties.savedChartUuid;
        if (!savedChartUuid) return [];
        if (
            syncChartTileUuids.length > 0 &&
            !syncChartTileUuids.includes(tile.uuid)
        ) {
            return [];
        }
        return [{ tileUuid: tile.uuid, savedChartUuid }];
    });
};

/** 按传入顺序合并，同名先到先得（与看板 tile 顺序一致，跨 Tab 稳定）。 */
export const mergeManualColorMaps = (
    maps: Array<Record<string, string>>,
): Record<string, string> => {
    const out: Record<string, string> = {};
    maps.forEach((map) => {
        Object.entries(map).forEach(([key, color]) => {
            if (!out[key]) {
                out[key] = color;
            }
        });
    });
    return out;
};

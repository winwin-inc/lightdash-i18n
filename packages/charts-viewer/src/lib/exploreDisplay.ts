/**
 * 中间层：将 Lightdash explore 转为前端可直接展示的维度和指标结构。
 * 与 Lightdash 一致的分组、时间粒度展示名与排序。
 */

export type FieldOption = { id: string; label: string };

/** 维度展示项：分组（如「时间」下挂 Month）或单个字段 */
export type DimensionDisplayItem =
    | { kind: 'group'; groupLabel: string; children: FieldOption[] }
    | { kind: 'field'; item: FieldOption };

type RawDimension = {
    name?: string;
    label?: string;
    table?: string;
    hidden?: boolean;
    groupLabel?: string;
    timeInterval?: string;
    group?: string;
    index?: number;
};

type RawMetric = {
    name?: string;
    label?: string;
    table?: string;
    hidden?: boolean;
    index?: number;
};

type RawTable = {
    dimensions?: Record<string, RawDimension>;
    metrics?: Record<string, RawMetric>;
};

export type ExploreDisplayResult = {
    name: string;
    baseTable: string;
    dimensionsForDisplay: DimensionDisplayItem[];
    metrics: FieldOption[];
    /** 用于默认图表配置：第一个维度、第一个指标 */
    defaultChartFields: { xField: string; yField: string; xLabel: string; yLabel: string } | null;
};

const TIME_INTERVAL_LABEL: Record<string, string> = {
    RAW: 'Raw',
    YEAR: 'Year',
    QUARTER: 'Quarter',
    MONTH: 'Month',
    WEEK: 'Week',
    DAY: 'Day',
    HOUR: 'Hour',
    MINUTE: 'Minute',
    SECOND: 'Second',
    MILLISECOND: 'Millisecond',
    DAY_OF_WEEK_INDEX: 'Day of week',
    MONTH_NAME: 'Month',
    WEEK_NUM: 'Week num',
    MONTH_NUM: 'Month num',
    QUARTER_NUM: 'Quarter num',
    YEAR_NUM: 'Year num',
    DAY_OF_WEEK_NAME: 'Day of week name',
    QUARTER_NAME: 'Quarter name',
};

const TIME_INTERVAL_ORDER: Record<string, number> = {
    RAW: 0,
    YEAR: 1,
    QUARTER: 2,
    MONTH: 3,
    WEEK: 4,
    DAY: 5,
    HOUR: 6,
    MINUTE: 7,
    SECOND: 8,
    MILLISECOND: 9,
    YEAR_NUM: 10,
    QUARTER_NUM: 11,
    MONTH_NUM: 12,
    WEEK_NUM: 13,
    DAY_OF_YEAR_NUM: 14,
    DAY_OF_MONTH_NUM: 15,
    DAY_OF_WEEK_INDEX: 16,
    DAY_OF_WEEK_NAME: 17,
    MONTH_NAME: 18,
    QUARTER_NAME: 19,
    HOUR_OF_DAY_NUM: 20,
    MINUTE_OF_HOUR_NUM: 21,
};

function toFieldId(
    key: string,
    meta: { table?: string; name?: string },
    baseTable: string,
): string {
    return `${meta?.table ?? baseTable}_${(meta?.name ?? key).replaceAll('.', '__')}`;
}

function toDimLabel(meta: RawDimension, key: string): string {
    const raw = (meta?.label || meta?.name || key).trim() || key;
    if (meta?.timeInterval && TIME_INTERVAL_LABEL[meta.timeInterval]) {
        return TIME_INTERVAL_LABEL[meta.timeInterval];
    }
    return raw;
}

function toMetricLabel(meta: RawMetric, key: string): string {
    return ((meta?.label || meta?.name || key) as string).trim() || key;
}

export function buildExploreDisplay(
    explore: {
        name: string;
        baseTable?: string;
        tables?: Record<string, RawTable>;
    },
): ExploreDisplayResult {
    const base = explore.baseTable ?? Object.keys(explore.tables ?? {})[0];
    const table: RawTable = explore.tables?.[base] ?? {};
    const dimEntries = (Object.entries(table.dimensions ?? {}) as [string, RawDimension][]).filter(
        ([, meta]) => !meta?.hidden,
    );
    const metEntries = (Object.entries(table.metrics ?? {}) as [string, RawMetric][]).filter(
        ([, meta]) => !meta?.hidden,
    );

    type DimOption = FieldOption & { groupLabel?: string; timeInterval?: string; index?: number };
    const dims: DimOption[] = dimEntries.map(([key, meta]) => ({
        id: toFieldId(key, meta, base),
        label: toDimLabel(meta, key),
        groupLabel: meta?.groupLabel,
        timeInterval: meta?.timeInterval,
        index: meta?.index,
    }));

    const byGroup = new Map<string, DimOption[]>();
    const ungrouped: DimOption[] = [];
    for (const d of dims) {
        if (d.groupLabel) {
            const arr = byGroup.get(d.groupLabel) ?? [];
            arr.push(d);
            byGroup.set(d.groupLabel, arr);
        } else {
            ungrouped.push(d);
        }
    }

    const dimensionsForDisplay: DimensionDisplayItem[] = [];
    const groupLabels = Array.from(byGroup.keys()).sort((a, b) => a.localeCompare(b));
    for (const gl of groupLabels) {
        const children = byGroup.get(gl) ?? [];
        children.sort((a, b) => {
            const ta = a.timeInterval ? TIME_INTERVAL_ORDER[a.timeInterval] ?? 999 : 999;
            const tb = b.timeInterval ? TIME_INTERVAL_ORDER[b.timeInterval] ?? 999 : 999;
            if (ta !== tb) return ta - tb;
            return a.label.localeCompare(b.label);
        });
        dimensionsForDisplay.push({
            kind: 'group',
            groupLabel: gl,
            children: children.map((c) => ({ id: c.id, label: c.label })),
        });
    }
    ungrouped.sort(
        (a, b) => (a.index ?? 999) - (b.index ?? 999) || a.label.localeCompare(b.label),
    );
    for (const d of ungrouped) {
        dimensionsForDisplay.push({ kind: 'field', item: { id: d.id, label: d.label } });
    }

    const metrics: FieldOption[] = metEntries.map(([key, meta]) => ({
        id: toFieldId(key, meta, base),
        label: toMetricLabel(meta, key),
    }));

    const firstDim = dimensionsForDisplay[0];
    const firstDimId =
        firstDim?.kind === 'group'
            ? firstDim.children[0]?.id
            : firstDim?.kind === 'field'
              ? firstDim.item.id
              : undefined;
    const firstDimLabel =
        firstDim?.kind === 'group'
            ? firstDim.children[0]?.label
            : firstDim?.kind === 'field'
              ? firstDim.item.label
              : undefined;
    const firstMetric = metrics[0];
    const defaultChartFields =
        firstDimId && firstMetric
            ? {
                  xField: firstDimId,
                  yField: firstMetric.id,
                  xLabel: firstDimLabel ?? firstDimId,
                  yLabel: firstMetric.label,
              }
            : null;

    return {
        name: explore.name,
        baseTable: base,
        dimensionsForDisplay,
        metrics,
        defaultChartFields,
    };
}

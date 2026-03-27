/**
 * 将 Lightdash 返回的 rows/columns 转为 ECharts option（JSON 配置思路）。
 * rows 每行: Record<fieldId, { value: { raw, formatted } }>
 */

export type ResultRow = Record<string, { value: { raw: unknown; formatted?: string } }>;
export type ChartConfig = {
    chartType: 'bar' | 'line' | 'table';
    xField?: string;
    yField?: string;
    xLabel?: string;
    yLabel?: string;
    seriesField?: string;
    tooltip?: boolean;
};

function getRaw(row: ResultRow, fieldId: string): unknown {
    const cell = row[fieldId];
    return cell?.value?.raw ?? null;
}

function getFormatted(row: ResultRow, fieldId: string): string {
    const cell = row[fieldId];
    const f = cell?.value?.formatted;
    if (f != null) return String(f);
    const r = cell?.value?.raw;
    return r != null ? String(r) : '';
}

/** 生成柱状图 option */
export function rowsToBarOption(
    rows: ResultRow[],
    config: ChartConfig,
): Record<string, unknown> {
    const xField = config.xField ?? '';
    const yField = config.yField ?? '';
    const seriesField = config.seriesField;

    const xData = rows.map((r) => getFormatted(r, xField));
    const yData = rows.map((r) => {
        const v = getRaw(r, yField);
        return typeof v === 'number' ? v : Number(v) || 0;
    });

    if (seriesField) {
        const groups = new Map<string, number[]>();
        rows.forEach((r, i) => {
            const name = getFormatted(r, seriesField);
            if (!groups.has(name)) groups.set(name, xData.map(() => 0));
            const arr = groups.get(name)!;
            const v = getRaw(r, yField);
            arr[i] = typeof v === 'number' ? v : Number(v) || 0;
        });
        const series = Array.from(groups.entries()).map(([name, data]) => ({
            name,
            type: 'bar',
            data,
        }));
        return {
            tooltip: config.tooltip !== false ? { trigger: 'axis' } : undefined,
            xAxis: {
                type: 'category',
                name: config.xLabel,
                data: xData,
            },
            yAxis: { type: 'value', name: config.yLabel },
            series,
        };
    }

    return {
        tooltip: config.tooltip !== false ? { trigger: 'axis' } : undefined,
        xAxis: {
            type: 'category',
            name: config.xLabel,
            data: xData,
        },
        yAxis: { type: 'value', name: config.yLabel },
        series: [{ type: 'bar', data: yData }],
    };
}

/** 生成折线图 option */
export function rowsToLineOption(
    rows: ResultRow[],
    config: ChartConfig,
): Record<string, unknown> {
    const bar = rowsToBarOption(rows, config) as {
        xAxis: { data: string[] };
        series: { type: string; data: number[] }[];
    };
    return {
        ...bar,
        series: bar.series.map((s) => ({ ...s, type: 'line', smooth: true })),
    };
}

/** 根据 chartType 生成 ECharts option */
export function rowsToEChartsOption(
    rows: ResultRow[],
    config: ChartConfig,
): Record<string, unknown> {
    if (config.chartType === 'line') return rowsToLineOption(rows, config);
    if (config.chartType === 'bar') return rowsToBarOption(rows, config);
    return rowsToBarOption(rows, { ...config, chartType: 'bar' });
}

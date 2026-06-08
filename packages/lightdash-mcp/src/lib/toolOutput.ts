type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as AnyRecord;
}

function asArray(value: unknown): unknown[] | null {
    return Array.isArray(value) ? value : null;
}

export function slimProject(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    return {
        name: row.name ?? null,
        projectUuid: row.projectUuid ?? null,
        type: row.type ?? null,
        warehouseType: row.warehouseType ?? null,
    };
}

export function slimSpace(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    const access = asArray(row.access);
    return {
        uuid: row.uuid ?? null,
        name: row.name ?? null,
        chartCount: row.chartCount ?? null,
        dashboardCount: row.dashboardCount ?? null,
        accessCount: access ? access.length : null,
    };
}

export function slimContentItem(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    return {
        contentType: row.contentType ?? null,
        uuid: row.uuid ?? null,
        name: row.name ?? null,
        views: row.views ?? null,
        webUrl: row.webUrl ?? null,
    };
}

export function slimChartSearchItem(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    const space = asRecord(row.space);
    return {
        uuid: row.uuid ?? null,
        name: row.name ?? null,
        chartKind: row.chartKind ?? null,
        spaceName: space?.name ?? null,
        views: row.views ?? null,
        webUrl: row.webUrl ?? null,
    };
}

export function slimDashboardSearchItem(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    const space = asRecord(row.space);
    return {
        uuid: row.uuid ?? null,
        name: row.name ?? null,
        views: row.views ?? null,
        webUrl: row.webUrl ?? null,
        spaceName: space?.name ?? null,
    };
}

export function slimExplore(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    return {
        name: row.name ?? null,
        label: row.label ?? null,
        groupLabel: row.groupLabel ?? null,
        heuristicScore: row.heuristicScore ?? null,
    };
}

export function slimSavedChart(item: unknown): AnyRecord {
    const row = asRecord(item) ?? {};
    const chart = asRecord(row.chart) ?? row;
    return {
        name: chart.name ?? null,
        tableName: chart.tableName ?? null,
        dimensions:
            asArray(asRecord(chart.metricQuery)?.dimensions) ??
            asArray(chart.dimensions) ??
            [],
        metrics:
            asArray(asRecord(chart.metricQuery)?.metrics) ??
            asArray(chart.metrics) ??
            [],
        filters:
            asRecord(asRecord(chart.metricQuery)?.filters) ?? asRecord(chart.filters),
        sorts:
            asArray(asRecord(chart.metricQuery)?.sorts) ?? asArray(chart.sorts) ?? [],
        chartType: asRecord(chart.chartConfig)?.type ?? chart.chartType ?? null,
        webUrl: row.webUrl ?? chart.webUrl ?? null,
    };
}

export function rowsToFlat(rows: unknown): unknown[] {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        const record = row as AnyRecord;
        return Object.entries(record).reduce<AnyRecord>((acc, [k, v]) => {
            const maybeValueObj = asRecord(v);
            if (maybeValueObj && 'value' in maybeValueObj) {
                acc[k] = maybeValueObj.value;
            } else {
                acc[k] = v;
            }
            return acc;
        }, {});
    });
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

/** Extract Lightdash ResultRow cell into raw + formatted pair. */
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
    if (
        nestedObj &&
        ('raw' in nestedObj || 'formatted' in nestedObj)
    ) {
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

export function rowsToScalarFlat(
    rows: unknown,
    valueFormat: MetricQueryValueFormat = 'raw',
): Record<string, unknown>[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
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

export function maybeSlimList(
    data: unknown,
    full: boolean,
    slimItem: (item: unknown) => AnyRecord,
): unknown {
    if (full) return data;
    if (Array.isArray(data)) return data.map(slimItem);
    const obj = asRecord(data);
    if (!obj) return data;
    const resultData = asArray(obj.data);
    if (!resultData) return data;
    return {
        ...obj,
        data: resultData.map(slimItem),
    };
}

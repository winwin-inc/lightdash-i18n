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
    const project = asRecord(row.project);
    const space = asRecord(row.space);
    return {
        contentType: row.contentType ?? null,
        uuid: row.uuid ?? null,
        name: row.name ?? null,
        views: row.views ?? null,
        webUrl: row.webUrl ?? null,
        chartKind: row.chartKind ?? null,
        spaceName: space?.name ?? null,
        projectUuid: project?.uuid ?? null,
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

function unwrapScalarValue(value: unknown): unknown {
    const valueObj = asRecord(value);
    if (!valueObj) return value;
    const nestedValue = valueObj.value;
    const nestedObj = asRecord(nestedValue);
    if (nestedObj) {
        if (nestedObj.formatted !== undefined && nestedObj.formatted !== null) {
            return nestedObj.formatted;
        }
        if (nestedObj.raw !== undefined) {
            return nestedObj.raw;
        }
    }
    if (valueObj.formatted !== undefined && valueObj.formatted !== null) {
        return valueObj.formatted;
    }
    if (valueObj.raw !== undefined) {
        return valueObj.raw;
    }
    return nestedValue ?? value;
}

export function rowsToScalarFlat(rows: unknown): Record<string, unknown>[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
            const record = row as AnyRecord;
            return Object.entries(record).reduce<Record<string, unknown>>(
                (acc, [k, v]) => {
                    acc[k] = unwrapScalarValue(v);
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

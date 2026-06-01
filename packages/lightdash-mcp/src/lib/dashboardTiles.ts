type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as AnyRecord;
}

export function extractDashboardChartTiles(
    tiles: unknown[],
    options: {
        full: boolean;
        savedChartsOnly: boolean;
        tileUuidKey?: 'uuid' | 'tileUuid';
    },
): unknown[] {
    const tileUuidKey = options.tileUuidKey ?? 'uuid';
    return tiles
        .filter((tile) => {
            if (!options.savedChartsOnly) return true;
            const row = asRecord(tile);
            return row?.type === 'saved_chart';
        })
        .map((tile) => {
            if (options.full) return tile;
            const row = asRecord(tile) ?? {};
            const properties = asRecord(row.properties) ?? {};
            return {
                [tileUuidKey]: row.uuid ?? null,
                type: row.type ?? null,
                x: row.x ?? null,
                y: row.y ?? null,
                w: row.w ?? null,
                h: row.h ?? null,
                chartUuid:
                    properties.savedChartUuid ??
                    properties.savedSqlUuid ??
                    null,
                chartName: properties.chartName ?? null,
            };
        });
}

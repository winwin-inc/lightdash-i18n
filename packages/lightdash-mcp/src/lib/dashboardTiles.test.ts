import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractDashboardChartTiles } from './dashboardTiles';

describe('extractDashboardChartTiles', () => {
    const tiles = [
        {
            uuid: 'tile-1',
            type: 'saved_chart',
            x: 0,
            y: 0,
            w: 12,
            h: 6,
            tabUuid: 'tab-a',
            properties: {
                savedChartUuid: 'chart-1',
                chartName: 'Sales',
                lastVersionChartKind: 'custom',
                chartSlug: 'sales',
            },
        },
        {
            uuid: 'tile-2',
            type: 'markdown',
            x: 0,
            y: 6,
            w: 12,
            h: 2,
            properties: {},
        },
        {
            uuid: 'tile-3',
            type: 'sql_chart',
            x: 0,
            y: 8,
            w: 6,
            h: 4,
            properties: {
                savedSqlUuid: 'sql-1',
                chartName: 'SQL tile',
                chartSlug: 'sql-tile',
            },
        },
    ];

    it('returns all tile types when savedChartsOnly is false', () => {
        const result = extractDashboardChartTiles(tiles, {
            full: false,
            savedChartsOnly: false,
        });
        assert.equal(result.length, 3);
    });

    it('filters to saved_chart tiles for list_charts and lifts chartKind', () => {
        const result = extractDashboardChartTiles(tiles, {
            full: false,
            savedChartsOnly: true,
            tileUuidKey: 'tileUuid',
        }) as Record<string, unknown>[];
        assert.equal(result.length, 1);
        assert.equal(result[0].tileUuid, 'tile-1');
        assert.equal(result[0].chartUuid, 'chart-1');
        assert.equal(result[0].chartName, 'Sales');
        assert.equal(result[0].chartKind, 'custom');
        assert.equal(result[0].tabUuid, 'tab-a');
        assert.equal(result[0].chartSlug, 'sales');
    });

    it('uses uuid key for get_dashboard_tiles compatibility', () => {
        const result = extractDashboardChartTiles(tiles, {
            full: false,
            savedChartsOnly: false,
        }) as Record<string, unknown>[];
        assert.equal(result[0].uuid, 'tile-1');
        assert.equal(result[2].chartKind, null);
        assert.equal(result[2].chartUuid, 'sql-1');
    });
});

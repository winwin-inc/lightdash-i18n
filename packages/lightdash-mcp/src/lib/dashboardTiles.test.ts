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
            properties: {
                savedChartUuid: 'chart-1',
                chartName: 'Sales',
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
    ];

    it('returns all tile types when savedChartsOnly is false', () => {
        const result = extractDashboardChartTiles(tiles, {
            full: false,
            savedChartsOnly: false,
        });
        assert.equal(result.length, 2);
    });

    it('filters to saved_chart tiles for list_charts', () => {
        const result = extractDashboardChartTiles(tiles, {
            full: false,
            savedChartsOnly: true,
            tileUuidKey: 'tileUuid',
        }) as Record<string, unknown>[];
        assert.equal(result.length, 1);
        assert.equal(result[0].tileUuid, 'tile-1');
        assert.equal(result[0].chartUuid, 'chart-1');
        assert.equal(result[0].chartName, 'Sales');
    });

    it('uses uuid key for get_dashboard_tiles compatibility', () => {
        const result = extractDashboardChartTiles(tiles, {
            full: false,
            savedChartsOnly: false,
        }) as Record<string, unknown>[];
        assert.equal(result[0].uuid, 'tile-1');
    });
});

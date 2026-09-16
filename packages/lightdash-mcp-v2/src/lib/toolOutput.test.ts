import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    slimChartSearchItem,
    slimContentItem,
    slimDashboardSearchItem,
    slimExplore,
    slimSavedChart,
    rowsToScalarFlat,
} from './toolOutput';

describe('rowsToScalarFlat', () => {
    const row = [
        {
            share: {
                value: {
                    raw: 0.0817654321,
                    formatted: '8.2%',
                },
            },
        },
    ];

    it('returns raw by default', () => {
        assert.equal(rowsToScalarFlat(row)[0]?.share, 0.0817654321);
    });

    it('returns formatted when valueFormat is formatted', () => {
        assert.equal(
            rowsToScalarFlat(row, 'formatted')[0]?.share,
            '8.2%',
        );
    });
});

describe('content slim outputs', () => {
    const baseItem = {
        contentType: 'chart',
        uuid: 'uuid-1',
        name: 'demo',
        views: 42,
        webUrl: 'http://example/chart',
        chartKind: 'line',
        space: { name: 'Shared' },
        project: { uuid: 'project-1' },
    };

    it('slimContentItem keeps chartKind for chart items', () => {
        assert.deepEqual(slimContentItem(baseItem), {
            contentType: 'chart',
            uuid: 'uuid-1',
            name: 'demo',
            views: 42,
            webUrl: 'http://example/chart',
            chartKind: 'line',
        });
    });

    it('slimContentItem sets chartKind null for non-chart items', () => {
        assert.deepEqual(
            slimContentItem({
                ...baseItem,
                contentType: 'dashboard',
                chartKind: 'line',
            }),
            {
                contentType: 'dashboard',
                uuid: 'uuid-1',
                name: 'demo',
                views: 42,
                webUrl: 'http://example/chart',
                chartKind: null,
            },
        );
    });

    it('slimChartSearchItem keeps chart-specific fields', () => {
        assert.deepEqual(slimChartSearchItem(baseItem), {
            uuid: 'uuid-1',
            name: 'demo',
            chartKind: 'line',
            spaceName: 'Shared',
            views: 42,
            webUrl: 'http://example/chart',
        });
    });

    it('slimDashboardSearchItem keeps dashboard-specific fields', () => {
        assert.deepEqual(slimDashboardSearchItem(baseItem), {
            uuid: 'uuid-1',
            name: 'demo',
            views: 42,
            webUrl: 'http://example/chart',
            spaceName: 'Shared',
        });
    });
});

describe('slimExplore', () => {
    it('keeps nested groups and groupLabel', () => {
        assert.deepEqual(
            slimExplore({
                name: 'orders',
                label: 'Orders',
                groups: ['frontend', 'nezha'],
                groupLabel: 'legacy',
                heuristicScore: 1.2,
            }),
            {
                name: 'orders',
                label: 'Orders',
                groups: ['frontend', 'nezha'],
                groupLabel: 'legacy',
                heuristicScore: 1.2,
            },
        );
    });

    it('sets groups null when missing', () => {
        assert.equal(
            slimExplore({ name: 'orders', label: 'Orders' }).groups,
            null,
        );
    });
});

describe('slimSavedChart', () => {
    it('exposes both chartKind and chartType', () => {
        const slim = slimSavedChart({
            name: 'Tea share',
            tableName: 'tea',
            metricQuery: {
                dimensions: ['d1'],
                metrics: ['m1'],
                filters: {},
                sorts: [],
            },
            chartConfig: {
                type: 'custom',
                config: { spec: {} },
            },
            webUrl: 'http://example/chart',
        });
        assert.equal(slim.chartKind, 'custom');
        assert.equal(slim.chartType, 'custom');
        assert.equal(slim.webUrl, 'http://example/chart');
    });

    it('derives line chartKind while chartType stays cartesian', () => {
        const slim = slimSavedChart({
            name: 'Trend',
            tableName: 'sales',
            chartConfig: {
                type: 'cartesian',
                config: {
                    layout: { xField: 'x', yField: ['y'] },
                    eChartsConfig: {
                        series: [{ type: 'line' }],
                    },
                },
            },
        });
        assert.equal(slim.chartKind, 'line');
        assert.equal(slim.chartType, 'cartesian');
    });

    it('returns null chartKind on dirty config without throwing', () => {
        const slim = slimSavedChart({
            name: 'Broken',
            chartConfig: { type: 'not-a-real-type' },
        });
        assert.equal(slim.chartKind, null);
        assert.equal(slim.chartType, 'not-a-real-type');
    });
});

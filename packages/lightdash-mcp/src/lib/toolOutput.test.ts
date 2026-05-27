import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    slimChartSearchItem,
    slimContentItem,
    slimDashboardSearchItem,
} from './toolOutput';

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

    it('slimContentItem keeps mixed-content default fields', () => {
        assert.deepEqual(slimContentItem(baseItem), {
            contentType: 'chart',
            uuid: 'uuid-1',
            name: 'demo',
            views: 42,
            webUrl: 'http://example/chart',
        });
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

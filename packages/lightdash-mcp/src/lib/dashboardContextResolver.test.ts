import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildDashboardSelectionRequiredResult,
    createDashboardContextResolver,
} from './dashboardContextResolver';

describe('createDashboardContextResolver', () => {
    it('resolves explicit dashboardUuid', async () => {
        const api = {
            getDashboard: async () => ({
                uuid: 'dash-explicit',
                slug: 'explicit-slug',
                name: 'Explicit Dashboard',
            }),
            getDashboardContexts: async () => {
                throw new Error('should not call context API');
            },
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            dashboardUuid: 'dash-explicit',
            exploreName: 'report_newproduct_hotsales',
        });
        assert.equal(resolved.status, 'resolved');
        if (resolved.status === 'resolved') {
            assert.deepEqual(resolved.context, {
                dashboardUuid: 'dash-explicit',
                dashboardSlug: 'explicit-slug',
                dashboardName: 'Explicit Dashboard',
                source: 'explicitDashboardUuid',
                candidateCount: 1,
            });
        }
    });

    it('does not auto-select when explore has related dashboards', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [
                    {
                        dashboardUuid: 'b',
                        dashboardSlug: 'beta',
                        dashboardName: 'Beta',
                        chartUuids: ['c2'],
                    },
                    {
                        dashboardUuid: 'a',
                        dashboardSlug: 'alpha',
                        dashboardName: 'Alpha',
                        chartUuids: ['c1'],
                    },
                ],
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'report_newproduct_hotsales',
        });
        assert.equal(resolved.status, 'needs_selection');
        if (resolved.status === 'needs_selection') {
            assert.equal(resolved.candidateCount, 2);
            assert.equal(resolved.candidates[0].dashboardName, 'Alpha');
            assert.equal(resolved.source, 'exploreName');
        }
    });

    it('returns none when chart has no dashboards', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({ contexts: [] }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            chartUuid: 'chart-1',
        });
        assert.equal(resolved.status, 'none');
    });

    it('caches explore context lookups briefly', async () => {
        let calls = 0;
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => {
                calls += 1;
                return {
                    contexts: [
                        {
                            dashboardUuid: 'd1',
                            dashboardSlug: 'slug-1',
                            dashboardName: 'Dash 1',
                            chartUuids: ['c1'],
                        },
                    ],
                };
            },
        };
        const resolver = createDashboardContextResolver(api as never, {
            cacheTtlMs: 60_000,
        });
        await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orders',
        });
        assert.equal(calls, 1);
    });
});

describe('buildDashboardSelectionRequiredResult', () => {
    it('returns selectable candidates without running a query', () => {
        const result = buildDashboardSelectionRequiredResult({
            source: 'exploreName',
            exploreName: 'report_newproduct_hotsales',
            candidates: [
                {
                    dashboardUuid: 'd1',
                    dashboardSlug: 'slug-1',
                    dashboardName: 'Dash 1',
                },
            ],
        });
        assert.equal(
            (result.structuredContent as { status?: string })?.status,
            'dashboard_selection_required',
        );
        assert.equal(
            (result.structuredContent as { candidateCount?: number })
                ?.candidateCount,
            1,
        );
    });
});

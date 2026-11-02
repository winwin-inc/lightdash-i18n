import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LightdashApiError } from '../rest/requestBase';
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
                projectUuid: 'proj',
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

    it('throws when explicit dashboardUuid belongs to another project', async () => {
        const api = {
            getDashboard: async () => ({
                uuid: 'dash-other',
                slug: 'other',
                name: 'Other Dashboard',
                projectUuid: 'proj-other',
            }),
            getDashboardContexts: async () => {
                throw new Error('should not call context API');
            },
        };
        const resolver = createDashboardContextResolver(api as never);
        await assert.rejects(
            () =>
                resolver.resolve({
                    apiKey: 'key',
                    projectUuid: 'proj',
                    dashboardUuid: 'dash-other',
                    exploreName: 'orders',
                }),
            (error: unknown) => {
                assert.ok(error instanceof LightdashApiError);
                assert.equal(error.status, 404);
                assert.match(error.detail, /does not belong to project/i);
                return true;
            },
        );
    });

    it('does not swallow errors when explicit dashboardUuid cannot be fetched', async () => {
        const api = {
            getDashboard: async () => {
                throw new LightdashApiError(
                    403,
                    "You don't have access to this dashboard",
                );
            },
            getDashboardContexts: async () => {
                throw new Error('should not call context API');
            },
        };
        const resolver = createDashboardContextResolver(api as never);
        await assert.rejects(
            () =>
                resolver.resolve({
                    apiKey: 'key',
                    projectUuid: 'proj',
                    dashboardUuid: 'dash-forbidden',
                    exploreName: 'orders',
                }),
            (error: unknown) => {
                assert.ok(error instanceof LightdashApiError);
                assert.equal(error.status, 403);
                return true;
            },
        );
    });

    it('auto-resolves when explore has exactly one related dashboard', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [
                    {
                        dashboardUuid: 'd1',
                        dashboardSlug: 'c60',
                        dashboardName: '新品数据库',
                        chartUuids: ['c1'],
                    },
                ],
                associatedCount: 1,
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'report_newproduct_hotsales',
        });
        assert.equal(resolved.status, 'resolved');
        if (resolved.status === 'resolved') {
            assert.equal(resolved.context.dashboardUuid, 'd1');
            assert.equal(resolved.context.dashboardSlug, 'c60');
            assert.equal(resolved.context.dashboardName, '新品数据库');
            assert.equal(resolved.context.source, 'uniqueExploreContext');
            assert.equal(resolved.context.candidateCount, 1);
        }
    });

    it('auto-resolves when chart has exactly one related dashboard', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [
                    {
                        dashboardUuid: 'dash-chart',
                        dashboardSlug: 'slug-chart',
                        dashboardName: 'Chart Dash',
                        chartUuids: ['chart-1'],
                    },
                ],
                associatedCount: 1,
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            chartUuid: 'chart-1',
        });
        assert.equal(resolved.status, 'resolved');
        if (resolved.status === 'resolved') {
            assert.equal(resolved.context.dashboardUuid, 'dash-chart');
            assert.equal(resolved.context.source, 'uniqueChartContext');
        }
    });

    it('selects first (sorted) when explore has multiple related dashboards', async () => {
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
                associatedCount: 2,
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'report_newproduct_hotsales',
        });
        assert.equal(resolved.status, 'resolved');
        if (resolved.status === 'resolved') {
            assert.equal(resolved.context.source, 'firstExploreContext');
            assert.equal(resolved.context.candidateCount, 2);
            assert.equal(resolved.context.dashboardUuid, 'a');
            assert.equal(resolved.context.dashboardName, 'Alpha');
            assert.equal(resolved.context.candidates?.length, 2);
            assert.equal(resolved.context.candidates?.[0].dashboardName, 'Alpha');
            assert.equal(resolved.context.candidates?.[1].dashboardName, 'Beta');
        }
    });

    it('selects first (sorted) when chart has multiple related dashboards', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [
                    {
                        dashboardUuid: 'd1',
                        dashboardSlug: 's1',
                        dashboardName: 'First',
                        chartUuids: ['chart-1'],
                    },
                    {
                        dashboardUuid: 'd2',
                        dashboardSlug: 's2',
                        dashboardName: 'Second',
                        chartUuids: ['chart-1'],
                    },
                ],
                associatedCount: 2,
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            chartUuid: 'chart-1',
        });
        assert.equal(resolved.status, 'resolved');
        if (resolved.status === 'resolved') {
            assert.equal(resolved.context.source, 'firstChartContext');
            assert.equal(resolved.context.dashboardUuid, 'd1');
            assert.equal(resolved.context.dashboardName, 'First');
            assert.equal(resolved.context.candidates?.length, 2);
            assert.equal(resolved.context.candidates?.[0].dashboardName, 'First');
        }
    });

    it('returns needs_selection for multiple candidates when blockOnMultiple is on', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [
                    {
                        dashboardUuid: 'd1',
                        dashboardSlug: 's1',
                        dashboardName: 'First',
                        chartUuids: ['chart-1'],
                    },
                    {
                        dashboardUuid: 'd2',
                        dashboardSlug: 's2',
                        dashboardName: 'Second',
                        chartUuids: ['chart-1'],
                    },
                ],
                associatedCount: 2,
            }),
        };
        const resolver = createDashboardContextResolver(api as never, {
            blockOnMultiple: true,
            publicBaseUrl: 'https://example.com',
        });
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            chartUuid: 'chart-1',
        });
        assert.equal(resolved.status, 'needs_selection');
        if (resolved.status === 'needs_selection') {
            assert.equal(resolved.source, 'chartUuid');
            assert.equal(resolved.candidateCount, 2);
            assert.equal(
                resolved.candidates[0].dashboardUrl,
                'https://example.com/projects/proj/dashboards/d1/view',
            );
        }
    });

    it('returns none when chart has no dashboards', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [],
                associatedCount: 0,
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            chartUuid: 'chart-1',
        });
        assert.equal(resolved.status, 'none');
        if (resolved.status === 'none') {
            assert.equal(resolved.associatedCount, 0);
        }
    });

    it('returns none when explore has no dashboards', async () => {
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => ({
                contexts: [],
                associatedCount: 3,
            }),
        };
        const resolver = createDashboardContextResolver(api as never);
        const resolved = await resolver.resolve({
            apiKey: 'key',
            projectUuid: 'proj',
            exploreName: 'orphan_explore',
        });
        assert.equal(resolved.status, 'none');
        if (resolved.status === 'none') {
            assert.equal(resolved.associatedCount, 3);
        }
    });

    it('keeps associatedCount undefined when the backend did not return it', async () => {
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
            exploreName: 'orphan_explore',
        });
        assert.equal(resolved.status, 'none');
        if (resolved.status === 'none') {
            assert.equal(resolved.associatedCount, null);
        }
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
                    associatedCount: 1,
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

    it('bypasses the cache when asked (blocking path re-check)', async () => {
        let calls = 0;
        const api = {
            getDashboard: async () => {
                throw new Error('should not call getDashboard');
            },
            getDashboardContexts: async () => {
                calls += 1;
                return {
                    contexts: [],
                    associatedCount: 0,
                };
            },
        };
        const resolver = createDashboardContextResolver(api as never, {
            cacheTtlMs: 60_000,
        });
        const first = await resolver.fetchContexts('key', 'proj', {
            exploreName: 'orders',
        });
        const second = await resolver.fetchContexts(
            'key',
            'proj',
            { exploreName: 'orders' },
            { bypassCache: true },
        );
        assert.equal(calls, 2);
        assert.equal(first.associatedCount, 0);
        assert.equal(second.associatedCount, 0);
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

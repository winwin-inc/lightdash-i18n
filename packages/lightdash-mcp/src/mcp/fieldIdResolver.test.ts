import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    createFieldIdResolverFromExplore,
    exploreRequiresDashboardContext,
} from './fieldIdResolver';

describe('exploreRequiresDashboardContext', () => {
    it('returns false when explore has no base table sqlWhere', () => {
        assert.equal(
            exploreRequiresDashboardContext({
                baseTable: 'orders',
                tables: {
                    orders: {},
                },
            }),
            false,
        );
    });

    it('returns false for sqlWhere unrelated to dashboardSlug', () => {
        assert.equal(
            exploreRequiresDashboardContext({
                baseTable: 'orders',
                tables: {
                    orders: {
                        sqlWhere: "${lightdash.user.email} = 'a@example.com'",
                    },
                },
            }),
            false,
        );
    });

    it('detects uncompiled dashboardSlug sql_filter', () => {
        assert.equal(
            exploreRequiresDashboardContext({
                baseTable: 'orders',
                tables: {
                    orders: {
                        uncompiledSqlWhere:
                            "${lightdash.user.dashboardSlug} = 'NA' OR short_name = ${lightdash.user.dashboardSlug}",
                    },
                },
            }),
            true,
        );
    });

    it('detects compiled dashboardSlug references', () => {
        assert.equal(
            exploreRequiresDashboardContext({
                baseTable: 'orders',
                tables: {
                    orders: {
                        sqlWhere:
                            "dashboardSlug = 'NA' OR short_name = dashboardSlug",
                    },
                },
            }),
            true,
        );
    });

    it('only checks the base table to match backend query builder behavior', () => {
        assert.equal(
            exploreRequiresDashboardContext({
                baseTable: 'orders',
                tables: {
                    orders: {},
                    users: {
                        sqlWhere:
                            "${lightdash.user.dashboardSlug} = users.dashboard_slug",
                    },
                },
            }),
            false,
        );
    });
});

describe('createFieldIdResolverFromExplore', () => {
    it('resolves aliases from field ids and labels', () => {
        const resolve = createFieldIdResolverFromExplore(
            {
                tables: {
                    orders: {
                        dimensions: {
                            status: {
                                fieldId: 'orders_status',
                                name: 'status',
                                label: 'Order Status',
                            },
                        },
                    },
                },
            },
            'orders',
        );

        assert.equal(resolve('status'), 'orders_status');
        assert.equal(resolve('Order Status'), 'orders_status');
    });
});

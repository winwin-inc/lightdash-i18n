import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import {
    assertExploreQueryable,
    exploreQueryDenialReason,
    formatExploreQueryDeniedMessage,
    resetClassifiedExploresCacheForTests,
} from './assertExploreQueryable';
import type { ClassifiedExplores } from './classifyExplores';

const allowed = {
    name: 'pinleibaohsm_cls_top',
    label: '类目分析&TOP商品',
    groupLabel: '品类宝HSM',
};
const denied = {
    name: 'restricted_explore',
    label: '受限表',
    groupLabel: '其他',
};

const queryableClassified: ClassifiedExplores = {
    queryable: [allowed],
    metadataOnly: [],
    attributeDenied: [denied],
};

const metadataOnlyClassified: ClassifiedExplores = {
    queryable: [],
    metadataOnly: [allowed],
    attributeDenied: [],
};

function exploreRule(projectUuid: string) {
    return {
        action: 'view',
        subject: 'Explore',
        conditions: { projectUuid },
    };
}

function createAccessApi(params: {
    projectUuid: string;
    runMetricQuery: boolean;
    explores: Array<{ name: string; label?: string; groupLabel?: string }>;
    catalog: Array<{ name: string; label?: string; groupLabel?: string }>;
    onCatalog?: () => void;
}): LightdashRestClient {
    return {
        getAuthenticatedUser: async () => ({
            abilityRules: params.runMetricQuery
                ? [exploreRule(params.projectUuid)]
                : [],
        }),
        listExplores: async () => params.explores,
        getCatalog: async () => {
            params.onCatalog?.();
            return { data: params.catalog };
        },
    } as unknown as LightdashRestClient;
}

describe('exploreQueryDenialReason', () => {
    it('allows queryable tables', () => {
        assert.equal(
            exploreQueryDenialReason(queryableClassified, allowed.name),
            null,
        );
    });

    it('rejects attributeDenied tables', () => {
        assert.equal(
            exploreQueryDenialReason(queryableClassified, denied.name),
            'attribute_denied',
        );
    });

    it('rejects metadataOnly tables in metric mode', () => {
        assert.equal(
            exploreQueryDenialReason(metadataOnlyClassified, allowed.name),
            'no_run_metric_query',
        );
    });

    it('allows metadataOnly tables in fieldValues mode', () => {
        assert.equal(
            exploreQueryDenialReason(
                metadataOnlyClassified,
                allowed.name,
                'fieldValues',
            ),
            null,
        );
    });

    it('rejects attributeDenied tables in fieldValues mode', () => {
        assert.equal(
            exploreQueryDenialReason(
                queryableClassified,
                denied.name,
                'fieldValues',
            ),
            'attribute_denied',
        );
    });

    it('rejects unknown tables', () => {
        assert.equal(
            exploreQueryDenialReason(queryableClassified, 'missing_table'),
            'unknown_explore',
        );
    });
});

describe('formatExploreQueryDeniedMessage', () => {
    it('tells the agent to use queryable tables for attribute denial', () => {
        const message = formatExploreQueryDeniedMessage(
            denied.name,
            'attribute_denied',
        );
        assert.match(message, /已拒绝查询「restricted_explore」/);
        assert.match(message, /用户属性不满足/);
        assert.match(message, /explores\.queryable/);
    });
});

describe('assertExploreQueryable', () => {
    afterEach(() => {
        resetClassifiedExploresCacheForTests();
    });

    it('allows a catalog table when runMetricQuery is true', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.doesNotReject(() =>
            assertExploreQueryable(
                api,
                'key',
                'project-1',
                allowed.name,
            ),
        );
    });

    it('rejects an attributeDenied table', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    denied.name,
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /已拒绝查询「restricted_explore」/);
                assert.match(error.message, /用户属性不满足/);
                return true;
            },
        );
    });

    it('allows a catalog table in fieldValues mode when runMetricQuery is false', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.doesNotReject(() =>
            assertExploreQueryable(
                api,
                'key',
                'project-1',
                allowed.name,
                'fieldValues',
            ),
        );
    });

    it('rejects an attributeDenied table in fieldValues mode', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed, denied],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    denied.name,
                    'fieldValues',
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /用户属性不满足/);
                return true;
            },
        );
    });

    it('rejects an unknown table in fieldValues mode', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    'missing_table',
                    'fieldValues',
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /不存在或不在当前项目可访问表中/);
                return true;
            },
        );
    });

    it('rejects a catalog table when runMetricQuery is false', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: false,
            explores: [allowed],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    allowed.name,
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /不能跑临时指标查询/);
                return true;
            },
        );
    });

    it('rejects an unknown table', async () => {
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
        });
        await assert.rejects(
            () =>
                assertExploreQueryable(
                    api,
                    'key',
                    'project-1',
                    'missing_table',
                ),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /不存在或不在当前项目可访问表中/);
                return true;
            },
        );
    });

    it('reuses classified explores within the TTL', async () => {
        let catalogCalls = 0;
        const api = createAccessApi({
            projectUuid: 'project-1',
            runMetricQuery: true,
            explores: [allowed],
            catalog: [allowed],
            onCatalog: () => {
                catalogCalls += 1;
            },
        });
        await assertExploreQueryable(api, 'key', 'project-1', allowed.name);
        await assertExploreQueryable(api, 'key', 'project-1', allowed.name);
        assert.equal(catalogCalls, 1);
    });
});

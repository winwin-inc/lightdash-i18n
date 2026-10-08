import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    classifyExplores,
    collectExploreAccessItems,
} from './classifyExplores';

describe('classifyExplores', () => {
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

    it('puts catalog tables into queryable when runMetricQuery is true', () => {
        const result = classifyExplores(
            [allowed, denied],
            [allowed],
            true,
        );
        assert.deepEqual(result.queryable, [allowed]);
        assert.deepEqual(result.metadataOnly, []);
        assert.deepEqual(result.attributeDenied, [denied]);
    });

    it('puts catalog tables into metadataOnly when runMetricQuery is false', () => {
        const result = classifyExplores([allowed], [allowed], false);
        assert.deepEqual(result.queryable, []);
        assert.deepEqual(result.metadataOnly, [allowed]);
        assert.deepEqual(result.attributeDenied, []);
    });
});

describe('collectExploreAccessItems', () => {
    it('reads arrays and catalog { data } payloads', () => {
        assert.deepEqual(
            collectExploreAccessItems({
                data: [{ name: 'orders', label: '订单', groupLabel: '销售' }],
            }),
            [{ name: 'orders', label: '订单', groupLabel: '销售' }],
        );
        assert.deepEqual(collectExploreAccessItems([{ name: 'orders' }]), [
            { name: 'orders', label: 'orders', groupLabel: null },
        ]);
    });
});

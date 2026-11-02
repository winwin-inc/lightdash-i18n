import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    classifyExplores,
    collectExploreAccessItems,
    isRestrictedScope,
    isScopeAuthorizationUnavailable,
    toExploreScopeInfo,
    unknownExploreScope,
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

describe('explore scope helpers', () => {
    it('parses the clientUse diagnostics payload', () => {
        assert.deepEqual(
            toExploreScopeInfo({
                scopeApplied: true,
                status: 'rpc_error',
                allowedDashboardNames: ['不应外发'],
            }),
            { scopeApplied: true, clientUseStatus: 'rpc_error' },
        );
    });

    it('falls back to unknown scope for missing / malformed payloads', () => {
        assert.deepEqual(toExploreScopeInfo(undefined), unknownExploreScope());
        assert.deepEqual(toExploreScopeInfo('nope'), unknownExploreScope());
        assert.deepEqual(
            toExploreScopeInfo({ status: 'rpc_ok' }),
            { scopeApplied: null, clientUseStatus: 'rpc_ok' },
        );
    });

    it('treats only scopeApplied === true as a restricted role', () => {
        assert.equal(isRestrictedScope({ scopeApplied: true, clientUseStatus: 'rpc_ok' }), true);
        assert.equal(isRestrictedScope({ scopeApplied: false, clientUseStatus: 'role_not_restricted' }), false);
        assert.equal(isRestrictedScope(unknownExploreScope()), false);
    });

    it('flags allow-list outages only for restricted roles', () => {
        // 后端 rpc_error / no_email(无邮箱) 会返回空白名单（scopeApplied=true）
        assert.equal(
            isScopeAuthorizationUnavailable({
                scopeApplied: true,
                clientUseStatus: 'rpc_error',
            }),
            true,
        );
        assert.equal(
            isScopeAuthorizationUnavailable({
                scopeApplied: true,
                clientUseStatus: 'no_email',
            }),
            true,
        );
        // 后端 fail-open 的两态（不收窄）不算故障
        assert.equal(
            isScopeAuthorizationUnavailable({
                scopeApplied: false,
                clientUseStatus: 'rpc_not_configured',
            }),
            false,
        );
        // rpc_empty 是「确实没授权」，不是故障
        assert.equal(
            isScopeAuthorizationUnavailable({
                scopeApplied: true,
                clientUseStatus: 'rpc_empty',
            }),
            false,
        );
    });

    it('keeps the scope on the classification result', () => {
        const scope = { scopeApplied: true, clientUseStatus: 'rpc_ok' };
        assert.deepEqual(
            classifyExplores([], [], true, scope).scope,
            scope,
        );
        assert.deepEqual(
            classifyExplores([], [], true).scope,
            unknownExploreScope(),
        );
    });
});

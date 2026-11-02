import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    toClientUseDiagnostics,
    withOptionalExplores,
} from './registerAccessTools';

const base = {
    projectUuid: 'project-1',
    name: '示例项目',
    projectRole: 'interactive_viewer' as const,
    effectiveAccessLevel: 'interactive_viewer' as const,
    effectiveCapabilities: {
        browseContent: true,
        runSavedChart: true,
        runMetricQuery: true,
        exportDashboardCode: false,
    },
};

const explores = {
    queryable: [
        { name: 'orders', label: '订单', groupLabel: '销售' },
    ],
    metadataOnly: [],
    attributeDenied: [
        { name: 'restricted', label: '受限表', groupLabel: null },
    ],
};

describe('withOptionalExplores', () => {
    it('omits explores when includeExplores is false', () => {
        const result = withOptionalExplores(base, false, explores);
        assert.equal('explores' in result, false);
        assert.deepEqual(result, base);
    });

    it('attaches the three explore groups when includeExplores is true', () => {
        const result = withOptionalExplores(base, true, explores);
        assert.deepEqual(
            'explores' in result ? result.explores : undefined,
            explores,
        );
    });
});

describe('toClientUseDiagnostics', () => {
    it('returns null when the backend does not send clientUse', () => {
        assert.equal(toClientUseDiagnostics(undefined, false), null);
    });

    it('never forwards dashboard metadata from the diagnostics payload', () => {
        const result = toClientUseDiagnostics(
            {
                scopeApplied: true,
                status: 'rpc_ok',
                effectiveProjectRole: 'viewer',
                allowedDashboardUuids: ['d1'],
                allowedDashboardNames: ['类目看板'],
                allowedDashboardCount: 1,
            },
            true,
        );
        assert.deepEqual(result, {
            scopeApplied: true,
            restrictedRole: true,
            status: 'rpc_ok',
            effectiveProjectRole: 'viewer',
            reason: null,
        });
        assert.doesNotMatch(JSON.stringify(result), /类目看板|d1/);
    });

    it('hides the reason when it embeds the mobile number (rpc_ok / rpc_empty)', () => {
        assert.equal(
            toClientUseDiagnostics(
                { scopeApplied: true, status: 'rpc_empty', reason: '手机号 138**** 没有授权看板' },
                true,
            )?.reason,
            null,
        );
        assert.equal(
            toClientUseDiagnostics(
                {
                    scopeApplied: false,
                    status: 'role_not_restricted',
                    reason: '角色不受限',
                },
                false,
            )?.reason,
            '角色不受限',
        );
    });
});

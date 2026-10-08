import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withOptionalExplores } from './registerAccessTools';

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

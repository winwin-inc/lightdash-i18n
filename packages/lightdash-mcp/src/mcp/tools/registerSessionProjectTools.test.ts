import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCurrentProjectContext } from './registerSessionProjectTools';

describe('getCurrentProjectContext', () => {
    it('prefers session project', () => {
        const context = getCurrentProjectContext(
            {
                projectUuid: 'session-project',
                projectName: 'Session',
                tags: null,
                updatedAtMs: Date.now(),
            },
            'env-project',
        );
        assert.equal(context.source, 'session');
        assert.equal(context.effectiveProjectUuid, 'session-project');
    });

    it('uses env project when session missing', () => {
        const context = getCurrentProjectContext(
            {
                projectUuid: null,
                projectName: null,
                tags: null,
                updatedAtMs: Date.now(),
            },
            'env-project',
        );
        assert.equal(context.source, 'env');
        assert.equal(context.effectiveProjectUuid, 'env-project');
    });

    it('returns none when both missing', () => {
        const context = getCurrentProjectContext(
            {
                projectUuid: null,
                projectName: null,
                tags: null,
                updatedAtMs: Date.now(),
            },
            null,
        );
        assert.equal(context.source, 'none');
        assert.equal(context.effectiveProjectUuid, null);
    });
});

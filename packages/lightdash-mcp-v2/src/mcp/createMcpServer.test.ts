import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSharedExploreCache } from '../lib/sharedExploreCache';
import { createExploreCacheKey } from './createMcpServer';

describe('explore cache authorization dimension', () => {
    it('isolates cache entries per credential', () => {
        const cache = createSharedExploreCache();
        const projectUuid = 'project-1';
        const exploreName = 'orders';

        const keyA = createExploreCacheKey(
            'pat-a',
            projectUuid,
            exploreName,
            undefined,
        );
        const keyB = createExploreCacheKey(
            'pat-b',
            projectUuid,
            exploreName,
            undefined,
        );

        cache.set(keyA, {
            expiresAtMs: Date.now() + 60_000,
            explore: { name: 'orders', owner: 'pat-a' },
            resolve: (field: string) => field,
            requiresDashboardContext: false,
        });

        assert.ok(cache.get(keyA));
        assert.equal(cache.get(keyB), undefined);
    });

    it('isolates cache entries per user attributes context', () => {
        const keyA = createExploreCacheKey(
            'pat-a',
            'project-1',
            'orders',
            '{"region":"east"}',
        );
        const keyB = createExploreCacheKey(
            'pat-a',
            'project-1',
            'orders',
            '{"region":"west"}',
        );
        assert.notEqual(keyA, keyB);
    });

    it('uses authorization hash without exposing credentials', () => {
        const key = createExploreCacheKey(
            'pat-a',
            'p',
            'orders',
            undefined,
        );
        assert.match(key, /^[a-f0-9]{64}:p:orders$/);
        assert.equal(key.includes('pat-a'), false);
    });
});

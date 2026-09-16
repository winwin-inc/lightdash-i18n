import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeMetricQueryRequest } from './normalizeMetricQuery';

describe('normalizeMetricQueryRequest offset', () => {
    it('preserves non-negative finite offset', () => {
        const out = normalizeMetricQueryRequest({
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            limit: 100,
            offset: 2000,
        });
        assert.equal(out.limit, 100);
        assert.equal(out.offset, 2000);
    });

    it('floors offset', () => {
        const out = normalizeMetricQueryRequest({
            exploreName: 'orders',
            offset: 10.9,
        });
        assert.equal(out.offset, 10);
    });

    it('omits invalid or negative offset', () => {
        const a = normalizeMetricQueryRequest({
            exploreName: 'orders',
            offset: -1,
        });
        assert.equal('offset' in a, false);
        const b = normalizeMetricQueryRequest({
            exploreName: 'orders',
            offset: Number.NaN,
        });
        assert.equal('offset' in b, false);
        const c = normalizeMetricQueryRequest({
            exploreName: 'orders',
        });
        assert.equal('offset' in c, false);
    });
});

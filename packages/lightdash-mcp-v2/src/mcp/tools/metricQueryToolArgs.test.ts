import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toMetricQueryFieldIds, toStringArray } from './metricQueryToolArgs';

describe('toStringArray', () => {
    it('wraps a single field id string', () => {
        assert.deepEqual(toStringArray('orders_date'), ['orders_date']);
    });
});

describe('toMetricQueryFieldIds', () => {
    it('accepts array of field ids', () => {
        assert.deepEqual(toMetricQueryFieldIds(['a', 'b']), ['a', 'b']);
    });

    it('accepts single field id string without throwing', () => {
        assert.deepEqual(toMetricQueryFieldIds('orders_date'), ['orders_date']);
    });
});

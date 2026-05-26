import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    collectFieldsFromExplore,
    resolveFieldIdFromParts,
} from './registerExploreCatalogTools';

describe('resolveFieldIdFromParts', () => {
    it('prefers explicit fieldId', () => {
        assert.equal(
            resolveFieldIdFromParts('orders_count', 'orders', 'count'),
            'orders_count',
        );
    });

    it('builds fieldId from table and name when missing', () => {
        assert.equal(
            resolveFieldIdFromParts(undefined, 'orders', 'order_date'),
            'orders_order_date',
        );
    });
});

describe('collectFieldsFromExplore', () => {
    it('extracts fields from standard explore tables dimensions/metrics', () => {
        const explore = {
            tables: [
                {
                    name: 'orders',
                    dimensions: [{ name: 'order_date', label: '订单日期' }],
                    metrics: [{ name: 'order_count', label: '订单数' }],
                },
            ],
        };
        const fields = collectFieldsFromExplore(explore);
        assert.deepEqual(
            fields.map((f) => f.fieldId).sort(),
            ['orders_order_count', 'orders_order_date'],
        );
    });
});

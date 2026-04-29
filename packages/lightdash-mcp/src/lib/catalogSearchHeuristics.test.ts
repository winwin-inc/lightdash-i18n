import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    extractCatalogItems,
    scoreCatalogItem,
    sortCatalogByHeuristic,
} from './catalogSearchHeuristics';

describe('extractCatalogItems', () => {
    it('unwraps plain arrays', () => {
        const a = [{ name: 'a' }, { name: 'b' }];
        assert.deepEqual(extractCatalogItems(a), a);
    });

    it('unwraps { data: [] }', () => {
        const inner = [{ name: 'x' }];
        assert.deepEqual(extractCatalogItems({ data: inner }), inner);
    });

    it('returns empty for unknown shapes', () => {
        assert.deepEqual(extractCatalogItems(null), []);
        assert.deepEqual(extractCatalogItems({}), []);
    });
});

describe('sortCatalogByHeuristic', () => {
    it('ranks exact name match above partial description', () => {
        const items = [
            { name: 'orders', label: 'Orders', description: 'sales' },
            { name: 'other', label: 'X', description: 'orders pipeline' },
        ];
        const out = sortCatalogByHeuristic(items, 'orders');
        assert.equal(out[0]?.name, 'orders');
        assert.ok((out[0]?.heuristicScore ?? 0) > (out[1]?.heuristicScore ?? 0));
    });

    it('stable order when scores tie', () => {
        const items = [
            { name: 'b_table', label: 'B' },
            { name: 'a_table', label: 'A' },
        ];
        const out = sortCatalogByHeuristic(items, 'zzz_no_match');
        assert.equal(out[0]?.name, 'a_table');
        assert.equal(out[1]?.name, 'b_table');
    });

    it('attaches heuristicScore to each row', () => {
        const items = [{ name: 'foo', label: 'Foo' }];
        const out = sortCatalogByHeuristic(items, 'foo');
        assert.equal(out.length, 1);
        assert.ok(typeof out[0]?.heuristicScore === 'number');
    });
});

describe('scoreCatalogItem', () => {
    it('returns 0 for empty query', () => {
        assert.equal(scoreCatalogItem({ name: 'a' }, '   '), 0);
    });
});

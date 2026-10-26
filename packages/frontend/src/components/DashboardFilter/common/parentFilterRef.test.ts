import { describe, expect, it } from 'vitest';
import {
    applyParentFilterRef,
    decodeParentFilterRef,
    encodeParentFilterRef,
    getParentFilterRef,
} from './parentFilterRef';

describe('parentFilterRef', () => {
    it('encodes and decodes a global parent', () => {
        const encoded = encodeParentFilterRef({
            scope: 'global',
            tabUuid: null,
            fieldId: 'dim_categories_cls_1',
        });

        expect(encoded).toBe('global:dim_categories_cls_1');
        expect(decodeParentFilterRef(encoded)).toEqual({
            scope: 'global',
            tabUuid: null,
            fieldId: 'dim_categories_cls_1',
        });
    });

    it('encodes and decodes a tab parent', () => {
        const encoded = encodeParentFilterRef({
            scope: 'tab',
            tabUuid: 'tab-1',
            fieldId: 'dim_categories_cls_2',
        });

        expect(encoded).toBe('tab:tab-1:dim_categories_cls_2');
        expect(decodeParentFilterRef(encoded)).toEqual({
            scope: 'tab',
            tabUuid: 'tab-1',
            fieldId: 'dim_categories_cls_2',
        });
    });

    it('treats an empty tab uuid as the same tab', () => {
        const encoded = encodeParentFilterRef({
            scope: 'tab',
            tabUuid: null,
            fieldId: 'dim_categories_cls_2',
        });

        expect(encoded).toBe('tab::dim_categories_cls_2');
        expect(decodeParentFilterRef(encoded)).toEqual({
            scope: 'tab',
            tabUuid: null,
            fieldId: 'dim_categories_cls_2',
        });
    });

    it('returns null for empty or invalid values', () => {
        expect(decodeParentFilterRef(null)).toBeNull();
        expect(decodeParentFilterRef('')).toBeNull();
        expect(decodeParentFilterRef('dim_categories_cls_1')).toBeNull();
        expect(
            decodeParentFilterRef('unknown:dim_categories_cls_1'),
        ).toBeNull();
    });

    it('reads legacy filters without a scope', () => {
        const legacy = {
            id: 'filter-1',
            target: { fieldId: 'cls_3' },
            parentFieldId: 'cls_2',
        } as never;

        expect(getParentFilterRef(legacy)).toEqual({
            scope: null,
            tabUuid: null,
            fieldId: 'cls_2',
        });
    });

    it('clears all parent fields when the ref is removed', () => {
        const filter = {
            id: 'filter-1',
            target: { fieldId: 'cls_3' },
            parentFieldId: 'cls_2',
            parentScope: 'tab',
            parentTabUuid: 'tab-1',
        } as never;

        const cleared = applyParentFilterRef(filter, null);

        expect(cleared.parentFieldId).toBeUndefined();
        expect(cleared.parentScope).toBeUndefined();
        expect(cleared.parentTabUuid).toBeUndefined();
    });
});

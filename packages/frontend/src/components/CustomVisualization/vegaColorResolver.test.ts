import { describe, expect, it } from 'vitest';
import { buildFormattedValueMap, createVegaColorResolver } from './vegaColorResolver';

const rows = [
    {
        category: { value: { raw: '2024-01-01', formatted: '2024年1月' } },
        other: { value: { raw: 'A', formatted: 'A（原始）' } },
    },
    {
        category: { value: { raw: '2024-02-01', formatted: '2024年2月' } },
        other: { value: { raw: 'B', formatted: 'B（原始）' } },
    },
];

describe('buildFormattedValueMap', () => {
    it('maps raw values to formatted values per field', () => {
        const map = buildFormattedValueMap(rows as any);
        expect(map.get('category\u00002024-01-01')).toEqual('2024年1月');
        expect(map.get('other\u0000A')).toEqual('A（原始）');
    });

    it('returns an empty map when there are no rows', () => {
        expect(buildFormattedValueMap(undefined).size).toEqual(0);
    });
});

describe('createVegaColorResolver', () => {
    const palette = ['#111111', '#222222'];

    it('prefers the raw value key', () => {
        const resolver = createVegaColorResolver({
            palette,
            hashAssignments: { A: '#aaaaaa' },
            knownHashAssignments: { A: '#aaaaaa' },
            formattedValueMap: buildFormattedValueMap(rows as any),
        });
        expect(resolver('A', 'other')).toEqual('#aaaaaa');
    });

    it('falls back to the formatted value key (pie charts use display names)', () => {
        const resolver = createVegaColorResolver({
            palette,
            hashAssignments: { '2024年1月': '#bbbbbb' },
            knownHashAssignments: { '2024年1月': '#bbbbbb' },
            formattedValueMap: buildFormattedValueMap(rows as any),
        });
        expect(resolver('2024-01-01', 'category')).toEqual('#bbbbbb');
    });

    it('prefers a known color over a runtime appended one', () => {
        const resolver = createVegaColorResolver({
            palette,
            // raw 值只出现在运行时追加表里，展示值在已知表里
            hashAssignments: { '2024-01-01': '#999999' },
            knownHashAssignments: { '2024年1月': '#bbbbbb' },
            formattedValueMap: buildFormattedValueMap(rows as any),
        });
        expect(resolver('2024-01-01', 'category')).toEqual('#bbbbbb');
    });

    it('uses the runtime appended color when nothing is known', () => {
        const resolver = createVegaColorResolver({
            palette,
            hashAssignments: { '2024-01-01': '#999999' },
            knownHashAssignments: {},
            formattedValueMap: buildFormattedValueMap(rows as any),
        });
        expect(resolver('2024-01-01', 'category')).toEqual('#999999');
    });

    it('does not use the formatted value of a different field', () => {
        const resolver = createVegaColorResolver({
            palette,
            hashAssignments: { 'A（原始）': '#ccccccc' },
            knownHashAssignments: { 'A（原始）': '#ccccccc' },
            formattedValueMap: buildFormattedValueMap(rows as any),
        });
        // 字段不匹配时不应命中 formatted 键
        expect(resolver('A', 'category')).not.toEqual('#ccccccc');
    });

    it('falls back to a deterministic hash color', () => {
        const resolver = createVegaColorResolver({
            palette,
            hashAssignments: {},
        });
        const color = resolver('unknown', 'category');
        expect(palette).toContain(color);
        expect(resolver('unknown', 'category')).toEqual(color);
    });
});

import { describe, expect, it } from 'vitest';
import {
    getVegaAutosizeConfig,
    isCompositeVegaSpec,
    normalizeVegaSpecSizing,
} from './normalizeVegaSpecSizing';

const singleViewSpec = {
    mark: 'bar',
    encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'sales', type: 'quantitative' },
    },
};

const hconcatSpec = {
    hconcat: [
        {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'current_share', type: 'quantitative' },
            },
        },
        {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'last_share', type: 'quantitative' },
            },
        },
    ],
};

describe('isCompositeVegaSpec', () => {
    it('returns false for single view', () => {
        expect(isCompositeVegaSpec(singleViewSpec)).toBe(false);
    });

    it('returns false for layer spec', () => {
        expect(
            isCompositeVegaSpec({
                layer: [{ mark: 'bar' }, { mark: 'line' }],
            }),
        ).toBe(false);
    });

    it('returns true for hconcat', () => {
        expect(isCompositeVegaSpec(hconcatSpec)).toBe(true);
    });

    it('returns true for vconcat, facet, repeat', () => {
        expect(isCompositeVegaSpec({ vconcat: [{ mark: 'bar' }] })).toBe(true);
        expect(
            isCompositeVegaSpec({
                facet: { field: 'region', type: 'nominal' },
                spec: { mark: 'bar' },
            }),
        ).toBe(true);
        expect(
            isCompositeVegaSpec({
                repeat: { column: ['a', 'b'] },
                spec: { mark: 'bar' },
            }),
        ).toBe(true);
    });
});

describe('normalizeVegaSpecSizing', () => {
    it('applies container sizing to single view', () => {
        const result = normalizeVegaSpecSizing(singleViewSpec, {
            width: 800,
            height: 400,
        });
        expect(result.width).toBe('container');
        expect(result.height).toBe('container');
    });

    it('applies container sizing to layer spec', () => {
        const result = normalizeVegaSpecSizing(
            { layer: [{ mark: 'bar' }, { mark: 'line' }] },
            { width: 800, height: 400 },
        );
        expect(result.width).toBe('container');
        expect(result.height).toBe('container');
    });

    it('distributes width for hconcat views and reserves axis space', () => {
        const result = normalizeVegaSpecSizing(hconcatSpec, {
            width: 800,
            height: 400,
        });
        const views = result.hconcat as Record<string, unknown>[];
        expect(views).toHaveLength(2);
        expect(views[0].width).toBe(356);
        expect(views[1].width).toBe(356);
        expect(views[0].height).toBe(340);
        expect(views[1].height).toBe(340);
        expect(result.spacing).toBe(20);
        expect(result.width).toBeUndefined();
        expect(result.height).toBeUndefined();
    });

    it('reserves extra bottom and right space for rotated x-axis labels', () => {
        const result = normalizeVegaSpecSizing(
            {
                hconcat: [
                    {
                        mark: 'bar',
                        encoding: {
                            x: {
                                field: 'category',
                                type: 'nominal',
                                axis: { labelAngle: -30 },
                            },
                            y: {
                                field: 'sales',
                                type: 'quantitative',
                            },
                        },
                    },
                ],
            },
            { width: 400, height: 300 },
        );
        const views = result.hconcat as Record<string, unknown>[];
        // 300 - top(20) - bottom(40+32) = 208；width 400 - left(52) - right(16+32) = 300
        expect(views[0].height).toBe(208);
        expect(views[0].width).toBe(300);
    });

    it('distributes height for vconcat views', () => {
        const result = normalizeVegaSpecSizing(
            {
                vconcat: [{ mark: 'bar' }, { mark: 'line' }, { mark: 'point' }],
            },
            { width: 600, height: 300 },
        );
        const views = result.vconcat as Record<string, unknown>[];
        expect(views).toHaveLength(3);
        expect(views[0].height).toBe(66);
        expect(views[1].height).toBe(66);
        expect(views[2].height).toBe(66);
        expect(views[0].width).toBe(532);
    });

    it('sizes repeat inner spec', () => {
        const result = normalizeVegaSpecSizing(
            {
                repeat: { row: ['a', 'b'], column: ['x', 'y'] },
                spec: { mark: 'bar' },
            },
            { width: 400, height: 200 },
        );
        const inner = result.spec as Record<string, unknown>;
        expect(inner.width).toBe(156);
        expect(inner.height).toBe(60);
    });

    it('sizes facet inner spec using series unique values', () => {
        const result = normalizeVegaSpecSizing(
            {
                facet: { field: 'region', type: 'nominal' },
                spec: { mark: 'bar' },
            },
            { width: 600, height: 300 },
            [
                { region: 'A', sales: 1 },
                { region: 'B', sales: 2 },
                { region: 'C', sales: 3 },
            ],
        );
        const inner = result.spec as Record<string, unknown>;
        expect(inner.width).toBe(164);
        expect(inner.height).toBe(240);
    });

    it('handles nested hconcat inside vconcat', () => {
        const result = normalizeVegaSpecSizing(
            {
                vconcat: [
                    {
                        hconcat: [{ mark: 'bar' }, { mark: 'bar' }],
                    },
                    { mark: 'line' },
                ],
            },
            { width: 600, height: 300 },
        );
        const panels = result.vconcat as Record<string, unknown>[];
        expect(panels).toHaveLength(2);
        expect(panels[1].height).toBe(110);
        const nested = panels[0].hconcat as Record<string, unknown>[];
        expect(nested[0].width).toBe(256);
        expect(nested[1].width).toBe(256);
        expect(panels[0].height).toBe(110);
    });

    it('preserves padding and reserves space for asymmetric padding', () => {
        const result = normalizeVegaSpecSizing(
            {
                ...hconcatSpec,
                padding: { top: 16, right: 24, bottom: 16, left: 24 },
            },
            { width: 800, height: 400 },
        );
        const views = result.hconcat as Record<string, unknown>[];
        expect(result.padding).toEqual({
            top: 16,
            right: 24,
            bottom: 16,
            left: 24,
        });
        expect(views[0].width).toBe(332);
        expect(views[0].height).toBe(308);
    });

    it('preserves user-defined numeric width on child views', () => {
        const result = normalizeVegaSpecSizing(
            {
                hconcat: [{ mark: 'bar', width: 300 }, { mark: 'bar' }],
            },
            { width: 800, height: 400 },
        );
        const views = result.hconcat as Record<string, unknown>[];
        expect(views[0].width).toBe(300);
        expect(views[1].width).toBe(356);
    });
});

describe('getVegaAutosizeConfig', () => {
    it('uses fit for single view', () => {
        expect(getVegaAutosizeConfig(singleViewSpec, false)).toEqual({
            type: 'fit',
        });
        expect(getVegaAutosizeConfig(singleViewSpec, true)).toEqual({
            type: 'fit',
            resize: true,
        });
    });

    it('uses pad with contains padding for composite view', () => {
        expect(getVegaAutosizeConfig(hconcatSpec, true)).toEqual({
            type: 'pad',
            contains: 'padding',
        });
    });
});

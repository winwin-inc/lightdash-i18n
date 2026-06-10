import { describe, expect, it } from 'vitest';

import { composeCustomVisSpec } from './composeCustomVisSpec';
import { decomposeCustomVisSpec } from './decomposeCustomVisSpec';

const desktopSpec = {
    layer: [{ mark: 'bar' }],
    encoding: {
        x: { field: 'brand', type: 'nominal' },
        y: { field: 'growth', type: 'quantitative' },
    },
};

const mobileSpec = {
    layer: [{ mark: 'bar', orient: 'horizontal' }],
    height: { step: 32 },
    encoding: {
        y: { field: 'brand', type: 'nominal' },
        x: { field: 'growth', type: 'quantitative' },
    },
};

describe('composeCustomVisSpec', () => {
    it('returns desktop only when mobile is null', () => {
        const result = composeCustomVisSpec({
            desktop: desktopSpec,
            mobile: null,
        });
        expect(result).toEqual(desktopSpec);
        expect(result.lightdash).toBeUndefined();
    });

    it('merges mobile into lightdash.responsive', () => {
        const result = composeCustomVisSpec({
            desktop: desktopSpec,
            mobile: mobileSpec,
            breakpoint: 992,
        });
        expect(result.layer).toEqual(desktopSpec.layer);
        expect(result.lightdash).toEqual({
            responsive: { breakpoint: 992, mobile: mobileSpec },
        });
    });

    it('preserves rewrite on root spec only', () => {
        const result = composeCustomVisSpec({
            desktop: { ...desktopSpec, rewrite: true },
            mobile: mobileSpec,
        });
        expect(result.rewrite).toBe(true);
        expect(result.lightdash).toBeDefined();
    });
});

describe('decomposeCustomVisSpec', () => {
    it('decomposes composed spec', () => {
        const composed = composeCustomVisSpec({
            desktop: desktopSpec,
            mobile: mobileSpec,
            breakpoint: 640,
            rewrite: true,
        });
        const decomposed = decomposeCustomVisSpec(composed);
        expect(decomposed.desktop).toEqual(desktopSpec);
        expect(decomposed.mobile).toEqual(mobileSpec);
        expect(decomposed.breakpoint).toBe(640);
        expect(decomposed.rewrite).toBe(true);
    });

    it('round-trips compose and decompose', () => {
        const composed = composeCustomVisSpec({
            desktop: desktopSpec,
            mobile: mobileSpec,
            breakpoint: 768,
        });
        const decomposed = decomposeCustomVisSpec(composed);
        const roundTrip = composeCustomVisSpec(decomposed);
        expect(roundTrip).toEqual(composed);
    });

    it('handles spec without responsive config', () => {
        const decomposed = decomposeCustomVisSpec(desktopSpec);
        expect(decomposed.desktop).toEqual(desktopSpec);
        expect(decomposed.mobile).toBeNull();
    });
});

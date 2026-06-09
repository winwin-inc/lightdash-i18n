import { describe, expect, it } from 'vitest';

import { computeResponsiveLayout } from './computeResponsiveLayout';
import { extractLightdashConfig } from './extractLightdashConfig';
import {
    resetCompositeResponsiveWarnedForTests,
    resolveActiveSpec,
} from './resolveActiveSpec';

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

describe('extractLightdashConfig', () => {
    it('returns original spec when lightdash is absent', () => {
        const result = extractLightdashConfig(desktopSpec);
        expect(result.desktopSpec).toEqual(desktopSpec);
        expect(result.responsiveConfig).toBeNull();
    });

    it('strips lightdash from desktopSpec', () => {
        const result = extractLightdashConfig({
            ...desktopSpec,
            lightdash: {
                responsive: {
                    breakpoint: 768,
                    mobile: mobileSpec,
                },
            },
        });
        expect(result.desktopSpec).toEqual(desktopSpec);
        expect(result.desktopSpec.lightdash).toBeUndefined();
    });

    it('returns null responsiveConfig when mobile is missing', () => {
        const result = extractLightdashConfig({
            ...desktopSpec,
            lightdash: { responsive: { breakpoint: 640 } },
        });
        expect(result.responsiveConfig).toBeNull();
    });

    it('uses default breakpoint when not specified', () => {
        const result = extractLightdashConfig({
            ...desktopSpec,
            lightdash: { responsive: { mobile: mobileSpec } },
        });
        expect(result.responsiveConfig?.breakpoint).toBe(768);
        expect(result.responsiveConfig?.mobile).toEqual(mobileSpec);
    });
});

describe('resolveActiveSpec', () => {
    it('uses desktop spec when container is wide', () => {
        const config = { breakpoint: 768, mobile: mobileSpec };
        const result = resolveActiveSpec(desktopSpec, config, 1200);
        expect(result.variant).toBe('desktop');
        expect(result.spec).toEqual(desktopSpec);
    });

    it('uses mobile spec when container is narrow', () => {
        const config = { breakpoint: 768, mobile: mobileSpec };
        const result = resolveActiveSpec(desktopSpec, config, 375);
        expect(result.variant).toBe('mobile');
        expect(result.spec).toEqual(mobileSpec);
    });

    it('uses desktop spec when mobile is not configured', () => {
        const result = resolveActiveSpec(desktopSpec, null, 375);
        expect(result.variant).toBe('desktop');
        expect(result.spec).toEqual(desktopSpec);
    });

    it('respects custom breakpoint', () => {
        const config = { breakpoint: 992, mobile: mobileSpec };
        expect(resolveActiveSpec(desktopSpec, config, 800).variant).toBe(
            'mobile',
        );
        expect(resolveActiveSpec(desktopSpec, config, 1000).variant).toBe(
            'desktop',
        );
    });

    it('ignores mobile for composite desktop spec', () => {
        resetCompositeResponsiveWarnedForTests();
        const compositeDesktop = {
            hconcat: [{ mark: 'bar' }, { mark: 'bar' }],
        };
        const config = { breakpoint: 768, mobile: mobileSpec };
        const result = resolveActiveSpec(compositeDesktop, config, 375);
        expect(result.variant).toBe('desktop');
        expect(result.spec).toEqual(compositeDesktop);
    });
});

describe('computeResponsiveLayout', () => {
    const series = Array.from({ length: 10 }, (_, i) => ({
        brand: `Brand ${i}`,
        growth: i * 0.01,
    }));

    it('returns default layout for desktop variant', () => {
        const layout = computeResponsiveLayout(
            'desktop',
            desktopSpec,
            800,
            400,
            series,
        );
        expect(layout.useStepHeight).toBe(false);
        expect(layout.useAutosizeNone).toBe(false);
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
        expect(layout.vegaStyle).toEqual({ width: 800, height: 400 });
    });

    it('computes step height and vertical scroll for mobile', () => {
        const layout = computeResponsiveLayout(
            'mobile',
            mobileSpec,
            375,
            200,
            series,
        );
        expect(layout.useStepHeight).toBe(true);
        expect(layout.useAutosizeNone).toBe(true);
        expect(layout.vegaStyle.height).toBe(320);
        expect(layout.containerStyle).toEqual({
            overflowX: 'hidden',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
        });
    });

    it('does not scroll when step height fits container', () => {
        const layout = computeResponsiveLayout(
            'mobile',
            mobileSpec,
            375,
            400,
            [{ brand: 'A', growth: 0.1 }],
        );
        expect(layout.useAutosizeNone).toBe(false);
        expect(layout.vegaStyle.height).toBe(400);
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
    });

    it('uses series length when y field is missing', () => {
        const layout = computeResponsiveLayout(
            'mobile',
            { height: { step: 20 } },
            300,
            100,
            series,
        );
        expect(layout.vegaStyle.height).toBe(200);
    });
});

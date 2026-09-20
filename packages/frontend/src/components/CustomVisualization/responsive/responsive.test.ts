import { describe, expect, it } from 'vitest';

import { computeResponsiveLayout } from './computeResponsiveLayout';
import { extractLightdashConfig } from './extractLightdashConfig';
import { resolveActiveSpec } from './resolveActiveSpec';

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

    it('uses mobile spec when desktop is composite and viewport is narrow', () => {
        const compositeDesktop = {
            hconcat: [{ mark: 'bar' }, { mark: 'bar' }],
        };
        const config = { breakpoint: 768, mobile: mobileSpec };
        const result = resolveActiveSpec(compositeDesktop, config, 375);
        expect(result.variant).toBe('mobile');
        expect(result.spec).toEqual(mobileSpec);
    });

    it('uses mobile spec for composite desktop when preview override is mobile', () => {
        const compositeDesktop = {
            vconcat: [{ mark: 'bar' }, { mark: 'line' }],
        };
        const compositeMobile = {
            vconcat: [{ mark: 'bar' }, { mark: 'text' }],
        };
        const config = { breakpoint: 768, mobile: compositeMobile };
        const result = resolveActiveSpec(
            compositeDesktop,
            config,
            1200,
            'mobile',
        );
        expect(result.variant).toBe('mobile');
        expect(result.spec).toEqual(compositeMobile);
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
        const layout = computeResponsiveLayout('mobile', mobileSpec, 375, 400, [
            { brand: 'A', growth: 0.1 },
        ]);
        expect(layout.useAutosizeNone).toBe(false);
        expect(layout.vegaStyle.height).toBe(400);
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
    });

    it('does not use step height for height.step without discrete band y', () => {
        const layout = computeResponsiveLayout(
            'mobile',
            { height: { step: 20 } },
            300,
            100,
            series,
        );
        expect(layout.useStepHeight).toBe(false);
        expect(layout.vegaStyle.height).toBe(100);
    });

    it('does not use step height for quant-quant scatter with stray height.step', () => {
        const bostonLike = {
            layer: [
                {
                    mark: 'point',
                    encoding: {
                        x: { field: 'share', type: 'quantitative' },
                        y: { field: 'yoy', type: 'quantitative' },
                    },
                },
            ],
            height: { step: 40 },
            width: 'container',
        };
        const layout = computeResponsiveLayout(
            'mobile',
            bostonLike,
            375,
            320,
            series,
            { preferFitInTile: true },
        );
        expect(layout.useStepHeight).toBe(false);
        expect(layout.chartSize.height).toBe(320);
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
    });

    it('still uses step height for nominal-y mobile tables', () => {
        const layout = computeResponsiveLayout(
            'mobile',
            mobileSpec,
            375,
            200,
            series,
        );
        expect(layout.useStepHeight).toBe(true);
        expect(layout.vegaStyle.height).toBe(320);
    });

    it('uses natural width and horizontal scroll for x rangeStep on wide viewport', () => {
        const priceBandSpec = {
            layer: [
                {
                    mark: { type: 'bar' },
                    encoding: {
                        x: {
                            type: 'ordinal',
                            field: 'price_range_text',
                            scale: { rangeStep: 75 },
                        },
                        y: { type: 'quantitative', field: 'sku_sum' },
                    },
                },
            ],
            height: 400,
            transform: [
                {
                    bin: { maxbins: 25 },
                    field: 'price',
                    as: ['price_bin_start', 'price_bin_end'],
                },
            ],
        };
        const layout = computeResponsiveLayout(
            'desktop',
            priceBandSpec,
            360,
            280,
        );
        expect(layout.useStepWidth).toBe(true);
        expect(layout.useStepHeight).toBe(false);
        expect(layout.chartSize.width).toBe(25 * 75);
        expect(layout.chartSize.height).toBe(400);
        expect(layout.useAutosizeNone).toBe(true);
        expect(layout.containerStyle).toEqual({
            overflowX: 'auto',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
        });
    });

    it('skips rangeStep natural width when preferFitInTile is set', () => {
        const priceBandSpec = {
            layer: [
                {
                    mark: { type: 'bar' },
                    encoding: {
                        x: {
                            type: 'ordinal',
                            field: 'price_range_text',
                            scale: { rangeStep: 75 },
                        },
                        y: { type: 'quantitative', field: 'sku_sum' },
                    },
                },
            ],
            height: 400,
            transform: [
                {
                    bin: { maxbins: 25 },
                    field: 'price',
                    as: ['price_bin_start', 'price_bin_end'],
                },
            ],
        };
        const layout = computeResponsiveLayout(
            'desktop',
            priceBandSpec,
            360,
            280,
            undefined,
            { preferFitInTile: true },
        );
        expect(layout.useStepWidth).toBe(false);
        expect(layout.chartSize).toEqual({ width: 360, height: 280 });
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
        expect(layout.useAutosizeNone).toBe(false);
    });

    it('uses width.step for natural width without inventing scroll when it fits', () => {
        const layout = computeResponsiveLayout(
            'mobile',
            {
                mark: 'bar',
                width: { step: 40 },
                encoding: {
                    x: { field: 'brand', type: 'nominal' },
                    y: { field: 'growth', type: 'quantitative' },
                },
            },
            500,
            300,
            [{ brand: 'A' }, { brand: 'B' }],
        );
        expect(layout.useStepWidth).toBe(true);
        expect(layout.chartSize.width).toBe(500);
        expect(layout.useAutosizeNone).toBe(false);
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
    });

    it('scrolls vertically when author numeric height exceeds container on wide', () => {
        const layout = computeResponsiveLayout(
            'desktop',
            { ...desktopSpec, height: 400 },
            360,
            280,
        );
        expect(layout.useStepWidth).toBe(false);
        expect(layout.chartSize.height).toBe(400);
        expect(layout.useAutosizeNone).toBe(true);
        expect(layout.containerStyle).toEqual({
            overflowX: 'hidden',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
        });
    });

    it('keeps container height when preferFitInTile despite author height', () => {
        const layout = computeResponsiveLayout(
            'desktop',
            { ...desktopSpec, height: 400 },
            360,
            280,
            undefined,
            { preferFitInTile: true },
        );
        expect(layout.chartSize).toEqual({ width: 360, height: 280 });
        expect(layout.useAutosizeNone).toBe(false);
        expect(layout.containerStyle).toEqual({ overflow: 'hidden' });
    });
});

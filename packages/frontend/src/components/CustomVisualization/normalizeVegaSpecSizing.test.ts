import { describe, expect, it } from 'vitest';
import {
    collectOutOfPlotChromeReserve,
    getVegaAutosizeConfig,
    isCompositeVegaSpec,
    normalizeVegaSpecSizing,
} from './normalizeVegaSpecSizing';
import type { ResponsiveLayout } from './responsive/types';

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

    it('preserves height step for mobile responsive layout', () => {
        const mobileLayout: ResponsiveLayout = {
            layoutId: 'mobile',
            variant: 'mobile',
            useStepHeight: true,
            useStepWidth: false,
            useAutosizeNone: true,
            chartSize: { width: 375, height: 320 },
            containerStyle: { overflowY: 'auto' },
            vegaStyle: { width: 375, height: 320 },
        };
        const result = normalizeVegaSpecSizing(
            {
                layer: [{ mark: 'bar', orient: 'horizontal' }],
                height: { step: 32 },
                encoding: {
                    y: { field: 'brand', type: 'nominal' },
                    x: { field: 'growth', type: 'quantitative' },
                },
            },
            { width: 375, height: 320 },
            undefined,
            mobileLayout,
        );
        expect(result.width).toBe('container');
        expect(result.height).toEqual({ step: 32 });
    });

    it('pins pixel width but keeps height step when explicit size is enabled', () => {
        const mobileLayout: ResponsiveLayout = {
            layoutId: 'mobile',
            variant: 'mobile',
            useStepHeight: true,
            useStepWidth: false,
            useAutosizeNone: true,
            chartSize: { width: 375, height: 320 },
            containerStyle: { overflowY: 'auto' },
            vegaStyle: { width: 375, height: 320 },
        };
        const result = normalizeVegaSpecSizing(
            {
                layer: [{ mark: 'bar', orient: 'horizontal' }],
                height: { step: 32 },
                encoding: {
                    y: { field: 'brand', type: 'nominal' },
                    x: { field: 'growth', type: 'quantitative' },
                },
            },
            { width: 375, height: 320 },
            undefined,
            mobileLayout,
            { useExplicitPixelSize: true },
        );
        expect(result.width).toBe(375);
        expect(result.height).toEqual({ step: 32 });
    });

    it('uses narrow default padding when author did not set padding', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            singleViewSpec,
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding).toEqual({
            top: 8,
            right: 8,
            bottom: 28,
            left: 44,
        });
        expect(result.width).toBe(
            container.width - padding.left - padding.right,
        );
        expect(result.height).toBe(
            container.height - padding.top - padding.bottom,
        );
        expect(result.autosize).toEqual({
            type: 'none',
        });
    });

    it('bumps bottom and right default padding for -90 x labelAngle', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: 'bar',
                        encoding: {
                            x: {
                                field: 'category',
                                type: 'ordinal',
                                axis: { labelAngle: -90 },
                            },
                            y: {
                                field: 'sales',
                                type: 'quantitative',
                            },
                        },
                    },
                ],
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        // extra = 64 → mainly bottom; right ≤8 (no fat gutter)
        expect(padding).toEqual({
            top: 8,
            right: 8,
            bottom: 28 + 64,
            left: 44,
        });
    });

    it('clamps default padding on small containers to keep a usable data-rect', () => {
        const container = { width: 300, height: 200 };
        const result = normalizeVegaSpecSizing(
            singleViewSpec,
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left + padding.right).toBeLessThanOrEqual(
            Math.floor(container.width * 0.35),
        );
        expect(padding.top + padding.bottom).toBeLessThanOrEqual(
            Math.floor(container.height * 0.3),
        );
        expect(result.width as number).toBeGreaterThanOrEqual(160);
        expect(result.height as number).toBeGreaterThanOrEqual(120);
    });

    it('does not invent left padding when y axis labels are disabled', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: 'bar',
                        encoding: {
                            x: {
                                field: 'bin',
                                type: 'ordinal',
                                axis: { labelAngle: -90 },
                            },
                            y: {
                                field: 'sku_sum',
                                type: 'quantitative',
                                axis: { labels: false },
                            },
                        },
                    },
                ],
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBe(0);
        // still reserve for -90 x labels (bottom); right stays tiny
        expect(padding.bottom).toBe(28 + 64);
        expect(padding.right).toBeLessThanOrEqual(8);
    });

    it('does not invent left when layer0 disables y labels even if text layer omits axis', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: 'bar',
                        encoding: {
                            x: {
                                field: 'bin',
                                type: 'ordinal',
                                axis: { labelAngle: -90 },
                            },
                            y: {
                                field: 'sku_sum',
                                type: 'quantitative',
                                axis: { labels: false },
                            },
                        },
                    },
                    {
                        mark: { type: 'text' },
                        encoding: {
                            x: { field: 'bin', type: 'ordinal' },
                            y: { field: 'sku_sum', type: 'quantitative' },
                            text: { field: 'sku_sum' },
                        },
                    },
                ],
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBe(0);
        expect(padding.right).toBeLessThanOrEqual(8);
        expect(padding.bottom).toBe(28 + 64);
    });

    it('does not invent left padding when y.axis is null', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                mark: 'line',
                encoding: {
                    x: { field: 'month', type: 'ordinal' },
                    y: {
                        field: 'sales',
                        type: 'quantitative',
                        axis: null,
                    },
                },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBe(0);
    });

    it('still invents left for single-view quantitative y with labels', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            singleViewSpec,
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as { left: number };
        expect(padding.left).toBe(44);
    });

    it('does not invent left padding for nominal y category axes', () => {
        const container = { width: 500, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: 'bar',
                        encoding: {
                            y: { field: 'brand', type: 'nominal' },
                            x: {
                                field: 'growth',
                                type: 'quantitative',
                            },
                        },
                    },
                ],
                autosize: { type: 'fit' },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBe(0);
    });

    it('protects left padding when clamping -90 labelAngle extras on narrow width', () => {
        const container = { width: 300, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                mark: 'bar',
                encoding: {
                    x: {
                        field: 'category',
                        type: 'ordinal',
                        axis: { labelAngle: -90 },
                    },
                    y: {
                        field: 'sales',
                        type: 'quantitative',
                    },
                },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        // left stays 44; -90 right is already ≤8 so no horizontal clamp needed
        expect(padding.left).toBe(44);
        expect(padding.right).toBeLessThanOrEqual(8);
        expect(padding.left + padding.right).toBeLessThanOrEqual(105);
    });

    it('keeps natural width for rangeStep layouts when useStepWidth is set (wide path)', () => {
        const stepLayout: ResponsiveLayout = {
            layoutId: 'desktop',
            variant: 'desktop',
            useStepHeight: false,
            useStepWidth: true,
            useAutosizeNone: true,
            chartSize: { width: 1875, height: 400 },
            containerStyle: {
                overflowX: 'auto',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
            },
            vegaStyle: { width: 1875, height: 400 },
        };
        const priceBandSpec = {
            layer: [
                {
                    mark: { type: 'bar', cornerRadius: 2 },
                    encoding: {
                        x: {
                            type: 'ordinal',
                            field: 'price_range_text',
                            scale: { padding: 0.2, rangeStep: 75 },
                        },
                        y: {
                            type: 'quantitative',
                            field: 'sku_sum',
                        },
                    },
                },
            ],
            height: 400,
            width: 'container',
            transform: [
                {
                    as: ['price_bin_start', 'price_bin_end'],
                    bin: { maxbins: 25 },
                    field: 'price',
                },
            ],
        };
        const result = normalizeVegaSpecSizing(
            priceBandSpec,
            stepLayout.chartSize,
            undefined,
            stepLayout,
            { useExplicitPixelSize: true },
        );
        expect(result.height).toBe(400);
        expect(result.width).toBe(1875);
        expect(result.padding).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
        expect(result.autosize).toEqual({ type: 'none' });
    });

    it('strips rangeStep and uses container inset height on narrow fit-in-tile path', () => {
        const container = { width: 360, height: 280 };
        const priceBandSpec = {
            layer: [
                {
                    mark: { type: 'bar' },
                    encoding: {
                        x: {
                            type: 'ordinal',
                            field: 'price_range_text',
                            scale: { padding: 0.2, rangeStep: 75 },
                        },
                        y: {
                            type: 'quantitative',
                            field: 'sku_sum',
                        },
                    },
                },
            ],
            height: 400,
            width: 'container',
        };
        const result = normalizeVegaSpecSizing(
            priceBandSpec,
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(result.height).toBe(
            container.height - padding.top - padding.bottom,
        );
        expect(result.height as number).toBeLessThan(400);
        expect(result.width).toBe(
            container.width - padding.left - padding.right,
        );
        expect(padding.left + padding.right).toBeGreaterThan(0);
        const layer0 = (result.layer as Record<string, unknown>[])[0];
        const encoding = layer0.encoding as Record<string, unknown>;
        const x = encoding.x as Record<string, unknown>;
        const scale = x.scale as Record<string, unknown>;
        expect(scale.rangeStep).toBeUndefined();
        expect(scale.padding).toBe(0.2);
        expect(result.autosize).toEqual({ type: 'none' });
    });

    it('does not preserve author numeric height on ordinary narrow path', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                ...singleViewSpec,
                height: 400,
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(result.height).toBe(
            container.height - padding.top - padding.bottom,
        );
        expect(result.width).toBe(
            container.width - padding.left - padding.right,
        );
    });

    it('merges author padding with axis reserves (then clamps) on narrow path', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                ...singleViewSpec,
                padding: { top: 20, right: 120, bottom: 20, left: 40 },
                autosize: { type: 'fit' },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        // max(author, axis); author right:120 kept as floor after clamp
        expect(padding).toEqual({
            top: 20,
            right: 120,
            bottom: 28,
            left: 44,
        });
        expect(result.width).toBe(
            container.width - padding.left - padding.right,
        );
        expect(result.height).toBe(
            container.height - padding.top - padding.bottom,
        );
        expect(result.autosize).toEqual({
            type: 'fit',
        });
    });

    it('respects explicit padding 0 without applying narrow defaults', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                ...singleViewSpec,
                padding: 0,
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        expect(result.padding).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
        expect(result.width).toBe(360);
        expect(result.height).toBe(280);
        expect(result.autosize).toEqual({ type: 'none' });
    });

    it('merges numeric author padding with axis label reserves', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                ...singleViewSpec,
                padding: 15,
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding).toEqual({
            top: 15,
            right: 15,
            bottom: 28,
            left: 44,
        });
        expect(result.width).toBe(
            container.width - padding.left - padding.right,
        );
        expect(result.height).toBe(
            container.height - padding.top - padding.bottom,
        );
    });

    it('bumps left for monthly-trend overhang average label despite author left:20', () => {
        const container = { width: 375, height: 300 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: {
                            type: 'line',
                            color: '#4a7abc',
                        },
                        encoding: {
                            x: {
                                field: 'month',
                                type: 'temporal',
                                axis: { labelAngle: -90, title: null },
                            },
                            y: {
                                field: 'sku',
                                type: 'quantitative',
                                axis: null,
                            },
                            color: {
                                datum: 'SKU个数',
                                legend: {
                                    title: null,
                                    orient: 'none',
                                    legendY: -60,
                                    direction: 'horizontal',
                                },
                            },
                        },
                    },
                    {
                        mark: {
                            type: 'text',
                            dx: -20,
                            align: 'right',
                            color: '#ff9933',
                            baseline: 'middle',
                            fontSize: 18,
                            fontWeight: 'bold',
                        },
                        encoding: {
                            x: { value: 0 },
                            y: {
                                field: 'avg_sku',
                                type: 'quantitative',
                            },
                        },
                    },
                ],
                padding: { top: 55, left: 20, right: 20, bottom: 20 },
                height: 300,
                width: 'container',
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        // 173-style label: -dx(20) + ~3*fontSize*0.65 ≈ 55
        expect(padding.left).toBeGreaterThan(20);
        expect(padding.left).toBeGreaterThanOrEqual(50);
        // legendY:-60 + row → top ≥ 76
        expect(padding.top).toBeGreaterThanOrEqual(76);
        // -90 x labels need more than author bottom:20
        expect(padding.bottom).toBeGreaterThan(20);
    });

    it('bumps top/bottom for quarterly-trend hand-drawn legend and x labels', () => {
        const container = { width: 375, height: 340 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: { type: 'rect', width: 10, height: 10 },
                        encoding: {
                            x: { value: 0 },
                            y: { value: -35 },
                            color: { value: '#4169E1' },
                        },
                    },
                    {
                        mark: { type: 'text', dx: 60, fontSize: 12 },
                        encoding: {
                            x: { value: -10 },
                            y: { value: -35 },
                        },
                    },
                    {
                        mark: { type: 'bar' },
                        encoding: {
                            x: {
                                field: 'quarter',
                                type: 'ordinal',
                                axis: {
                                    labelAngle: 0,
                                    labelFontSize: 13,
                                },
                            },
                            y: {
                                field: 'sales',
                                type: 'quantitative',
                                axis: null,
                            },
                            color: {
                                field: 'year_label',
                                type: 'nominal',
                                legend: null,
                            },
                        },
                    },
                ],
                padding: { top: 10, left: 10, right: 10, bottom: 10 },
                height: 340,
                width: 'container',
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        // hand legend at y:-35
        expect(padding.top).toBeGreaterThanOrEqual(40);
        // visible x axis → at least default bottom 28
        expect(padding.bottom).toBeGreaterThanOrEqual(28);
        // no quant left ticks / no overhang → do not invent 68
        expect(padding.left).toBeLessThan(68);
    });

    it('does not invent left 68 when author padding has no out-of-plot left chrome', () => {
        const container = { width: 375, height: 300 };
        const result = normalizeVegaSpecSizing(
            {
                mark: 'line',
                encoding: {
                    x: { field: 'month', type: 'ordinal' },
                    y: {
                        field: 'sales',
                        type: 'quantitative',
                        axis: null,
                    },
                },
                padding: { top: 55, left: 20, right: 20, bottom: 20 },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as { left: number; bottom: number };
        expect(padding.left).toBe(20);
        expect(padding.bottom).toBeGreaterThanOrEqual(28);
    });

    it('parses Boston-matrix expr offsets into out-of-plot chrome sides', () => {
        const chrome = collectOutOfPlotChromeReserve({
            layer: [
                {
                    mark: 'point',
                    encoding: {
                        x: {
                            field: 'share',
                            type: 'quantitative',
                            axis: { title: '本期类目占比' },
                        },
                        y: {
                            field: 'yoy',
                            type: 'quantitative',
                            axis: { title: '销售额同比' },
                        },
                    },
                },
                {
                    mark: { type: 'text', fontSize: 11 },
                    encoding: {
                        x: { value: { expr: '-60' } },
                        y: { value: { expr: '-70' } },
                        text: { value: '潜力' },
                    },
                },
                {
                    mark: { type: 'text', fontSize: 13 },
                    encoding: {
                        x: { value: { expr: 'width+30' } },
                        y: { value: { expr: '-38' } },
                        text: { value: '明星' },
                    },
                },
                {
                    mark: { type: 'rect' },
                    encoding: {
                        x: { value: { expr: 'width' } },
                        x2: { value: { expr: 'width+60' } },
                        y: { value: { expr: 'height+15' } },
                        y2: { value: { expr: 'height+45' } },
                    },
                },
            ],
            config: { legend: { orient: 'bottom' } },
        });
        expect(chrome.left).toBeGreaterThanOrEqual(60);
        expect(chrome.top).toBeGreaterThanOrEqual(70);
        expect(chrome.right).toBeGreaterThanOrEqual(60);
        expect(chrome.bottom).toBeGreaterThanOrEqual(45);
    });

    it('reserves four-side padding for Boston-matrix without author padding', () => {
        const container = { width: 375, height: 400 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: 'point',
                        encoding: {
                            x: {
                                field: 'share',
                                type: 'quantitative',
                                axis: {
                                    title: '本期类目占比(占二级类目）',
                                    format: '.1%',
                                },
                            },
                            y: {
                                field: 'yoy',
                                type: 'quantitative',
                                axis: {
                                    title: '销售额同比',
                                    format: '.1%',
                                },
                            },
                        },
                    },
                    {
                        mark: { type: 'text', fontSize: 11 },
                        encoding: {
                            y: { value: -70 },
                            x: { value: { expr: '400' } },
                            text: { value: '二级类目销售额同比' },
                        },
                    },
                    {
                        mark: { type: 'text', fontSize: 13 },
                        encoding: {
                            x: { value: { expr: '-30' } },
                            y: { value: { expr: '-38.5' } },
                            text: { value: { expr: "'潜力'" } },
                        },
                    },
                    {
                        mark: { type: 'text', fontSize: 13 },
                        encoding: {
                            x: { value: { expr: 'width+30' } },
                            y: { value: { expr: 'height+30' } },
                            text: { value: { expr: "'成熟'" } },
                        },
                    },
                    {
                        mark: { type: 'rect' },
                        encoding: {
                            x: { value: { expr: 'width' } },
                            x2: { value: { expr: 'width+60' } },
                            y: { value: { expr: 'height+15' } },
                            y2: { value: { expr: 'height+45' } },
                        },
                    },
                ],
                width: 'container',
                height: { step: 40 },
                config: { legend: { orient: 'bottom' } },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBeGreaterThanOrEqual(44);
        expect(padding.top).toBeGreaterThanOrEqual(70);
        expect(padding.right).toBeGreaterThanOrEqual(60);
        expect(padding.bottom).toBeGreaterThanOrEqual(45);
        // not the composite 68 invention for category charts
        expect(typeof result.height).toBe('number');
        expect(result.height).not.toEqual({ step: 40 });
    });

    it('keeps modest padding for quantitative y even when author set autosize only', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                ...singleViewSpec,
                autosize: { type: 'fit', contains: 'padding' },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBeGreaterThan(0);
        expect(result.width).toBe(
            container.width - padding.left - padding.right,
        );
        expect(result.height).toBe(
            container.height - padding.top - padding.bottom,
        );
        expect(result.autosize).toEqual({
            type: 'fit',
            contains: 'padding',
        });
    });

    it('keeps padding 0 for autosize charts without visible axis label chrome', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                mark: 'text',
                encoding: {
                    x: {
                        field: 'brand',
                        type: 'nominal',
                        axis: false,
                    },
                    text: { field: 'label', type: 'nominal' },
                },
                autosize: { type: 'fit', contains: 'padding' },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        expect(result.padding).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
        expect(result.width).toBe(360);
        expect(result.height).toBe(280);
    });

    it('keeps modest padding for layer charts with autosize only', () => {
        const container = { width: 360, height: 280 };
        const result = normalizeVegaSpecSizing(
            {
                layer: [
                    {
                        mark: 'line',
                        encoding: {
                            x: { field: 'month', type: 'ordinal' },
                            y: {
                                field: 'sku',
                                type: 'quantitative',
                            },
                        },
                    },
                ],
                autosize: { type: 'fit' },
            },
            container,
            undefined,
            undefined,
            { useExplicitPixelSize: true },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBeGreaterThan(0);
    });

    it('does not flatten padding on step-height mobile layout', () => {
        const mobileLayout: ResponsiveLayout = {
            layoutId: 'mobile',
            variant: 'mobile',
            useStepHeight: true,
            useStepWidth: false,
            useAutosizeNone: false,
            chartSize: { width: 375, height: 320 },
            containerStyle: { overflow: 'hidden' },
            vegaStyle: { width: 375, height: 320 },
        };
        const result = normalizeVegaSpecSizing(
            {
                layer: [{ mark: 'bar', orient: 'horizontal' }],
                height: { step: 32 },
                padding: { right: 80 },
                encoding: {
                    y: { field: 'brand', type: 'nominal' },
                    x: { field: 'growth', type: 'quantitative' },
                },
            },
            { width: 375, height: 320 },
            undefined,
            mobileLayout,
            { useExplicitPixelSize: true },
        );
        expect(result.width).toBe(375);
        expect(result.height).toEqual({ step: 32 });
        expect(result.padding).toEqual({ right: 80 });
    });

    it('distributes width for hconcat views and writes axis reserve as padding', () => {
        const result = normalizeVegaSpecSizing(hconcatSpec, {
            width: 800,
            height: 400,
        });
        const views = result.hconcat as Record<string, unknown>[];
        expect(views).toHaveLength(2);
        // left68 + right48; innerW=684 → (684-20)/2=332; innerH=340
        expect(result.padding).toEqual({
            top: 20,
            right: 48,
            bottom: 40,
            left: 68,
        });
        expect(views[0].width).toBe(332);
        expect(views[1].width).toBe(332);
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
        // extra=32; 300 - top20 - bottom72 = 208；width 400 - left68 - right80 = 252
        expect(result.padding).toEqual({
            top: 20,
            right: 48 + 32,
            bottom: 40 + 32,
            left: 68,
        });
        expect(views[0].height).toBe(208);
        expect(views[0].width).toBe(252);
    });

    it('bumps composite right reserve when a child uses right-oriented axis', () => {
        const result = normalizeVegaSpecSizing(
            {
                hconcat: [
                    {
                        mark: 'line',
                        encoding: {
                            y: {
                                field: 'sales',
                                type: 'quantitative',
                                axis: { orient: 'right' },
                            },
                        },
                    },
                ],
            },
            { width: 400, height: 300 },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        // right-orient only: no left quant ticks → left 0; right = base8 + 24
        expect(padding.right).toBe(8 + 24);
        expect(padding.left).toBe(0);
    });

    it('does not invent left 68 for category-distribution hconcat with nominal y', () => {
        const result = normalizeVegaSpecSizing(
            {
                hconcat: [
                    {
                        width: 80,
                        mark: 'bar',
                        encoding: {
                            y: {
                                field: 'category',
                                type: 'nominal',
                            },
                            x: {
                                field: 'share',
                                type: 'quantitative',
                                axis: null,
                            },
                        },
                    },
                    {
                        mark: 'bar',
                        encoding: {
                            y: {
                                field: 'category',
                                type: 'nominal',
                                axis: null,
                            },
                            x: {
                                field: 'share',
                                type: 'quantitative',
                            },
                        },
                    },
                    {
                        width: 20,
                        mark: 'bar',
                        encoding: {
                            y: {
                                field: 'category',
                                type: 'nominal',
                                axis: null,
                            },
                            x: {
                                field: 'delta',
                                type: 'quantitative',
                                axis: null,
                            },
                        },
                    },
                ],
            },
            { width: 400, height: 300 },
        );
        const padding = result.padding as {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        expect(padding.left).toBeLessThanOrEqual(8);
        expect(padding.left).toBe(0);
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
        // no encoding → no axis reserve; top0+bottom0; spacing 20×2
        expect(views[0].height).toBe(86);
        expect(views[1].height).toBe(86);
        expect(views[2].height).toBe(86);
        // 600 - left0 - right8 = 592
        expect(views[0].width).toBe(592);
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
        // no encoding → insets top0 right8 bottom0 left0; innerW=392 → (392-20)/2=186
        // innerH=200 → (200-20)/2=90? wait spacing for 2x2: rows/cols
        expect(inner.width).toBe(186);
        expect(inner.height).toBe(90);
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
        // insets left0 right8 → innerW=592 → (592-40)/3=184; height=300
        expect(inner.width).toBe(184);
        expect(inner.height).toBe(300);
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
        // no axis chrome: (300-20)/2=140
        expect(panels[1].height).toBe(140);
        const nested = panels[0].hconcat as Record<string, unknown>[];
        // availW=592 → (592-20)/2=286
        expect(nested[0].width).toBe(286);
        expect(nested[1].width).toBe(286);
        expect(panels[0].height).toBe(140);
    });

    it('uses author padding only for composite insets without stacking axis reserve', () => {
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
        // 800 - 24 - 24 - spacing(20) = 732 → 366 each; 400 - 16 - 16 = 368
        expect(views[0].width).toBe(366);
        expect(views[0].height).toBe(368);
    });

    it('respects composite padding 0 without axis-reserve insets', () => {
        const result = normalizeVegaSpecSizing(
            {
                ...hconcatSpec,
                padding: 0,
            },
            { width: 800, height: 400 },
        );
        const views = result.hconcat as Record<string, unknown>[];
        expect(result.padding).toBe(0);
        // 800 - spacing(20) = 780 → 390 each; full height 400
        expect(views[0].width).toBe(390);
        expect(views[1].width).toBe(390);
        expect(views[0].height).toBe(400);
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
        // no encoding → left0+right8; remaining slot (792-20)/2 = 386
        expect(views[1].width).toBe(386);
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

    it('keeps dashboard fit without continuous resize when disabled', () => {
        expect(
            getVegaAutosizeConfig(singleViewSpec, true, undefined, {
                continuousResize: false,
            }),
        ).toEqual({
            type: 'fit',
        });
    });

    it('uses autosize none for ordinary narrow explicit pixel single view', () => {
        expect(
            getVegaAutosizeConfig(singleViewSpec, true, undefined, {
                continuousResize: false,
                useExplicitPixelSize: true,
            }),
        ).toEqual({ type: 'none' });
    });

    it('preserves author fit autosize on narrow without enabling resize', () => {
        expect(
            getVegaAutosizeConfig(
                {
                    ...singleViewSpec,
                    autosize: { type: 'fit', contains: 'padding' },
                },
                true,
                undefined,
                {
                    continuousResize: false,
                    useExplicitPixelSize: true,
                },
            ),
        ).toEqual({ type: 'fit', contains: 'padding' });
    });

    it('does not force explicit-pixel autosize when step-height fits container', () => {
        const mobileLayout: ResponsiveLayout = {
            layoutId: 'mobile',
            variant: 'mobile',
            useStepHeight: true,
            useStepWidth: false,
            useAutosizeNone: false,
            chartSize: { width: 375, height: 320 },
            containerStyle: { overflow: 'hidden' },
            vegaStyle: { width: 375, height: 320 },
        };
        expect(
            getVegaAutosizeConfig(singleViewSpec, true, mobileLayout, {
                continuousResize: false,
                useExplicitPixelSize: true,
            }),
        ).toEqual({ type: 'fit' });
    });

    it('uses none autosize for step-width on narrow even when width fits', () => {
        const stepWidthLayout: ResponsiveLayout = {
            layoutId: 'desktop',
            variant: 'desktop',
            useStepHeight: false,
            useStepWidth: true,
            useAutosizeNone: false,
            chartSize: { width: 500, height: 300 },
            containerStyle: { overflow: 'hidden' },
            vegaStyle: { width: 500, height: 300 },
        };
        expect(
            getVegaAutosizeConfig(singleViewSpec, true, stepWidthLayout, {
                continuousResize: false,
                useExplicitPixelSize: true,
            }),
        ).toEqual({ type: 'none' });
    });

    it('uses pad with contains padding for composite view', () => {
        expect(getVegaAutosizeConfig(hconcatSpec, true)).toEqual({
            type: 'pad',
            contains: 'padding',
        });
    });

    it('uses none autosize for mobile step height layout', () => {
        const mobileLayout: ResponsiveLayout = {
            layoutId: 'mobile',
            variant: 'mobile',
            useStepHeight: true,
            useStepWidth: false,
            useAutosizeNone: true,
            chartSize: { width: 375, height: 320 },
            containerStyle: { overflowY: 'auto' },
            vegaStyle: { width: 375, height: 320 },
        };
        expect(
            getVegaAutosizeConfig(singleViewSpec, true, mobileLayout),
        ).toEqual({ type: 'none' });
    });
});

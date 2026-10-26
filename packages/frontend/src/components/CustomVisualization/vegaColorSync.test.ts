import { describe, expect, it } from 'vitest';
import {
    applyDashboardColorSync,
    collectCategoricalColorPaths,
    extractDomainValues,
} from './vegaColorSync';

const resolveColor = (value: string, _field?: string): string =>
    `color:${value}`;

const series = [
    { category: 'A', sales: 1 },
    { category: 'B', sales: 2 },
    { category: 'A', sales: 3 },
];

const topLevelSpec = {
    mark: 'bar',
    encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'sales', type: 'quantitative' },
        color: { field: 'category', type: 'nominal' },
    },
};

function getAt(
    spec: Record<string, unknown>,
    path: Array<string | number>,
): unknown {
    let current: unknown = spec;
    path.forEach((key) => {
        current = (current as Record<string | number, unknown>)[key];
    });
    return current;
}

/** 取 color 编码定义 */
function getColorDef(
    spec: Record<string, unknown>,
    path: Array<string | number>,
): Record<string, unknown> {
    return getAt(spec, path) as Record<string, unknown>;
}

/** 取 color 编码上的 scale */
function getColorScale(
    spec: Record<string, unknown>,
    path: Array<string | number>,
): Record<string, unknown> {
    return getAt(spec, [...path, 'scale']) as Record<string, unknown>;
}

describe('collectCategoricalColorPaths', () => {
    it('collects top-level categorical color encoding', () => {
        expect(collectCategoricalColorPaths(topLevelSpec)).toEqual([
            ['encoding', 'color'],
        ]);
    });

    it('collects nested layer color encodings', () => {
        const spec = {
            layer: [
                {
                    mark: 'bar',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
                {
                    mark: 'line',
                    layer: [
                        {
                            mark: 'point',
                            encoding: {
                                color: { field: 'category', type: 'ordinal' },
                            },
                        },
                    ],
                },
            ],
        };
        expect(collectCategoricalColorPaths(spec)).toEqual([
            ['layer', 0, 'encoding', 'color'],
            ['layer', 1, 'layer', 0, 'encoding', 'color'],
        ]);
    });

    it('skips condition, quantitative and explicit range encodings', () => {
        const spec = {
            layer: [
                {
                    mark: 'bar',
                    encoding: {
                        color: {
                            condition: {
                                test: 'datum.sales > 1',
                                value: 'red',
                            },
                            field: 'category',
                            type: 'nominal',
                        },
                    },
                },
                {
                    mark: 'bar',
                    encoding: {
                        color: { field: 'sales', type: 'quantitative' },
                    },
                },
                {
                    mark: 'bar',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
                {
                    mark: 'bar',
                    encoding: {
                        color: {
                            field: 'category',
                            type: 'nominal',
                            scale: { range: ['#111', '#222'] },
                        },
                    },
                },
            ],
        };
        expect(collectCategoricalColorPaths(spec)).toEqual([
            ['layer', 2, 'encoding', 'color'],
        ]);
    });
});

describe('extractDomainValues', () => {
    it('returns unique values in first-seen order', () => {
        expect(extractDomainValues(series, 'category')).toEqual(['A', 'B']);
    });

    it('keeps numeric values as numbers', () => {
        expect(
            extractDomainValues([{ v: 1 }, { v: 2 }, { v: 1 }], 'v'),
        ).toEqual([1, 2]);
    });

    it('distinguishes number 1 from string "1"', () => {
        expect(
            extractDomainValues([{ v: 1 }, { v: '1' }, { v: 1 }], 'v'),
        ).toEqual([1, '1']);
    });

    it('returns empty array for missing field', () => {
        expect(extractDomainValues(series, 'computed')).toEqual([]);
    });
});

describe('applyDashboardColorSync', () => {
    it('injects domain and range into top-level color encoding', () => {
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec: topLevelSpec,
            series,
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
        expect(visibleKeys).toEqual(['A', 'B']);
    });

    it('injects into layer and nested layer encodings', () => {
        const spec = {
            layer: [
                {
                    mark: 'bar',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
                {
                    mark: 'line',
                    layer: [
                        {
                            mark: 'point',
                            encoding: {
                                color: { field: 'category', type: 'ordinal' },
                            },
                        },
                    ],
                },
            ],
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(
            getColorScale(result, ['layer', 0, 'encoding', 'color']),
        ).toEqual({
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
        expect(
            getColorScale(result, [
                'layer',
                1,
                'layer',
                0,
                'encoding',
                'color',
            ]),
        ).toEqual({
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
        expect(visibleKeys).toEqual(['A', 'B']);
    });

    it('does not override explicit scale.range', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'category',
                    type: 'nominal',
                    scale: { range: ['#111', '#222'] },
                },
            },
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            range: ['#111', '#222'],
        });
        expect(visibleKeys).toEqual([]);
    });

    it('replaces scheme with domain and range, keeping other scale props', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'category',
                    type: 'nominal',
                    scale: { scheme: 'category20', padding: 0.2 },
                },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            padding: 0.2,
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
    });

    it('skips condition encodings', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    condition: { test: 'datum.sales > 1', value: 'red' },
                    field: 'category',
                    type: 'nominal',
                },
            },
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(getColorDef(result, ['encoding', 'color'])).toEqual({
            condition: { test: 'datum.sales > 1', value: 'red' },
            field: 'category',
            type: 'nominal',
        });
        expect(visibleKeys).toEqual([]);
    });

    it('skips quantitative color encodings', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'sales', type: 'quantitative' },
            },
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(getColorDef(result, ['encoding', 'color'])).toEqual({
            field: 'sales',
            type: 'quantitative',
        });
        expect(visibleKeys).toEqual([]);
    });

    it('skips encodings whose field is missing from series (computed column)', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'computed_bucket', type: 'nominal' },
            },
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(getColorDef(result, ['encoding', 'color'])).toEqual({
            field: 'computed_bucket',
            type: 'nominal',
        });
        expect(visibleKeys).toEqual([]);
    });

    it('keeps domain order and value types', () => {
        const numericSeries = [{ v: 10 }, { v: 2 }, { v: 10 }, { v: 'x' }];
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'v', type: 'nominal' },
            },
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series: numericSeries,
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: [10, 2, 'x'],
            range: ['color:10', 'color:2', 'color:x'],
        });
        expect(visibleKeys).toEqual(['10', '2', 'x']);
    });

    it('does not inject when series is empty', () => {
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec: topLevelSpec,
            series: [],
            resolveColor,
        });
        expect(result).toBe(topLevelSpec);
        expect(visibleKeys).toEqual([]);
    });

    it('does not mutate the input spec', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'category', type: 'nominal' },
            },
        };
        const snapshot = JSON.stringify(spec);
        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(JSON.stringify(spec)).toEqual(snapshot);
        expect(result).not.toBe(spec);
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
    });

    it('returns the original spec when nothing is injectable', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'sales', type: 'quantitative' },
            },
        };
        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect(result).toBe(spec);
        expect(visibleKeys).toEqual([]);
    });
    it('injects into composite views (hconcat / vconcat / concat)', () => {
        const spec = {
            hconcat: [
                {
                    mark: 'bar',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
                {
                    mark: 'line',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
            ],
            vconcat: [
                {
                    mark: 'point',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
            ],
        };

        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });

        expect(
            (result as any).hconcat[0].encoding.color.scale.domain,
        ).toEqual(['A', 'B']);
        expect(
            (result as any).hconcat[1].encoding.color.scale.range,
        ).toEqual(['color:A', 'color:B']);
        expect(
            (result as any).vconcat[0].encoding.color.scale.domain,
        ).toEqual(['A', 'B']);
        expect(visibleKeys).toEqual(['A', 'B']);
    });

    it('injects into facet / repeat sub specs', () => {
        const spec = {
            facet: {
                spec: {
                    mark: 'bar',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
            },
            repeat: {
                spec: {
                    mark: 'line',
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });

        expect((result as any).facet.spec.encoding.color.scale.domain).toEqual([
            'A',
            'B',
        ]);
        expect((result as any).repeat.spec.encoding.color.scale.range).toEqual([
            'color:A',
            'color:B',
        ]);
    });

    it('collects color paths inside composite views', () => {
        const spec = {
            hconcat: [
                {
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
            ],
            facet: {
                spec: {
                    encoding: {
                        color: { field: 'category', type: 'nominal' },
                    },
                },
            },
        };

        expect(collectCategoricalColorPaths(spec)).toEqual([
            ['hconcat', 0, 'encoding', 'color'],
            ['facet', 'spec', 'encoding', 'color'],
        ]);
    });
});

import { describe, expect, it } from 'vitest';
import {
    applyDashboardColorSync,
    collectCategoricalColorPaths,
    extractDomainValues,
    isNeutralColor,
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

describe('isNeutralColor', () => {
    it('黑/白/灰是中性色', () => {
        expect(isNeutralColor('#000000')).toBe(true);
        expect(isNeutralColor('#000')).toBe(true);
        expect(isNeutralColor('#555555')).toBe(true);
        expect(isNeutralColor('#cccccc')).toBe(true);
        expect(isNeutralColor('#ffffff')).toBe(true);
        expect(isNeutralColor('rgb(10, 10, 10)')).toBe(true);
    });

    it('彩色不是中性色', () => {
        expect(isNeutralColor('#4169E1')).toBe(false);
        expect(isNeutralColor('#52c256')).toBe(false);
        expect(isNeutralColor('#0143c6')).toBe(false);
        expect(isNeutralColor('rgb(82, 194, 86)')).toBe(false);
    });

    it('无法解析时按中性色处理', () => {
        expect(isNeutralColor('not-a-color')).toBe(true);
    });
});

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

    it('skips condition and quantitative encodings', () => {
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
        // 显式 range 的编码也会被注入（开启同步时由看板色板接管配色）
        expect(collectCategoricalColorPaths(spec)).toEqual([
            ['layer', 2, 'encoding', 'color'],
            ['layer', 3, 'encoding', 'color'],
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

    it('keeps null values (vega-lite colors null categories too)', () => {
        expect(
            extractDomainValues([{ v: 'A' }, { v: null }, { v: 'A' }], 'v'),
        ).toEqual(['A', null]);
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

    it('overrides explicit scale.range with the dashboard palette', () => {
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
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
        expect(visibleKeys).toEqual(['A', 'B']);
    });

    it('remaps constant colors that matched the previous range', () => {
        // 手绘图例：`color: { value: '#111' }` 属于旧 range → 跟随看板色板
        const spec = {
            layer: [
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
                {
                    mark: 'rect',
                    encoding: { color: { value: '#111' } },
                },
                {
                    mark: { type: 'point', color: '#222' },
                },
                {
                    mark: 'text',
                    encoding: { color: { value: '#333' } },
                },
            ],
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });
        expect((result as any).layer[1].encoding.color.value).toBe('color:A');
        expect((result as any).layer[2].mark.color).toBe('color:B');
        // 与旧 range 无关的颜色保持不变
        expect((result as any).layer[3].encoding.color.value).toBe('#333');
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

    it('keeps value types and sorts the domain like vega-lite', () => {
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
        // 与 vega-lite 默认（sort: true）一致：数字按数值升序，字符串按字典序
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: [2, 10, 'x'],
            range: ['color:2', 'color:10', 'color:x'],
        });
        expect(visibleKeys).toEqual(['10', '2', 'x']);
    });

    it('keeps the data order when sort is false', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'category', type: 'nominal', sort: false },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series: [{ category: 'B' }, { category: 'A' }],
            resolveColor,
        });
        // sort: false → 保持数据出现顺序
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'B',
            'A',
        ]);
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
    it('honors color.sort by ordering the domain', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'sales', type: 'quantitative' },
                color: { field: 'category', type: 'nominal', sort: '-y' },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });

        // A 的 sales 合计 4 > B 的 2 → 降序
        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['A', 'B'],
            range: ['color:A', 'color:B'],
        });
    });

    it('honors color.sort with an explicit field and order', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'category',
                    type: 'nominal',
                    sort: { field: 'sales', op: 'sum', order: 'descending' },
                },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });

        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'A',
            'B',
        ]);
    });

    it('reorders the domain when the aggregate says so', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'category',
                    type: 'nominal',
                    sort: { field: 'sales', op: 'sum', order: 'ascending' },
                },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series,
            resolveColor,
        });

        // 升序：B(2) 在前，A(4) 在后
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'B',
            'A',
        ]);
        expect(getColorScale(result, ['encoding', 'color'])?.range).toEqual([
            'color:B',
            'color:A',
        ]);
    });

    it('uses the channel aggregate when sorting by a channel', () => {
        // A: 10, 10（sum=20, mean=10）  B: 5 x 20（sum=100, mean=5）
        const rows = [
            { category: 'A', sales: 10 },
            { category: 'A', sales: 10 },
            ...Array.from({ length: 20 }, () => ({ category: 'B', sales: 5 })),
        ];
        const spec = {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'sales', type: 'quantitative', aggregate: 'mean' },
                color: { field: 'category', type: 'nominal', sort: '-y' },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series: rows,
            resolveColor,
        });

        // mean 降序：A(10) > B(5)；若用 sum 则顺序相反
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'A',
            'B',
        ]);
    });

    it('sorts temporal channels by the earliest value', () => {
        const rows = [
            { category: 'A', day: '2024-05-01' },
            { category: 'B', day: '2024-01-01' },
        ];
        const spec = {
            mark: 'bar',
            encoding: {
                y: { field: 'day', type: 'temporal' },
                color: { field: 'category', type: 'nominal', sort: '-y' },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series: rows,
            resolveColor,
        });

        // temporal 默认聚合是 min，降序 → 较晚的 A 在前
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'A',
            'B',
        ]);
    });

    it('treats sort: true as the data order (like vega-lite)', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'category', type: 'nominal', sort: true },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series: [{ category: 'B' }, { category: 'A' }],
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'B',
            'A',
        ]);
    });

    it('sorts ascending for sort: "ascending"', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'category', type: 'nominal', sort: 'ascending' },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series: [{ category: 'B' }, { category: 'A' }],
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'A',
            'B',
        ]);
    });

    it('sorts descending for sort: "descending"', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'category', type: 'nominal', sort: 'descending' },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series: [{ category: 'B' }, { category: 'A' }],
            resolveColor,
        });
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'B',
            'A',
        ]);
    });

    it('uses sum for a stacked measure when sorting by a field', () => {
        // A: 3 + 8 = 11（sum） / 3（min）；B: 1 + 5 = 6 / 1；C: 2
        const rows = [
            { category: 'A', sales: 3 },
            { category: 'A', sales: 8 },
            { category: 'B', sales: 1 },
            { category: 'B', sales: 5 },
            { category: 'C', sales: 2 },
        ];
        const spec = {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'sales', type: 'quantitative' },
                color: { field: 'category', type: 'nominal', sort: { field: 'sales' } },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series: rows,
            resolveColor,
        });
        // 堆叠度量默认 sum 升序：C(2) < B(6) < A(11)
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'C',
            'B',
            'A',
        ]);
    });

    it('uses min for a non-stacked chart when sorting by a field', () => {
        const rows = [
            { category: 'A', sales: 3 },
            { category: 'A', sales: 8 },
            { category: 'B', sales: 1 },
            { category: 'B', sales: 5 },
            { category: 'C', sales: 2 },
        ];
        const spec = {
            mark: 'line',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'sales', type: 'quantitative' },
                color: { field: 'category', type: 'nominal', sort: { field: 'sales' } },
            },
        };
        const { spec: result } = applyDashboardColorSync({
            spec,
            series: rows,
            resolveColor,
        });
        // 非堆叠默认 min 升序：B(1) < C(2) < A(3)
        expect(getColorScale(result, ['encoding', 'color'])?.domain).toEqual([
            'B',
            'C',
            'A',
        ]);
    });

    it('skips injection when the sort cannot be resolved', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'category',
                    type: 'nominal',
                    sort: { op: 'count', order: 'descending' },
                },
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

    it('keeps null categories colored with a neutral gray', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: { field: 'category', type: 'nominal' },
            },
        };

        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series: [{ category: 'A' }, { category: null }, { category: 'B' }],
            resolveColor,
        });

        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: [null, 'A', 'B'],
            range: ['#cccccc', 'color:A', 'color:B'],
        });
        // null 不占用看板色表槽位
        expect(visibleKeys).toEqual(['A', 'B']);
    });

    it('uses an explicit scale.domain as the series set (transform-computed field)', () => {
        // fold/calculate 产生的字段不在原始数据里，但用户显式给了 domain
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'year_label',
                    type: 'nominal',
                    scale: { domain: ['上期销售额', '本期销售额'] },
                },
            },
        };

        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series: [{ sales: 1 }],
            resolveColor,
        });

        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['上期销售额', '本期销售额'],
            range: ['color:上期销售额', 'color:本期销售额'],
        });
        expect(visibleKeys).toEqual(['上期销售额', '本期销售额']);
    });

    it('overrides an explicit scale.range even with an explicit domain', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'year_label',
                    type: 'nominal',
                    scale: {
                        domain: ['上期销售额', '本期销售额'],
                        range: ['#4169E1', '#FF9933'],
                    },
                },
            },
        };

        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series: [{ sales: 1 }],
            resolveColor,
        });

        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['上期销售额', '本期销售额'],
            range: ['color:上期销售额', 'color:本期销售额'],
        });
        expect(visibleKeys).toEqual(['上期销售额', '本期销售额']);
    });

    it('ignores color.sort when an explicit domain is given (vega-lite keeps the given order)', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'year_label',
                    type: 'nominal',
                    sort: '-y',
                    scale: { domain: ['B', 'A'] },
                },
            },
        };

        const { spec: result } = applyDashboardColorSync({
            spec,
            series: [{ sales: 1 }],
            resolveColor,
        });

        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['B', 'A'],
            range: ['color:B', 'color:A'],
        });
    });

    it('skips color encodings with scale: null (the field value is the color itself)', () => {
        const spec = {
            mark: 'text',
            encoding: {
                color: {
                    field: 'label_color',
                    type: 'nominal',
                    scale: null,
                },
            },
        };

        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series: [{ label_color: '#3CB976' }],
            resolveColor,
        });

        expect(result).toBe(spec);
        expect(visibleKeys).toEqual([]);
    });

    it('keeps a null entry inside an explicit domain with the neutral gray', () => {
        const spec = {
            mark: 'bar',
            encoding: {
                color: {
                    field: 'year_label',
                    type: 'nominal',
                    scale: { domain: ['本期销售额', null] },
                },
            },
        };

        const { spec: result, visibleKeys } = applyDashboardColorSync({
            spec,
            series: [{ sales: 1 }],
            resolveColor,
        });

        expect(getColorScale(result, ['encoding', 'color'])).toEqual({
            domain: ['本期销售额', null],
            range: ['color:本期销售额', '#cccccc'],
        });
        expect(visibleKeys).toEqual(['本期销售额']);
    });

    describe('字面色编码（无 field，用颜色表达数据含义）', () => {
        it('接管 value + condition 的字面色，并用字面值作为颜色键', () => {
            const spec = {
                layer: [
                    {
                        mark: { type: 'bar' },
                        encoding: {
                            color: {
                                value: '#d64545',
                                condition: {
                                    test: 'datum.pct >= 0',
                                    value: '#22a06b',
                                },
                            },
                        },
                    },
                ],
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(
                getColorDef(result, ['layer', 0, 'encoding', 'color']),
            ).toEqual({
                value: 'color:#d64545',
                condition: {
                    test: 'datum.pct >= 0',
                    value: 'color:#22a06b',
                },
            });
            expect(visibleKeys).toEqual(['#d64545', '#22a06b']);
        });

        it('支持 condition 数组', () => {
            const spec = {
                mark: 'bar',
                encoding: {
                    color: {
                        value: '#cccccc',
                        condition: [
                            { test: 'datum.pct >= 0', value: '#22a06b' },
                            { test: 'datum.pct >= 50', value: '#1f8a5e' },
                        ],
                    },
                },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getColorDef(result, ['encoding', 'color'])).toEqual({
                value: '#cccccc',
                condition: [
                    { test: 'datum.pct >= 0', value: 'color:#22a06b' },
                    { test: 'datum.pct >= 50', value: 'color:#1f8a5e' },
                ],
            });
            // 中性色（#cccccc）不入色表
            expect(visibleKeys).toEqual(['#22a06b', '#1f8a5e']);
        });

        it('不改动 mark.color 等装饰性颜色', () => {
            const spec = {
                layer: [
                    {
                        mark: { type: 'bar', color: '#555555' },
                        encoding: {
                            color: { value: '#d64545' },
                        },
                    },
                ],
            };

            const { spec: result } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getAt(result, ['layer', 0, 'mark'])).toEqual({
                type: 'bar',
                color: '#555555',
            });
        });

        it('有 field 的 condition 编码保持原样', () => {
            const spec = {
                mark: 'bar',
                encoding: {
                    color: {
                        field: 'category',
                        type: 'nominal',
                        condition: {
                            test: 'datum.sales > 1',
                            value: '#22a06b',
                        },
                    },
                },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series,
                resolveColor,
            });

            expect(getColorDef(result, ['encoding', 'color'])).toEqual({
                field: 'category',
                type: 'nominal',
                condition: { test: 'datum.sales > 1', value: '#22a06b' },
            });
            expect(visibleKeys).toEqual([]);
        });

        it('scale: null 的字面色编码不处理', () => {
            const spec = {
                mark: 'bar',
                encoding: {
                    color: { value: '#d64545', scale: null },
                },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(result).toBe(spec);
            expect(visibleKeys).toEqual([]);
        });

        it('只写死一个颜色（无 condition）的编码也由色板接管', () => {
            const spec = {
                mark: 'bar',
                encoding: {
                    color: { value: '#d64545' },
                },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getColorDef(result, ['encoding', 'color'])).toEqual({
                value: 'color:#d64545',
            });
            expect(visibleKeys).toEqual(['#d64545']);
        });

        it('中性色（黑/白/灰）保持原样', () => {
            const spec = {
                mark: 'bar',
                encoding: {
                    color: { value: '#555555' },
                },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(result).toBe(spec);
            expect(visibleKeys).toEqual([]);
        });
    });

    describe('mark 级写死颜色（mark.color / mark.fill / mark.stroke / mark.point.*）', () => {
        it('接管 mark.color，并以字面值作为颜色键', () => {
            const spec = {
                mark: { type: 'bar', color: '#4169E1' },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getAt(result, ['mark'])).toEqual({
                type: 'bar',
                color: 'color:#4169e1',
            });
            expect(visibleKeys).toEqual(['#4169e1']);
        });

        it('接管 mark.fill / mark.stroke / mark.point.fill / mark.point.stroke', () => {
            const spec = {
                layer: [
                    {
                        mark: {
                            type: 'line',
                            fill: '#52c256',
                            stroke: '#0143c6',
                            point: { fill: '#52c256', stroke: '#0143c6' },
                        },
                    },
                ],
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getAt(result, ['layer', 0, 'mark'])).toEqual({
                type: 'line',
                fill: 'color:#52c256',
                stroke: 'color:#0143c6',
                point: {
                    fill: 'color:#52c256',
                    stroke: 'color:#0143c6',
                },
            });
            expect(visibleKeys).toEqual(['#52c256', '#0143c6']);
        });

        it('中性色（黑/白/灰）不改', () => {
            const spec = {
                layer: [
                    {
                        mark: {
                            type: 'text',
                            color: '#000',
                            fill: '#ffffff',
                            stroke: '#cccccc',
                        },
                    },
                ],
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getAt(result, ['layer', 0, 'mark'])).toEqual({
                type: 'text',
                color: '#000',
                fill: '#ffffff',
                stroke: '#cccccc',
            });
            expect(visibleKeys).toEqual([]);
        });

        it('接管 encoding.fill.value / encoding.stroke.value', () => {
            const spec = {
                mark: 'bar',
                encoding: {
                    fill: { value: '#4169E1' },
                    stroke: { value: '#0143c6' },
                },
            };

            const { spec: result, visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(getAt(result, ['encoding', 'fill'])).toEqual({
                value: 'color:#4169e1',
            });
            expect(getAt(result, ['encoding', 'stroke'])).toEqual({
                value: 'color:#0143c6',
            });
            expect(visibleKeys).toEqual(['#4169e1', '#0143c6']);
        });

        it('同一字面值在图中只占一个色表槽位', () => {
            const spec = {
                layer: [
                    { mark: { type: 'line', stroke: '#52c256' } },
                    { mark: { type: 'text', color: '#52c256' } },
                ],
            };

            const { visibleKeys } = applyDashboardColorSync({
                spec,
                series: [],
                resolveColor,
            });

            expect(visibleKeys).toEqual(['#52c256']);
        });
    });
});

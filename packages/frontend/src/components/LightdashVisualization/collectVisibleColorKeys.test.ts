import { ChartType, type ChartConfig, type Series } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { collectVisibleColorKeys } from './collectVisibleColorKeys';

/**
 * 「本图容量」口径回归。
 *
 * 背景（卡夫亨氏看板真实现场）：按品种枢轴的折线图 `window.__msyColorSync`
 * 实测 `visibleKeys = 147`，而真正渲染只有十几条系列——`computedSeries`
 * 保留了 `isFilteredOut` 的历史 pivot 系列（如「(永叔公)290g土磨坊麻油白腐乳」
 * 与当前「类目=酱油」过滤完全矛盾）。147 个 key 吃光 20 色调色板 + 扩展变体后
 * 落进「只要求不重复」的兜底，同图出现 ΔE00 < 1 的两条黄线。
 *
 * 因此容量必须与「真正会渲染的系列」对齐，本文件钉住这条口径。
 */
const series = ({
    field,
    pivotValue,
    filteredOut,
}: {
    field: string;
    pivotValue: string;
    filteredOut?: boolean;
}): Series =>
    ({
        type: 'line',
        encode: {
            xRef: { field: 'orders_date' },
            yRef: {
                field,
                pivotValues: [{ field: 'orders_sku', value: pivotValue }],
            },
        },
        ...(filteredOut ? { isFilteredOut: true } : {}),
    }) as unknown as Series;

const cartesianConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: { xField: 'orders_date', yField: ['orders_revenue'] },
        eChartsConfig: { series: [] },
        metadata: undefined,
    },
} as unknown as ChartConfig;

const pivotDetails = (values: string[]) =>
    ({
        pivotDetails: {
            valuesColumns: values.map((value) => ({
                pivotValues: [{ field: 'orders_sku', value }],
            })),
        },
    }) as unknown as Parameters<
        typeof collectVisibleColorKeys
    >[0]['resultsData'];

describe('collectVisibleColorKeys（本图容量口径）', () => {
    test('过滤 isFilteredOut 的历史 pivot 系列，并计数', () => {
        const stale = Array.from({ length: 133 }, (_, index) =>
            series({
                field: 'orders_revenue',
                pivotValue: `历史品种${index}`,
                filteredOut: true,
            }),
        );
        const alive = ['酱油A', '酱油B'].map((pivotValue) =>
            series({ field: 'orders_revenue', pivotValue }),
        );

        const result = collectVisibleColorKeys({
            chartConfig: cartesianConfig,
            computedSeries: [...alive, ...stale],
            resultsData: pivotDetails(['酱油A', '酱油B']),
        });

        expect(result.keys).toEqual(['酱油A', '酱油B']);
        expect(result.renderedSeriesCount).toBe(2);
        expect(result.skippedFilteredOutCount).toBe(133);
    });

    test('147 → 14：stale 系列不再占色位', () => {
        const alive = Array.from({ length: 14 }, (_, index) =>
            series({ field: 'orders_revenue', pivotValue: `品种${index}` }),
        );
        const stale = Array.from({ length: 133 }, (_, index) =>
            series({
                field: 'orders_revenue',
                pivotValue: `(历史品种)290g-${index}`,
                filteredOut: true,
            }),
        );

        const result = collectVisibleColorKeys({
            chartConfig: cartesianConfig,
            computedSeries: [...stale, ...alive],
            resultsData: pivotDetails(alive.map((_, index) => `品种${index}`)),
        });

        // 系列顺序先入、pivotDetails 补齐后入；同一 pivot 值不重复收集
        expect(result.keys).toHaveLength(14);
        expect(result.skippedFilteredOutCount).toBe(133);
    });

    test('pivotDetails 补齐去重且保持插入顺序', () => {
        const result = collectVisibleColorKeys({
            chartConfig: cartesianConfig,
            computedSeries: [
                series({ field: 'orders_revenue', pivotValue: 'B' }),
            ],
            // 多 metric × 多列会重复携带同一 pivot 值
            resultsData: pivotDetails(['A', 'B', 'A', 'C']),
        });

        expect(result.keys).toEqual(['B', 'A', 'C']);
    });

    test('computedSeries 为空时回退到 chartConfig 的 series（并过滤）', () => {
        const result = collectVisibleColorKeys({
            chartConfig: {
                ...cartesianConfig,
                config: {
                    ...(cartesianConfig as never as { config: object }).config,
                    eChartsConfig: {
                        series: [
                            series({
                                field: 'orders_revenue',
                                pivotValue: 'alive',
                            }),
                            series({
                                field: 'orders_revenue',
                                pivotValue: 'stale',
                                filteredOut: true,
                            }),
                        ],
                    },
                },
            } as unknown as ChartConfig,
            computedSeries: [],
            resultsData: undefined,
        });

        expect(result.keys).toEqual(['alive']);
        expect(result.skippedFilteredOutCount).toBe(1);
    });

    test('非 CARTESIAN 图返回原口径（无 stale 语义）', () => {
        const result = collectVisibleColorKeys({
            chartConfig: { type: ChartType.TABLE } as unknown as ChartConfig,
            computedSeries: undefined,
            resultsData: pivotDetails(['A']),
        });

        expect(result.keys).toEqual([]);
        expect(result.renderedSeriesCount).toBeNull();
        expect(result.skippedFilteredOutCount).toBeNull();
    });
});

import {
    CartesianSeriesType,
    ChartType,
    type ChartConfig,
    type Series,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { type EChartSeries } from '../echarts/useEchartsCartesianConfig';
import { BASELINE_MERGED_PIVOT_VALUE } from '../plottedData/getPlottedData';
import { type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier, getBaselineUserColor } from './utils';

const cartesianConfig = (options?: {
    baselineFieldIds?: string[];
    metadata?: Record<string, { color: string }>;
}): ChartConfig => ({
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'dim_x',
            yField: ['metric_a', 'metric_b'],
            ...(options?.baselineFieldIds ? { baselineFieldIds: options.baselineFieldIds } : {}),
        },
        eChartsConfig: {},
        ...(options?.metadata ? { metadata: options.metadata } : {}),
    },
});

const simpleBaselineSeries: Series = {
    encode: {
        xRef: { field: 'dim_x' },
        yRef: { field: 'metric_a' },
    },
    type: CartesianSeriesType.LINE,
};

const simpleNonBaselineSeries: Series = {
    encode: {
        xRef: { field: 'dim_x' },
        yRef: { field: 'metric_b' },
    },
    type: CartesianSeriesType.LINE,
};

/** 合并后的基准线透视系列（运行时 EChartSeries 形态，带哨兵 pivotValues） */
const mergedBaselineEChartSeries: EChartSeries = {
    type: CartesianSeriesType.LINE,
    connectNulls: true,
    pivotReference: {
        field: 'metric_a',
        pivotValues: [
            { field: 'dim_x', value: BASELINE_MERGED_PIVOT_VALUE },
        ],
    },
};

describe('getBaselineUserColor', () => {
    test('returns null for non-CARTESIAN chart configs even when the field is a baseline', () => {
        const pieConfig: ChartConfig = {
            type: ChartType.PIE,
            config: {},
        };
        expect(
            getBaselineUserColor(
                { ...simpleBaselineSeries, color: '#ff0000' },
                pieConfig,
            ),
        ).toBeNull();
    });

    test('returns null when layout has no baselineFieldIds', () => {
        expect(
            getBaselineUserColor(
                { ...simpleBaselineSeries, color: '#ff0000' },
                cartesianConfig(),
            ),
        ).toBeNull();
    });

    test('returns null for non-baseline series even when they carry a custom color', () => {
        expect(
            getBaselineUserColor(
                { ...simpleNonBaselineSeries, color: '#ff0000' },
                cartesianConfig({ baselineFieldIds: ['metric_a'] }),
            ),
        ).toBeNull();
    });

    test('prefers the color stored on the series object (updateSingleSeries path)', () => {
        expect(
            getBaselineUserColor(
                { ...simpleBaselineSeries, color: '#ff0000' },
                cartesianConfig({
                    baselineFieldIds: ['metric_a'],
                    metadata: {
                        [calculateSeriesLikeIdentifier(simpleBaselineSeries).join('.')]: {
                            color: '#123456',
                        },
                    },
                }),
            ),
        ).toBe('#ff0000');
    });

    test('falls back to metadata color using the calculateSeriesLikeIdentifier key', () => {
        // SingleSeriesConfiguration 写入 metadata 用的就是同一个 key（无 pivot 时带 _n0 后缀）
        const serieId = calculateSeriesLikeIdentifier(
            simpleBaselineSeries,
        ).join('.');
        expect(serieId).toMatch(/^metric_a(_n\d+)?\.metric_a$/);
        expect(
            getBaselineUserColor(
                simpleBaselineSeries,
                cartesianConfig({
                    baselineFieldIds: ['metric_a'],
                    metadata: { [serieId]: { color: '#123456' } },
                }),
            ),
        ).toBe('#123456');
    });

    test('returns null when the baseline series has no user color anywhere', () => {
        expect(
            getBaselineUserColor(
                simpleBaselineSeries,
                cartesianConfig({ baselineFieldIds: ['metric_a'] }),
            ),
        ).toBeNull();
    });

    test('resolves runtime EChartSeries (pivotReference) merged baseline series', () => {
        expect(
            getBaselineUserColor(
                {
                    ...mergedBaselineEChartSeries,
                    color: '#00ff00',
                } as unknown as SeriesLike,
                cartesianConfig({
                    baselineFieldIds: ['metric_a'],
                    metadata: {
                        [`metric_a.${BASELINE_MERGED_PIVOT_VALUE}`]: {
                            color: '#123456',
                        },
                    },
                }),
            ),
        ).toBe('#00ff00');
    });

    test('merged baseline series without series color reads its metadata color', () => {
        expect(
            getBaselineUserColor(
                mergedBaselineEChartSeries as unknown as SeriesLike,
                cartesianConfig({
                    baselineFieldIds: ['metric_a'],
                    metadata: {
                        [`metric_a.${BASELINE_MERGED_PIVOT_VALUE}`]: {
                            color: '#123456',
                        },
                    },
                }),
            ),
        ).toBe('#123456');
    });
});

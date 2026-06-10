import { ChartKind, ECHARTS_DEFAULT_COLORS } from '../types/savedCharts';
import { CartesianChartDataModel } from './CartesianChartDataModel';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
} from './types';
import type { IResultsRunner } from './types/IResultsRunner';

describe('CartesianChartDataModel.getDefaultColor', () => {
    it('should return palette colors for indices within palette size', () => {
        for (let i = 0; i < ECHARTS_DEFAULT_COLORS.length; i += 1) {
            expect(CartesianChartDataModel.getDefaultColor(i)).toBe(
                ECHARTS_DEFAULT_COLORS[i],
            );
        }
    });

    it('should generate unique colors beyond palette size', () => {
        const colors = new Set<string>();
        for (let i = 0; i < 50; i += 1) {
            const color = CartesianChartDataModel.getDefaultColor(i);
            expect(color).toMatch(/^#[0-9a-f]{6}$/i);
            colors.add(color);
        }
        // Should have at least 40+ unique colors (allowing for minimal repetition)
        expect(colors.size).toBeGreaterThan(40);
    });

    it('should work with custom organization colors', () => {
        const customColors = ['#ff0000', '#00ff00', '#0000ff'];
        expect(CartesianChartDataModel.getDefaultColor(0, customColors)).toBe(
            '#ff0000',
        );
        expect(CartesianChartDataModel.getDefaultColor(1, customColors)).toBe(
            '#00ff00',
        );
        expect(CartesianChartDataModel.getDefaultColor(2, customColors)).toBe(
            '#0000ff',
        );
        // Beyond palette size should generate new colors
        const generatedColor = CartesianChartDataModel.getDefaultColor(
            3,
            customColors,
        );
        expect(generatedColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(customColors).not.toContain(generatedColor);
    });

    it('should generate valid hex colors for extended indices', () => {
        for (let i = 9; i < 30; i += 1) {
            const color = CartesianChartDataModel.getDefaultColor(i);
            expect(color).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });

    it('should generate different colors for consecutive indices beyond palette', () => {
        const color9 = CartesianChartDataModel.getDefaultColor(9);
        const color10 = CartesianChartDataModel.getDefaultColor(10);
        const color11 = CartesianChartDataModel.getDefaultColor(11);

        expect(color9).not.toBe(color10);
        expect(color10).not.toBe(color11);
        expect(color9).not.toBe(color11);
    });
});

const mockResultsRunner: IResultsRunner = {
    getPivotedVisualizationData: jest.fn(),
    getColumnNames: () => [],
    getRows: () => [],
    getPivotQueryDimensions: () => [],
    getPivotQueryMetrics: () => [],
    getPivotQueryCustomMetrics: () => [],
};

const mockPivotChartData: PivotChartData = {
    queryUuid: undefined,
    fileUrl: undefined,
    results: [
        { category: 'A', metric: 10 },
        { category: 'B', metric: 20 },
    ],
    indexColumn: {
        reference: 'category',
        type: VizIndexType.CATEGORY,
    },
    valuesColumns: [
        {
            referenceField: 'metric',
            pivotColumnName: 'metric',
            aggregation: VizAggregationOptions.SUM,
            pivotValues: [],
        },
    ],
    columns: [],
    columnCount: 2,
};

describe('CartesianChartDataModel.getSpec barMaxWidth', () => {
    const createModelWithData = () => {
        const model = new CartesianChartDataModel({
            resultsRunner: mockResultsRunner,
            type: ChartKind.VERTICAL_BAR,
            fieldConfig: {
                x: { reference: 'category', type: VizIndexType.CATEGORY },
                y: [
                    {
                        reference: 'metric',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [],
            },
        });
        (
            model as unknown as { pivotedChartData: PivotChartData }
        ).pivotedChartData = mockPivotChartData;
        return model;
    };

    it('applies barMaxWidth to bar series when configured', () => {
        const spec = createModelWithData().getSpec({ barMaxWidth: 40 });

        expect(spec.series).toHaveLength(1);
        expect(spec.series[0].barMaxWidth).toBe(40);
    });

    it('does not set barMaxWidth when display config is omitted', () => {
        const spec = createModelWithData().getSpec();

        expect(spec.series[0].barMaxWidth).toBeUndefined();
    });

    it('uses mobile barMaxWidth when isMobile is true', () => {
        const spec = createModelWithData().getSpec(
            { barMaxWidth: 40, barMaxWidthMobile: 24 },
            undefined,
            { isMobile: true },
        );

        expect(spec.series[0].barMaxWidth).toBe(24);
    });

    it('falls back to desktop barMaxWidth on mobile when mobile value is unset', () => {
        const spec = createModelWithData().getSpec(
            { barMaxWidth: 40 },
            undefined,
            { isMobile: true },
        );

        expect(spec.series[0].barMaxWidth).toBe(40);
    });
});

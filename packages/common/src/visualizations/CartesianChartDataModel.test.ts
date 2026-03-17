import { ECHARTS_DEFAULT_COLORS } from '../types/savedCharts';
import { CartesianChartDataModel } from './CartesianChartDataModel';

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

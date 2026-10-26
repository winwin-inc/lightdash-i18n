import { ChartType, DashboardTileTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartTypeLabel } from './chartTypeLabel';

describe('getChartTypeLabel', () => {
    it('自定义图表标注为「（自定义图表）」', () => {
        expect(
            getChartTypeLabel(DashboardTileTypes.SAVED_CHART, ChartType.CUSTOM),
        ).toEqual({
            key: 'dashboard.sync_chart_colors_types.custom',
            fallback: '（自定义图表）',
        });
    });

    it('标准图表按 chartConfig.type 标注', () => {
        expect(
            getChartTypeLabel(DashboardTileTypes.SAVED_CHART, ChartType.PIE)
                ?.fallback,
        ).toBe('（饼图）');
        expect(
            getChartTypeLabel(DashboardTileTypes.SAVED_CHART, ChartType.CARTESIAN)
                ?.fallback,
        ).toBe('（标准图表）');
        expect(
            getChartTypeLabel(DashboardTileTypes.SAVED_CHART, ChartType.TABLE)
                ?.fallback,
        ).toBe('（表格）');
        expect(
            getChartTypeLabel(
                DashboardTileTypes.SAVED_CHART,
                ChartType.BIG_NUMBER,
            )?.fallback,
        ).toBe('（指标卡）');
    });

    it('SQL 图表 tile 优先标注为「（SQL 图表）」', () => {
        expect(
            getChartTypeLabel(DashboardTileTypes.SQL_CHART, ChartType.CARTESIAN),
        ).toEqual({
            key: 'dashboard.sync_chart_colors_types.sql_chart',
            fallback: '（SQL 图表）',
        });
    });

    it('图表类型未加载时返回 null（不显示标注）', () => {
        expect(
            getChartTypeLabel(DashboardTileTypes.SAVED_CHART, undefined),
        ).toBeNull();
    });
});

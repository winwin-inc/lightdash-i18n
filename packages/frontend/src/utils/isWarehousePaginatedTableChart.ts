import {
    ChartType,
    isTableChartConfig,
    type SavedChart,
} from '@lightdash/common';

export const isWarehousePaginatedTableChart = (chart: SavedChart): boolean => {
    if (chart.chartConfig.type !== ChartType.TABLE) {
        return false;
    }
    if (chart.pivotConfig?.columns && chart.pivotConfig.columns.length > 0) {
        return false;
    }
    const config = chart.chartConfig.config;
    if (isTableChartConfig(config) && config.showSubtotals) {
        return false;
    }
    return true;
};

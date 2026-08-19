import {
    ChartType,
    isTableChartConfig,
    type ChartConfig,
    type SavedChart,
} from '@lightdash/common';
import { DEFAULT_PAGE_SIZE } from '../components/common/Table/constants';

type ChartPivotConfig = SavedChart['pivotConfig'];

export const isWarehousePaginatedTableConfig = (
    chartConfig: ChartConfig,
    pivotConfig: ChartPivotConfig,
): boolean => {
    if (chartConfig.type !== ChartType.TABLE) {
        return false;
    }
    if (pivotConfig?.columns && pivotConfig.columns.length > 0) {
        return false;
    }
    const config = chartConfig.config;
    if (!isTableChartConfig(config) || !config.enablePagination) {
        return false;
    }
    if (config.showSubtotals) {
        return false;
    }
    return true;
};

export const isWarehousePaginatedTableChart = (chart: SavedChart): boolean =>
    isWarehousePaginatedTableConfig(chart.chartConfig, chart.pivotConfig);

export const getTableConfigPageSize = (
    chartConfig: ChartConfig,
    maxLimit: number,
): number => {
    const config = isTableChartConfig(chartConfig.config)
        ? chartConfig.config
        : undefined;
    const requested = config?.pageSize ?? DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(1, requested), Math.max(1, maxLimit));
};

export const getTableChartPageSize = (
    chart: SavedChart,
    maxLimit: number,
): number => getTableConfigPageSize(chart.chartConfig, maxLimit);

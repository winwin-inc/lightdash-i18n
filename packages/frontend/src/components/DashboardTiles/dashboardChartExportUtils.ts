import {
    getCustomLabelsFromTableConfig,
    getItemMap,
    isField,
    isTableChartConfig,
    type Explore,
    type ItemsMap,
    type SavedChart,
} from '@lightdash/common';

export const getChartExportShowTableNames = (
    savedChart: SavedChart,
): boolean =>
    isTableChartConfig(savedChart.chartConfig.config)
        ? (savedChart.chartConfig.config.showTableNames ?? false)
        : false;

export const getChartExportItemsMap = (
    savedChart: SavedChart,
    explore?: Explore,
): ItemsMap | undefined => {
    if (!explore) {
        return undefined;
    }

    return getItemMap(
        explore,
        savedChart.metricQuery.additionalMetrics,
        savedChart.metricQuery.tableCalculations,
        savedChart.metricQuery.customDimensions,
    );
};

export const getChartExportCustomLabels = (
    savedChart: SavedChart,
    itemsMap?: ItemsMap,
): Record<string, string> | undefined => {
    const customLabels = getCustomLabelsFromTableConfig(
        savedChart.chartConfig.config,
    );

    if (!customLabels) {
        return undefined;
    }

    const showTableNames = getChartExportShowTableNames(savedChart);

    if (!showTableNames || !itemsMap) {
        return customLabels;
    }

    return Object.fromEntries(
        Object.entries(customLabels).map(([fieldId, label]) => {
            const item = itemsMap[fieldId];

            if (!isField(item)) {
                return [fieldId, label];
            }

            const tableNamePrefix = `${item.tableLabel} `;

            return [
                fieldId,
                label.startsWith(tableNamePrefix)
                    ? label
                    : `${tableNamePrefix}${label}`,
            ];
        }),
    );
};

import { ChartType } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import { type VisualizationTableConfigProps } from './types';

const VisualizationTableConfig: FC<VisualizationTableConfigProps> = ({
    itemsMap,
    resultsData,
    columnOrder,
    validPivotDimensions,
    pivotTableMaxColumnLimit,
    initialChartConfig,
    onChartConfigChange,
    children,
    savedChartUuid,
    dashboardFilters,
    invalidateCache,
    parameters,
    dashboardSlug,
    dashboardName,
}) => {
    const tableConfig = useTableConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
        columnOrder,
        validPivotDimensions,
        pivotTableMaxColumnLimit,
        savedChartUuid,
        dashboardFilters,
        invalidateCache,
        parameters,
        dashboardSlug,
        dashboardName,
    );

    const { validConfig } = tableConfig;

    useEffect(() => {
        if (!onChartConfigChange || !validConfig) return;

        onChartConfigChange({
            type: ChartType.TABLE,
            config: validConfig,
        });
    }, [validConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        },
    });
};

export default VisualizationTableConfig;

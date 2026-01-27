import { ChartType } from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import { type VisualizationCustomConfigProps } from './types';

const VisualizationCustomConfig: FC<VisualizationCustomConfigProps> = ({
    initialChartConfig,
    resultsData,
    onChartConfigChange,
    children,
}) => {
    const customVisConfig = useCustomVisualizationConfig(
        initialChartConfig,
        resultsData,
    );

    // Only update chartConfig when spec actually changes, not when series data updates
    // This prevents unnecessary updates during pagination
    const prevSpecRef = useRef(customVisConfig?.validConfig.spec);
    useEffect(() => {
        if (!onChartConfigChange || !customVisConfig) return;
        
        const currentSpec = customVisConfig.validConfig.spec;
        // Only call onChartConfigChange if spec actually changed
        // Series data updates should not trigger chartConfig updates
        if (prevSpecRef.current !== currentSpec) {
            prevSpecRef.current = currentSpec;
            onChartConfigChange({
                type: ChartType.CUSTOM,
                config: {
                    spec: currentSpec,
                },
            });
        }
    }, [customVisConfig?.validConfig.spec, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.CUSTOM,
            chartConfig: customVisConfig,
        },
    });
};

export default VisualizationCustomConfig;

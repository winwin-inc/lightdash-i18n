import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { UnitInputsGrid } from '../common/UnitInputsGrid';

export const defaultGrid = {
    containLabel: true,
    left: '5%', // small padding
    right: '5%', // small padding
    top: '70px', // pixels from top (makes room for legend)
    bottom: '30px', // pixels from bottom (makes room for x-axis)
} as const;

export const Grid: FC = () => {
    const { t } = useTranslation();

    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { dirtyEchartsConfig, setGrid } = visualizationConfig.chartConfig;

    const config = {
        ...defaultGrid,
        ...dirtyEchartsConfig?.grid,
    };

    const handleUpdate = (position: string, newValue: string | undefined) => {
        const newState = { ...config, [position]: newValue };
        setGrid(newState);
        return newState;
    };

    return (
        <UnitInputsGrid
            centerLabel={t(
                'components_visualization_configs_chart.grid.margin',
            )}
            config={config}
            defaultConfig={defaultGrid}
            onChange={(position, newValue) => handleUpdate(position, newValue)}
        />
    );
};

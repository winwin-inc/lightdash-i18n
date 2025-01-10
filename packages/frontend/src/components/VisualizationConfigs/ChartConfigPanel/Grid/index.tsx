import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import { defaultGrid } from './constants';

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

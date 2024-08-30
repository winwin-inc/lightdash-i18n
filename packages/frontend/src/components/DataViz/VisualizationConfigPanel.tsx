import { ChartKind, type VizSqlColumn } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Config } from '../VisualizationConfigs/common/Config';
import { themeOverride } from '../VisualizationConfigs/mantineTheme';
import { CartesianChartConfig } from './config/CartesianChartConfiguration';
import { PieChartConfiguration } from './config/PieChartConfiguration';
import TableVisConfiguration from './config/TableVisConfiguration';
import { VisualizationSwitcher } from './VisualizationSwitcher';

export const VisualizationConfigPanel: FC<{
    selectedChartType: ChartKind;
    setSelectedChartType: (chartKind: ChartKind) => void;
    sqlColumns: VizSqlColumn[];
}> = ({ selectedChartType, setSelectedChartType, sqlColumns }) => {
    const { t } = useTranslation();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_visualization_config_panel.chart_type',
                        )}
                    </Config.Heading>
                    <VisualizationSwitcher
                        selectedChartType={selectedChartType}
                        setSelectedChartType={setSelectedChartType}
                    />
                </Config.Section>
            </Config>

            {selectedChartType === ChartKind.TABLE && (
                <TableVisConfiguration sqlColumns={sqlColumns} />
            )}
            {selectedChartType === ChartKind.VERTICAL_BAR && (
                <CartesianChartConfig
                    selectedChartType={selectedChartType}
                    sqlColumns={sqlColumns}
                />
            )}
            {selectedChartType === ChartKind.LINE && (
                <CartesianChartConfig
                    selectedChartType={selectedChartType}
                    sqlColumns={sqlColumns}
                />
            )}
            {selectedChartType === ChartKind.PIE && (
                <PieChartConfiguration sqlColumns={sqlColumns} />
            )}
        </MantineProvider>
    );
};

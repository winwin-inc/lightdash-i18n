import { ChartKind } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { themeOverride } from '../../../components/VisualizationConfigs/mantineTheme';
import { useAppSelector } from '../store/hooks';
import { BarChartConfig } from './BarChartConfiguration';
import { PieChartConfiguration } from './PieChartConfiguration';
import TableVisConfiguration from './TableVisConfiguration';
import { VisualizationSwitcher } from './VisualizationSwitcher';

export const VisualizationConfigPanel: FC = () => {
    const { t } = useTranslation();

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_visualization_config_panel.chart_type',
                        )}
                    </Config.Heading>
                    <VisualizationSwitcher />
                </Config.Section>
            </Config>

            {selectedChartType === ChartKind.TABLE && <TableVisConfiguration />}
            {selectedChartType === ChartKind.VERTICAL_BAR && <BarChartConfig />}
            {selectedChartType === ChartKind.PIE && <PieChartConfiguration />}
        </MantineProvider>
    );
};

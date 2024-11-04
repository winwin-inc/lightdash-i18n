import { ChartKind, type VizColumn } from '@lightdash/common';
import { Stack, Tabs } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { barChartConfigSlice } from '../store/barChartSlice';
import { lineChartConfigSlice } from '../store/lineChartSlice';
import { CartesianChartFieldConfiguration } from './CartesianChartFieldConfiguration';
import { CartesianChartStyling } from './CartesianChartStyling';

export const CartesianChartConfig = ({
    selectedChartType,
    columns,
}: {
    selectedChartType: ChartKind;
    columns: VizColumn[];
}) => {
    const { t } = useTranslation();

    const actions =
        selectedChartType === ChartKind.LINE
            ? lineChartConfigSlice.actions
            : selectedChartType === ChartKind.VERTICAL_BAR
            ? barChartConfigSlice.actions
            : null;

    if (!actions) {
        return null;
    }

    return (
        <Stack spacing="xs" mb="lg">
            <Tabs color="gray" defaultValue="data" keepMounted>
                <Tabs.List>
                    <Tabs.Tab value="data">
                        {t('features_sql_runner_bar_chart_configuration.data')}
                    </Tabs.Tab>
                    <Tabs.Tab value="styling">
                        {' '}
                        {t(
                            'features_sql_runner_bar_chart_configuration.styling',
                        )}
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="data" pt="xs">
                    <CartesianChartFieldConfiguration
                        actions={actions}
                        columns={columns}
                        selectedChartType={selectedChartType}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="styling" pt="xs">
                    <CartesianChartStyling
                        actions={actions}
                        selectedChartType={selectedChartType}
                    />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

import { MantineProvider, Tabs } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { themeOverride } from '../../mantineTheme';
import { Axes } from '../Axes';
import { Grid } from '../Grid';
import { Layout } from '../Layout';
import { Legend } from '../Legend';
import { Series } from '../Series';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation();

    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        {t(
                            'components_visualization_configs_chart.config_tabs.layout',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="series">
                        {t(
                            'components_visualization_configs_chart.config_tabs.series',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="axes">
                        {t(
                            'components_visualization_configs_chart.config_tabs.axes',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="legend">
                        {t(
                            'components_visualization_configs_chart.config_tabs.display',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="grid">
                        {t(
                            'components_visualization_configs_chart.config_tabs.margins',
                        )}
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="layout">
                    <Layout items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="series">
                    <Series items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="axes">
                    <Axes itemsMap={itemsMap} />
                </Tabs.Panel>
                <Tabs.Panel value="legend">
                    <Legend items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="grid">
                    <Grid />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});

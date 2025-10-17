import { MantineProvider, Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { themeOverride } from '../mantineTheme';
import { BarChartDisplay } from './BarChartDisplay';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        {t(
                            'components_visualization_configs_table.config_tabs.general',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="conditional-formatting">
                        {t(
                            'components_visualization_configs_table.config_tabs.conditional_formating',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="bar-chart">
                        {t(
                            'components_visualization_configs_table.config_tabs.bar_display',
                        )}
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <GeneralSettings />
                </Tabs.Panel>
                <Tabs.Panel value="conditional-formatting">
                    <ConditionalFormattingList />
                </Tabs.Panel>
                <Tabs.Panel value="bar-chart">
                    <BarChartDisplay />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});

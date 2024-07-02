import { MantineProvider, Tabs } from '@mantine/core';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { themeOverride } from '../mantineTheme';
import { Comparison } from './BigNumberComparison';
import { Layout } from './BigNumberLayout';

export const ConfigTabs = memo(() => {
    const { t } = useTranslation();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        {t(
                            'components_visualization_configs_big_number.tabs.layout',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="comparison">
                        {t(
                            'components_visualization_configs_big_number.tabs.comparison',
                        )}
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="layout">
                    <Layout />
                </Tabs.Panel>
                <Tabs.Panel value="comparison">
                    <Comparison />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});

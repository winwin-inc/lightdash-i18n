import { MantineProvider, Tabs } from '@mantine/core';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { themeOverride } from '../mantineTheme';
import { Display } from './TreemapDisplayConfig';
import { Layout } from './TreemapLayoutConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        {t('components_visualization_configs_treemap.tabs.layout')}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        {t('components_visualization_configs_treemap.tabs.display')}
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="layout">
                    <Layout />
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <Display />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});

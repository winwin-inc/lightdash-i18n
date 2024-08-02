import {
    ActionIcon,
    Group,
    ScrollArea,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../store/hooks';
import { SidebarTabs } from '../store/sqlRunnerSlice';
import { TablesPanel } from './TablesPanel';
import { VisualizationConfigPanel } from './VisualizationConfigPanel';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
    const { t } = useTranslation();

    const activeSidebarTab = useAppSelector(
        (state) => state.sqlRunner.activeSidebarTab,
    );

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    {activeSidebarTab === SidebarTabs.TABLES
                        ? t('features_sql_runner_sidebar.tables')
                        : t('features_sql_runner_sidebar.visualization')}
                </Title>
                <Tooltip
                    variant="xs"
                    label={t('features_sql_runner_sidebar.close_sidebar')}
                    position="left"
                >
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarLeftCollapse}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Stack
                display={
                    activeSidebarTab === SidebarTabs.TABLES ? 'inherit' : 'none'
                }
                sx={{ flex: 1, overflow: 'hidden' }}
            >
                <TablesPanel />
            </Stack>

            <ScrollArea
                offsetScrollbars
                variant="primary"
                className="only-vertical"
                sx={{
                    flex: 1,
                    display:
                        activeSidebarTab === SidebarTabs.VISUALIZATION
                            ? 'inherit'
                            : 'none',
                }}
            >
                <Stack sx={{ flex: 1, overflow: 'hidden' }}>
                    <VisualizationConfigPanel />
                </Stack>
            </ScrollArea>
        </Stack>
    );
};

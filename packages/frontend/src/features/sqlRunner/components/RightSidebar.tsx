import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    MantineProvider,
    SegmentedControl,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { themeOverride } from '../../../components/VisualizationConfigs/mantineTheme';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedChartType } from '../store/sqlRunnerSlice';
import { BarChartConfig } from './BarChartConfiguration';
import TableVisConfiguration from './TableVisConfiguration';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const RightSidebar: FC<Props> = ({ setSidebarOpen }) => {
    const { t } = useTranslation();

    const dispatch = useAppDispatch();

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Stack h="100vh" spacing="xs">
                <Group position="apart">
                    <Title order={5} fz="sm" c="gray.6">
                        {t('features_sql_runner_right_sidebar.configure')}
                    </Title>
                    <Tooltip
                        variant="xs"
                        label={t(
                            'features_sql_runner_right_sidebar.close_sidebar',
                        )}
                        position="left"
                    >
                        <ActionIcon size="xs">
                            <MantineIcon
                                icon={IconLayoutSidebarRightCollapse}
                                onClick={() => setSidebarOpen(false)}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <SegmentedControl
                    size="xs"
                    value={selectedChartType}
                    onChange={(value: ChartKind) =>
                        dispatch(setSelectedChartType(value))
                    }
                    data={[
                        {
                            value: ChartKind.TABLE,
                            label: t('features_sql_runner_right_sidebar.table'),
                        },
                        {
                            value: ChartKind.VERTICAL_BAR,
                            label: t(
                                'features_sql_runner_right_sidebar.bar_chart',
                            ),
                        },
                    ]}
                />

                {selectedChartType === ChartKind.TABLE && (
                    <TableVisConfiguration />
                )}
                {selectedChartType === ChartKind.VERTICAL_BAR && (
                    <BarChartConfig />
                )}
            </Stack>
        </MantineProvider>
    );
};

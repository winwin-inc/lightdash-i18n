import { Center, Paper, Stack, Text } from '@mantine/core';
import { IconClockCancel } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { BackgroundSvg } from '../../../components/common/BackgroundSvg';
import MantineIcon from '../../../components/common/MantineIcon';
import MetricsVisualizationEmptyStateImage from '../../../svgs/metricsCatalog/metrics-visualization-empty-state.svg?react';

export const MetricsVisualizationEmptyState = () => {
    const { t } = useTranslation();

    return (
        <Paper
            h="100%"
            w="100%"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <BackgroundSvg
                SvgComponent={MetricsVisualizationEmptyStateImage}
                sx={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Center>
                    <Stack spacing="sm" align="center">
                        <Paper p="xs">
                            <MantineIcon icon={IconClockCancel} />
                        </Paper>
                        <Stack spacing={0} align="center" maw={360}>
                            <Text fw={600} fz="md" c="dark.7" ta="center">
                                {t(
                                    'features_metrics_catalog_components.empty_state.unavailable',
                                )}
                            </Text>
                            <Text fz="sm" c="gray.6" ta="center">
                                {t(
                                    'features_metrics_catalog_components.empty_state.content',
                                )}
                            </Text>
                        </Stack>
                    </Stack>
                </Center>
            </BackgroundSvg>
        </Paper>
    );
};

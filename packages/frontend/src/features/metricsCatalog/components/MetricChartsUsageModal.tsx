import {
    Anchor,
    Group,
    List,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconDeviceAnalytics } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricChartAnalytics } from '../hooks/useMetricChartAnalytics';
type Props = ModalProps;

export const MetricChartsUsageModal: FC<Props> = ({ opened, onClose }) => {
    const { t } = useTranslation();

    const { track } = useTracking();
    const activeMetric = useAppSelector(
        (state) => state.metricsCatalog.activeMetric,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { data: analytics, isLoading } = useMetricChartAnalytics({
        projectUuid,
        table: activeMetric?.tableName,
        field: activeMetric?.name,
    });

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconDeviceAnalytics}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>{t('features_metrics.charts.title')}</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md" spacing="xs">
                <Text>{t('features_metrics.charts.content.part_1')}</Text>
                {isLoading ? (
                    <Text size="sm" color="dimmed">
                        {t('features_metrics.charts.content.part_2')}
                    </Text>
                ) : analytics?.charts.length === 0 ? (
                    <Text size="sm" color="dimmed">
                        {t('features_metrics.charts.content.part_3')}
                    </Text>
                ) : (
                    <List pl="sm">
                        {analytics?.charts.map((chart) => (
                            <List.Item key={chart.uuid} fz="sm">
                                <Anchor
                                    href={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                    target="_blank"
                                    onClick={() => {
                                        track({
                                            name: EventName.METRICS_CATALOG_CHART_USAGE_CHART_CLICKED,
                                            properties: {
                                                metricName: activeMetric?.name,
                                                tableName:
                                                    activeMetric?.tableName,
                                                chartId: chart.uuid,
                                            },
                                        });
                                    }}
                                >
                                    {chart.name}
                                </Anchor>
                            </List.Item>
                        ))}
                    </List>
                )}
            </Stack>
        </Modal>
    );
};

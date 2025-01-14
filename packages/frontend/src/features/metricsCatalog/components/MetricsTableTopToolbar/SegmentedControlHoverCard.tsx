import {
    Badge,
    Group,
    HoverCard,
    Stack,
    Text,
    type HoverCardProps,
} from '@mantine/core';
import { useMemo, type FC, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

type SegmentedControlHoverCardProps = PropsWithChildren<HoverCardProps> & {
    totalMetricsCount: number;
    isValidMetricsNodeCount: boolean;
    isValidMetricsEdgeCount: boolean;
};

const SegmentedControlHoverCard: FC<SegmentedControlHoverCardProps> = ({
    children,
    totalMetricsCount,
    isValidMetricsNodeCount,
    isValidMetricsEdgeCount,
    ...props
}) => {
    const { t } = useTranslation();

    const segmentedControlTooltipLabel = useMemo(() => {
        if (totalMetricsCount === 0) {
            return (
                <Text size="xs" c="white">
                    {t(
                        'features_metrics_segmented_contro_hover_card.no_metrics',
                    )}
                </Text>
            );
        }

        if (!isValidMetricsNodeCount) {
            return (
                <Text size="xs" c="white">
                    {t(
                        'features_metrics_segmented_contro_hover_card.canvas_mode.part_1',
                    )}{' '}
                    <Text span fw="bold">
                        {t(
                            'features_metrics_segmented_contro_hover_card.canvas_mode.part_2',
                        )}
                    </Text>
                    .{' '}
                    {t(
                        'features_metrics_segmented_contro_hover_card.canvas_mode.part_3',
                    )}{' '}
                    <Text span fw="bold">
                        {t(
                            'features_metrics_segmented_contro_hover_card.canvas_mode.part_4',
                        )}
                    </Text>{' '}
                    {t(
                        'features_metrics_segmented_contro_hover_card.canvas_mode.part_5',
                    )}
                </Text>
            );
        }

        if (!isValidMetricsEdgeCount) {
            return (
                <Text size="xs" c="white">
                    {t(
                        'features_metrics_segmented_contro_hover_card.no_connections',
                    )}
                </Text>
            );
        }

        return null;
    }, [
        isValidMetricsEdgeCount,
        isValidMetricsNodeCount,
        totalMetricsCount,
        t,
    ]);

    return (
        <HoverCard
            {...props}
            styles={{
                arrow: { border: 'none' },
            }}
            shadow="heavy"
        >
            <HoverCard.Target>{children}</HoverCard.Target>
            <HoverCard.Dropdown bg="#0A0D12" maw={260}>
                <Stack spacing="sm" w="100%">
                    <Group spacing="xs">
                        <Text fw={600} size={14} c="white">
                            {t(
                                'features_metrics_segmented_contro_hover_card.canvas_mode_title',
                            )}
                        </Text>
                        <Badge
                            variant="filled"
                            bg="indigo.0"
                            c="indigo.5"
                            radius={6}
                            size="md"
                            py="xxs"
                            px="xs"
                        >
                            {t(
                                'features_metrics_segmented_contro_hover_card.alpha',
                            )}
                        </Badge>
                    </Group>
                    <Text size="xs" c="white">
                        {t(
                            'features_metrics_segmented_contro_hover_card.define',
                        )}
                    </Text>
                    {segmentedControlTooltipLabel}
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default SegmentedControlHoverCard;

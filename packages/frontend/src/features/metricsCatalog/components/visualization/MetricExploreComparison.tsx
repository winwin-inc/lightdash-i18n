import {
    assertUnreachable,
    getItemId,
    MetricExplorerComparison,
    type MetricExplorerQuery,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import {
    Anchor,
    Group,
    Loader,
    Paper,
    Radio,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCalendar, IconStack } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';
import SelectItem from '../SelectItem';

type Props = {
    baseMetricLabel: string | undefined;
    query: MetricExplorerQuery;
    onQueryChange: (query: MetricExplorerQuery) => void;
    metricsWithTimeDimensionsQuery: UseQueryResult<
        MetricWithAssociatedTimeDimension[],
        unknown
    >;
};

export const MetricExploreComparison: FC<Props> = ({
    baseMetricLabel,
    query,
    onQueryChange,
    metricsWithTimeDimensionsQuery,
}) => {
    const { t } = useTranslation();
    const { classes } = useSelectStyles();

    const handleComparisonChange = useCallback(
        (newComparison: MetricExplorerComparison) => {
            switch (newComparison) {
                case MetricExplorerComparison.NONE:
                    return onQueryChange({
                        comparison: newComparison,
                        segmentDimension: null,
                    });
                case MetricExplorerComparison.DIFFERENT_METRIC:
                    return onQueryChange({
                        comparison: newComparison,
                        metric: {
                            table: '',
                            name: '',
                            label: '',
                        },
                    });
                case MetricExplorerComparison.PREVIOUS_PERIOD:
                    return onQueryChange({
                        comparison: newComparison,
                    });
                default:
                    return assertUnreachable(
                        newComparison,
                        `Unsupported comparison type: ${newComparison}`,
                    );
            }
        },
        [onQueryChange],
    );

    const handleMetricChange = useCallback(
        (metricId: string | null) => {
            if (!metricsWithTimeDimensionsQuery.isSuccess) return;

            const metric = metricId
                ? metricsWithTimeDimensionsQuery.data.find(
                      (m) => getItemId(m) === metricId,
                  )
                : null;

            onQueryChange({
                comparison: MetricExplorerComparison.DIFFERENT_METRIC,
                metric: {
                    table: metric?.table ?? '',
                    name: metric?.name ?? '',
                    label: metric?.label ?? '',
                },
            });
        },
        [
            metricsWithTimeDimensionsQuery.data,
            metricsWithTimeDimensionsQuery.isSuccess,
            onQueryChange,
        ],
    );

    return (
        <Radio.Group value={query.comparison} onChange={handleComparisonChange}>
            <Stack spacing="sm">
                {[
                    {
                        type: MetricExplorerComparison.PREVIOUS_PERIOD,
                        icon: IconCalendar,
                        label: t(
                            'features_metrics_catalog_components.metric_peek_comparison.compare_previous.label',
                        ),
                        tooltipLabel: t(
                            'features_metrics_catalog_components.metric_peek_comparison.compare_previous.tooltip',
                        ),
                    },
                    {
                        type: MetricExplorerComparison.DIFFERENT_METRIC,
                        icon: IconStack,
                        label: t(
                            'features_metrics_catalog_components.metric_peek_comparison.compare_another.label',
                        ),
                        tooltipLabel: t(
                            'features_metrics_catalog_components.metric_peek_comparison.compare_another.tooltip',
                            {
                                baseMetricLabel,
                            },
                        ),
                    },
                ].map((comparison) => (
                    <Tooltip
                        key={comparison.type}
                        label={comparison.tooltipLabel}
                        variant="xs"
                        position="right"
                        withinPortal
                    >
                        <Paper
                            p="sm"
                            sx={(theme) => ({
                                cursor: 'pointer',
                                transition: `all ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                '&[data-with-border="true"]': {
                                    border:
                                        query.comparison === comparison.type
                                            ? `1px solid ${theme.colors.indigo[5]}`
                                            : `1px solid ${theme.colors.gray[2]}`,
                                },
                                '&:hover': {
                                    backgroundColor: theme.colors.gray[0],
                                },
                                backgroundColor:
                                    query.comparison === comparison.type
                                        ? theme.fn.lighten(
                                              theme.colors.gray[1],
                                              0.3,
                                          )
                                        : 'white',
                            })}
                            onClick={() =>
                                handleComparisonChange(comparison.type)
                            }
                        >
                            <Stack>
                                <Group align="center" noWrap position="apart">
                                    <Group noWrap>
                                        <Paper p="xs">
                                            <MantineIcon
                                                icon={comparison.icon}
                                            />
                                        </Paper>

                                        <Text color="dark.8" fw={500}>
                                            {comparison.label}
                                        </Text>
                                    </Group>
                                    <Radio
                                        value={comparison.type}
                                        size="xs"
                                        color="indigo"
                                    />
                                </Group>

                                {comparison.type ===
                                    MetricExplorerComparison.DIFFERENT_METRIC &&
                                    query.comparison ===
                                        MetricExplorerComparison.DIFFERENT_METRIC &&
                                    (metricsWithTimeDimensionsQuery.isLoading ||
                                    (metricsWithTimeDimensionsQuery.isSuccess &&
                                        metricsWithTimeDimensionsQuery.data
                                            .length > 0) ? (
                                        <Select
                                            placeholder={t(
                                                'features_metrics_catalog_components.metric_peek_comparison.select',
                                            )}
                                            searchable
                                            radius="md"
                                            size="xs"
                                            data={
                                                metricsWithTimeDimensionsQuery.data?.map(
                                                    (metric) => ({
                                                        value: getItemId(
                                                            metric,
                                                        ),
                                                        label: metric.label,
                                                        group: metric.tableLabel,
                                                    }),
                                                ) ?? []
                                            }
                                            value={getItemId(query.metric)}
                                            onChange={handleMetricChange}
                                            itemComponent={SelectItem}
                                            // this does not work as expected in Mantine 6
                                            data-disabled={
                                                !metricsWithTimeDimensionsQuery.isSuccess
                                            }
                                            rightSection={
                                                metricsWithTimeDimensionsQuery.isLoading ? (
                                                    <Loader
                                                        size="xs"
                                                        color="gray.5"
                                                    />
                                                ) : undefined
                                            }
                                            classNames={{
                                                input: classes.input,
                                                item: classes.item,
                                                rightSection:
                                                    classes.rightSection,
                                                dropdown: classes.dropdown,
                                            }}
                                        />
                                    ) : (
                                        <Text span c="gray.7" fz={13}>
                                            {t(
                                                'features_metrics_catalog_components.metric_peek_comparison.content.part_1',
                                            )}{' '}
                                            <Anchor
                                                c="gray.9"
                                                fw={500}
                                                target="_blank"
                                                href="https://docs.lightdash.com/guides/metrics-catalog/#configuring-default-time-settings-in-yml"
                                            >
                                                {t(
                                                    'features_metrics_catalog_components.metric_peek_comparison.content.part_2',
                                                )}
                                            </Anchor>
                                        </Text>
                                    ))}
                            </Stack>
                        </Paper>
                    </Tooltip>
                ))}
            </Stack>
        </Radio.Group>
    );
};

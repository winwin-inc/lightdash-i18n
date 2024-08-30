import { VizIndexType, type ChartKind } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { Config } from '../../VisualizationConfigs/common/Config';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../store';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';
import { CartesianChartSeries } from './CartesianChartSeries';

export const CartesianChartStyling = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: CartesianChartActionsType;
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const series = useVizSelector((state) => {
        if (
            !state.barChartConfig.config?.fieldConfig?.y ||
            state.barChartConfig.config.fieldConfig.y.length <= 1
        ) {
            return [];
        }
        return state.barChartConfig.config.fieldConfig.y.map((f) => {
            const format =
                state.barChartConfig.config?.display?.series?.[f.reference]
                    ?.format;
            return {
                reference: f.reference,
                format,
            };
        });
    });

    const xAxisLabel = useMemo(() => {
        return (
            currentConfig?.config?.display?.xAxis?.label ??
            currentConfig?.config?.fieldConfig?.x?.reference
        );
    }, [currentConfig]);
    const yAxisLabel = useMemo(() => {
        return (
            currentConfig?.config?.display?.yAxis?.[0]?.label ??
            currentConfig?.config?.fieldConfig?.y?.[0]?.reference
        );
    }, [currentConfig]);
    const yAxisPosition = currentConfig?.config?.display?.yAxis?.[0]?.position;

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Group>
                    <Config.Label>
                        {t('features_sql_runner_bar_chart_styling.stacking')}
                    </Config.Label>
                    <SegmentedControl
                        radius="md"
                        disabled={!currentConfig?.config?.fieldConfig?.groupBy}
                        data={[
                            {
                                value: 'None',
                                label: t(
                                    'features_sql_runner_bar_chart_styling.none',
                                ),
                            },
                            {
                                value: 'Stacked',
                                label: t(
                                    'features_sql_runner_bar_chart_styling.stack',
                                ),
                            },
                        ]}
                        defaultValue={
                            currentConfig?.config?.display?.stack
                                ? 'Stacked'
                                : 'None'
                        }
                        onChange={(value) =>
                            dispatch(actions.setStacked(value === 'Stacked'))
                        }
                    />
                </Config.Group>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_bar_chart_styling.x_axis_label',
                        )}
                    </Config.Heading>

                    <TextInput
                        value={xAxisLabel}
                        radius="md"
                        onChange={(e) =>
                            dispatch(
                                actions.setXAxisLabel({
                                    label: e.target.value,
                                    type: VizIndexType.CATEGORY,
                                }),
                            )
                        }
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t('features_sql_runner_bar_chart_styling.y_axis')}
                    </Config.Heading>
                    <Config.Group>
                        <Config.Label>
                            {t('features_sql_runner_bar_chart_styling.label')}
                        </Config.Label>
                        <TextInput
                            value={yAxisLabel}
                            radius="md"
                            onChange={(e) =>
                                dispatch(
                                    actions.setYAxisLabel({
                                        index: 0,
                                        label: e.target.value,
                                    }),
                                )
                            }
                        />
                    </Config.Group>
                    {series.length < 1 && (
                        <Config.Group>
                            <Config.Label>
                                {t(
                                    'features_sql_runner_bar_chart_styling.format',
                                )}
                            </Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.config?.display?.yAxis?.[0]
                                        ?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    )}

                    <Config.Group>
                        <Config.Label>
                            {t(
                                'features_sql_runner_bar_chart_styling.position',
                            )}
                        </Config.Label>
                        <SegmentedControl
                            radius="md"
                            data={[
                                {
                                    value: 'left',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <MantineIcon icon={IconAlignLeft} />
                                            <Text>
                                                {t(
                                                    'features_sql_runner_bar_chart_styling.left',
                                                )}
                                            </Text>
                                        </Group>
                                    ),
                                },
                                {
                                    value: 'right',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <Text>
                                                {t(
                                                    'features_sql_runner_bar_chart_styling.right',
                                                )}
                                            </Text>
                                            <MantineIcon
                                                icon={IconAlignRight}
                                            />
                                        </Group>
                                    ),
                                },
                            ]}
                            value={yAxisPosition}
                            onChange={(value) =>
                                dispatch(
                                    actions.setYAxisPosition({
                                        index: 0,
                                        position: value || undefined,
                                    }),
                                )
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>
            <CartesianChartSeries
                selectedChartType={selectedChartType}
                actions={actions}
            />
        </Stack>
    );
};

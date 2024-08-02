import { XLayoutType } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import {
    setXAxisLabel,
    setYAxisLabel,
    setYAxisPosition,
} from '../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const DEBOUNCE_TIME = 500;

export const BarChartStyling = () => {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();

    const xAxisLabel = useAppSelector(
        (state) =>
            state.barChartConfig.config?.display?.xAxis?.label ??
            state.barChartConfig.config?.fieldConfig?.x?.reference,
    );

    const yAxisLabel = useAppSelector(
        (state) =>
            state.barChartConfig.config?.display?.yAxis?.[0]?.label ??
            state.barChartConfig.config?.fieldConfig?.y?.[0]?.reference,
    );
    const yAxisPosition = useAppSelector(
        (state) => state.barChartConfig.config?.display?.yAxis?.[0]?.position,
    );
    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(setXAxisLabel({ label, type: XLayoutType.CATEGORY }));
    }, DEBOUNCE_TIME);

    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(setYAxisLabel({ index: 0, label }));
    }, DEBOUNCE_TIME);

    const onYAxisPositionChange = debounce((position: string | undefined) => {
        dispatch(setYAxisPosition({ index: 0, position }));
    }, DEBOUNCE_TIME);

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_bar_chart_styling.x_axis_label',
                        )}
                    </Config.Heading>

                    <TextInput
                        defaultValue={xAxisLabel}
                        radius="md"
                        onChange={(e) => onXAxisLabelChange(e.target.value)}
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_bar_chart_styling.y_axis_label',
                        )}
                    </Config.Heading>
                    <TextInput
                        defaultValue={yAxisLabel}
                        radius="md"
                        onChange={(e) => onYAxisLabelChange(e.target.value)}
                    />
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
                            defaultValue={yAxisPosition}
                            onChange={(value) =>
                                onYAxisPositionChange(value || undefined)
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>
        </Stack>
    );
};

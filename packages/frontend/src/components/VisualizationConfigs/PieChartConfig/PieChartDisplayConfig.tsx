import {
    PieChartLegendLabelMaxLengthDefault,
    PieChartLegendPositions,
    type PieChartLegendPosition,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { isPieVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Display: React.FC = () => {
    const { t } = useTranslation();
    const { visualizationConfig } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const {
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
        legendMaxItemLength,
        legendMaxItemLengthChange,
    } = visualizationConfig.chartConfig;

    const chartLegendAlias = {
        horizontal: t(
            'components_visualization_configs_chart_pie.display_config.horizontal',
        ),
        vertical: t(
            'components_visualization_configs_chart_pie.display_config.vertical',
        ),
    } as const;

    return (
        <Stack>
            <Config>
                <Group>
                    <Config.Heading>
                        {t(
                            'components_visualization_configs_chart_pie.display_config.show_legend',
                        )}
                    </Config.Heading>
                    <Switch checked={showLegend} onChange={toggleShowLegend} />
                </Group>
            </Config>

            <Collapse in={showLegend}>
                <Stack spacing="xs">
                    <Group spacing="xs">
                        <Config.Label>
                            {t(
                                'components_visualization_configs_chart_pie.display_config.orientation',
                            )}
                        </Config.Label>
                        <SegmentedControl
                            name="orient"
                            value={legendPosition}
                            onChange={(val: PieChartLegendPosition) =>
                                legendPositionChange(val)
                            }
                            data={Object.entries(PieChartLegendPositions).map(
                                ([position]) => ({
                                    label: chartLegendAlias[
                                        position as PieChartLegendPosition
                                    ],
                                    value: position,
                                }),
                            )}
                        />
                    </Group>
                    <Group>
                        <Config.Label>
                            {t(
                                'components_visualization_configs_chart_pie.display_config.label_max_length',
                            )}
                        </Config.Label>
                        <TextInput
                            type="number"
                            value={legendMaxItemLength}
                            placeholder={PieChartLegendLabelMaxLengthDefault.toString()}
                            onChange={(e) => {
                                const parsedNumber = Number.parseInt(
                                    e.target.value,
                                    10,
                                );
                                legendMaxItemLengthChange(
                                    !Number.isNaN(parsedNumber)
                                        ? parsedNumber
                                        : undefined,
                                );
                            }}
                        />
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
};

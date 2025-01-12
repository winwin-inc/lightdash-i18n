import {
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getItemId,
    isField,
    isTableCalculation,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Checkbox,
    Collapse,
    Group,
    MantineProvider,
    SegmentedControl,
    Stack,
    Switch,
    Tabs,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FieldSelect from '../../common/FieldSelect';
import { isFunnelVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { themeOverride } from '../mantineTheme';
import { StepConfig } from './StepConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation();

    const { visualizationConfig } = useVisualizationContext();

    if (!isFunnelVisualizationConfig(visualizationConfig)) return null;

    const numericFields = Object.values(visualizationConfig.numericFields);
    // TODO: dimensions should be selectable for labels
    // const dimensions = Object.values(visualizationConfig.dimensions);

    const {
        selectedField,
        onFieldChange,
        dataInput,
        setDataInput,
        labels,
        onLabelsChange,
        labelOverrides,
        onLabelOverridesChange,
        colorDefaults,
        colorOverrides,
        onColorOverridesChange,
        data,
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
    } = visualizationConfig.chartConfig;

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        {t(
                            'components_visualization_configs_chart_funnel.general',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="steps">
                        {t(
                            'components_visualization_configs_chart_funnel.steps',
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        {t(
                            'components_visualization_configs_chart_funnel.display',
                        )}
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>
                                    {t(
                                        'components_visualization_configs_chart_funnel.data_orientation',
                                    )}
                                </Config.Heading>
                                <Group spacing="xs">
                                    <Config.Label>
                                        {t(
                                            'components_visualization_configs_chart_funnel.steps_are',
                                        )}
                                    </Config.Label>
                                    <SegmentedControl
                                        value={dataInput}
                                        data={[
                                            {
                                                value: FunnelChartDataInput.COLUMN,
                                                label: t(
                                                    'components_visualization_configs_chart_funnel.rows',
                                                ),
                                            },
                                            {
                                                value: FunnelChartDataInput.ROW,
                                                label: t(
                                                    'components_visualization_configs_chart_funnel.columns',
                                                ),
                                            },
                                        ]}
                                        onChange={(value) =>
                                            setDataInput(
                                                value ===
                                                    FunnelChartDataInput.ROW
                                                    ? FunnelChartDataInput.ROW
                                                    : FunnelChartDataInput.COLUMN,
                                            )
                                        }
                                    />
                                </Group>
                            </Config.Section>
                        </Config>
                        <Config>
                            {dataInput === FunnelChartDataInput.COLUMN && (
                                <Config.Section>
                                    <Config.Heading>
                                        {t(
                                            'components_visualization_configs_chart_funnel.data_field',
                                        )}
                                    </Config.Heading>

                                    <Tooltip
                                        variant="xs"
                                        disabled={
                                            numericFields &&
                                            numericFields.length > 0
                                        }
                                        label={t(
                                            'components_visualization_configs_chart_funnel.select_numeric_metric',
                                        )}
                                    >
                                        <Box>
                                            <FieldSelect<
                                                Metric | TableCalculation
                                            >
                                                placeholder={t(
                                                    'components_visualization_configs_chart_funnel.select_metric',
                                                )}
                                                disabled={
                                                    numericFields.length === 0
                                                }
                                                item={selectedField}
                                                items={numericFields}
                                                onChange={(newField) => {
                                                    if (
                                                        newField &&
                                                        isField(newField)
                                                    )
                                                        onFieldChange(
                                                            getItemId(newField),
                                                        );
                                                    else if (
                                                        newField &&
                                                        isTableCalculation(
                                                            newField,
                                                        )
                                                    )
                                                        onFieldChange(
                                                            newField.name,
                                                        );
                                                    else onFieldChange(null);
                                                }}
                                                hasGrouping
                                            />
                                        </Box>
                                    </Tooltip>
                                </Config.Section>
                            )}
                        </Config>
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="steps">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>
                                    {t(
                                        'components_visualization_configs_chart_funnel.labels',
                                    )}
                                </Config.Heading>

                                <Group spacing="xs" noWrap>
                                    <Config.Label>
                                        {t(
                                            'components_visualization_configs_chart_funnel.position',
                                        )}
                                    </Config.Label>
                                    <SegmentedControl
                                        value={labels?.position}
                                        data={[
                                            {
                                                value: FunnelChartLabelPosition.LEFT,
                                                label: t(
                                                    'components_visualization_configs_chart_funnel.left',
                                                ),
                                            },

                                            {
                                                value: FunnelChartLabelPosition.INSIDE,
                                                label: t(
                                                    'components_visualization_configs_chart_funnel.inside',
                                                ),
                                            },
                                            {
                                                value: FunnelChartLabelPosition.RIGHT,
                                                label: t(
                                                    'components_visualization_configs_chart_funnel.right',
                                                ),
                                            },
                                            {
                                                value: FunnelChartLabelPosition.HIDDEN,
                                                label: 'Hidden',
                                            },
                                        ]}
                                        onChange={(
                                            newPosition: FunnelChartLabelPosition,
                                        ) =>
                                            onLabelsChange({
                                                position: newPosition,
                                            })
                                        }
                                    />
                                </Group>

                                <Group spacing="xs">
                                    <Checkbox
                                        checked={labels?.showValue}
                                        onChange={(newValue) =>
                                            onLabelsChange({
                                                showValue:
                                                    newValue.currentTarget
                                                        .checked,
                                            })
                                        }
                                        label={t(
                                            'components_visualization_configs_chart_funnel.show_value',
                                        )}
                                    />

                                    <Checkbox
                                        checked={labels?.showPercentage}
                                        onChange={(newValue) =>
                                            onLabelsChange({
                                                showPercentage:
                                                    newValue.currentTarget
                                                        .checked,
                                            })
                                        }
                                        label={t(
                                            'components_visualization_configs_chart_funnel.show_percentage',
                                        )}
                                    />
                                </Group>
                            </Config.Section>
                        </Config>
                        <Config>
                            <Config.Section>
                                <Config.Heading>
                                    {t(
                                        'components_visualization_configs_chart_funnel.steps',
                                    )}
                                </Config.Heading>
                                {data
                                    .sort((a, b) => b.value - a.value)
                                    .map((step) => {
                                        return (
                                            <StepConfig
                                                key={step.name}
                                                defaultColor={
                                                    colorDefaults[step.name]
                                                }
                                                defaultLabel={step.name}
                                                swatches={[]}
                                                color={
                                                    colorOverrides[step.name]
                                                }
                                                label={
                                                    labelOverrides[step.name]
                                                }
                                                onColorChange={
                                                    onColorOverridesChange
                                                }
                                                onLabelChange={
                                                    onLabelOverridesChange
                                                }
                                            />
                                        );
                                    })}
                            </Config.Section>
                        </Config>
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="display">
                    <Stack>
                        <Config>
                            <Group>
                                <Config.Heading>
                                    {t(
                                        'components_visualization_configs_chart_funnel.show_legend',
                                    )}
                                </Config.Heading>
                                <Switch
                                    checked={showLegend}
                                    onChange={toggleShowLegend}
                                />
                            </Group>
                        </Config>

                        <Collapse in={showLegend}>
                            <Group spacing="xs">
                                <Config.Label>
                                    {t(
                                        'components_visualization_configs_chart_funnel.orientation',
                                    )}
                                </Config.Label>
                                <SegmentedControl
                                    name="orient"
                                    value={legendPosition}
                                    onChange={(
                                        val: FunnelChartLegendPosition,
                                    ) => legendPositionChange(val)}
                                    data={[
                                        {
                                            value: FunnelChartLegendPosition.HORIZONTAL,
                                            label: t(
                                                'components_visualization_configs_chart_funnel.horizontal',
                                            ),
                                        },
                                        {
                                            value: FunnelChartLegendPosition.VERTICAL,
                                            label: t(
                                                'components_visualization_configs_chart_funnel.vertical',
                                            ),
                                        },
                                    ]}
                                />
                            </Group>
                        </Collapse>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});

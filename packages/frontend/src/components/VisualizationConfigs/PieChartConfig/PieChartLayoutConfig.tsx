import {
    getItemId,
    isCustomDimension,
    isDimension,
    isField,
    isTableCalculation,
    type CustomDimension,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Group, SegmentedControl, Stack, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import FieldSelect from '../../common/FieldSelect';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';

export const Layout: React.FC = () => {
    const { t } = useTranslation();
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const numericMetrics = Object.values(visualizationConfig.numericMetrics);
    const dimensions = Object.values(visualizationConfig.dimensions);

    const {
        groupFieldIds,
        groupAdd,
        groupChange,
        groupRemove,

        selectedMetric,
        metricChange,

        isDonut,
        toggleDonut,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>
                            {t(
                                'components_visualization_configs_chart_pie.layout_config.groups',
                            )}
                        </Config.Heading>
                        <Tooltip
                            variant="xs"
                            disabled={
                                !(
                                    dimensions.length === 0 ||
                                    groupFieldIds.length === dimensions.length
                                )
                            }
                            label={
                                dimensions.length === 0
                                    ? t(
                                          'components_visualization_configs_chart_pie.layout_config.tooltip.least_one',
                                      )
                                    : dimensions.length === groupFieldIds.length
                                    ? t(
                                          'components_visualization_configs_chart_pie.layout_config.tooltip.add_more',
                                      )
                                    : undefined
                            }
                            withinPortal
                        >
                            <AddButton
                                onClick={groupAdd}
                                disabled={
                                    dimensions.length === 0 ||
                                    groupFieldIds.length === dimensions.length
                                }
                            />
                        </Tooltip>
                    </Config.Group>

                    {groupFieldIds.map((dimensionId, index) => {
                        if (!itemsMap || !dimensionId) return null;

                        const dimension = itemsMap[dimensionId];

                        const selectedDimension =
                            isDimension(dimension) ||
                            isCustomDimension(dimension)
                                ? dimension
                                : undefined;
                        return (
                            <FieldSelect<CustomDimension | Dimension>
                                key={index}
                                disabled={dimensions.length === 0}
                                clearable={index !== 0}
                                placeholder={t(
                                    'components_visualization_configs_chart_pie.layout_config.select_dimension',
                                )}
                                item={selectedDimension}
                                items={dimensions}
                                inactiveItemIds={groupFieldIds
                                    .filter((id): id is string => !!id)
                                    .filter((id) => id !== dimensionId)}
                                onChange={(newField) => {
                                    if (!dimensionId) return;

                                    if (newField) {
                                        const newFieldId = getItemId(newField);
                                        if (newFieldId !== dimensionId) {
                                            groupChange(
                                                dimensionId,
                                                newFieldId,
                                            );
                                        }
                                    } else {
                                        groupRemove(dimensionId);
                                    }
                                }}
                                hasGrouping
                            />
                        );
                    })}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'components_visualization_configs_chart_pie.layout_config.metric',
                        )}
                    </Config.Heading>

                    <Tooltip
                        variant="xs"
                        disabled={numericMetrics && numericMetrics.length > 0}
                        label={t(
                            'components_visualization_configs_chart_pie.layout_config.tooltip_metric.least_one',
                        )}
                    >
                        <Box>
                            <FieldSelect<Metric | TableCalculation>
                                placeholder={t(
                                    'components_visualization_configs_chart_pie.layout_config.select_metric',
                                )}
                                disabled={numericMetrics.length === 0}
                                item={selectedMetric}
                                items={numericMetrics}
                                onChange={(newField) => {
                                    if (newField && isField(newField))
                                        metricChange(getItemId(newField));
                                    else if (
                                        newField &&
                                        isTableCalculation(newField)
                                    )
                                        metricChange(newField.name);
                                    else metricChange(null);
                                }}
                                hasGrouping
                            />
                        </Box>
                    </Tooltip>
                </Config.Section>
            </Config>

            <Group spacing="xs">
                <Config.Label>
                    {t(
                        'components_visualization_configs_chart_pie.layout_config.display_as',
                    )}
                </Config.Label>
                <SegmentedControl
                    value={isDonut ? 'donut' : 'pie'}
                    data={[
                        {
                            value: 'pie',
                            label: t(
                                'components_visualization_configs_chart_pie.layout_config.pie',
                            ),
                        },
                        {
                            value: 'donut',
                            label: t(
                                'components_visualization_configs_chart_pie.layout_config.donut',
                            ),
                        },
                    ]}
                    onChange={() => toggleDonut()}
                />
            </Group>
        </Stack>
    );
};

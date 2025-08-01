import { Group, NumberInput, Stack, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { isTreemapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Display: React.FC = () => {
    const { t } = useTranslation();

    const { visualizationConfig } = useVisualizationContext();

    if (!isTreemapVisualizationConfig(visualizationConfig)) return null;

    const { visibleMin, setVisibleMin, leafDepth, setLeafDepth } =
        visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Stack spacing="xs">
                    <Group spacing="xs">
                        <Config.Heading>{t('components_visualization_configs_treemap.display_config.minimum_section_size.label')}</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label={t('components_visualization_configs_treemap.display_config.minimum_section_size.tooltip')}
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                        <NumberInput
                            value={visibleMin}
                            onChange={setVisibleMin}
                            min={0}
                            step={500}
                            formatter={(value) =>
                                value ? `${value}px\u00B2` : ''
                            }
                            parser={(value) =>
                                value.replace(/px\u00B2\s?$/, '')
                            }
                        />
                    </Group>
                    <Group spacing="xs">
                        <Config.Heading>{t('components_visualization_configs_treemap.display_config.max_leaf_depth.label')}</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label={t('components_visualization_configs_treemap.display_config.max_leaf_depth.tooltip')}
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                        <NumberInput
                            value={leafDepth}
                            onChange={setLeafDepth}
                            min={1}
                            placeholder={t('components_visualization_configs_treemap.display_config.max_leaf_depth.no_limit')}
                        />
                    </Group>
                </Stack>
            </Config>
        </Stack>
    );
};

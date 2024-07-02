import {
    type CompiledDimension,
    type CustomDimension,
    type EchartsLegend,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
} from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useToggle } from 'react-use';

import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Config } from '../../common/Config';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import { ReferenceLines } from './ReferenceLines';

enum Positions {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom',
}

type MarginConfigurationProps = {
    legendConfig: EchartsLegend;
    handleChange: (prop: string, newValue: string | undefined) => void;
};

const PositionConfiguration: FC<MarginConfigurationProps> = ({
    legendConfig,
    handleChange,
}) => {
    const { t } = useTranslation();

    const hasPositionConfigChanged = (
        config: MarginConfigurationProps['legendConfig'],
    ) => {
        const positionValues = Object.values(Positions);

        return Object.keys(config).some((key) =>
            positionValues.includes(key as Positions),
        );
    };

    const [isAutoPosition, toggleAuto] = useToggle(
        !hasPositionConfigChanged(legendConfig),
    );

    const defaultConfig = {
        top: 'auto',
        left: 'auto',
        right: 'auto',
        bottom: 'auto',
    };

    return (
        <Config>
            <Config.Section>
                <Switch
                    labelPosition="left"
                    label={t(
                        'components_visualization_configs_chart.legend.custom_position',
                    )}
                    checked={!isAutoPosition}
                    onChange={toggleAuto}
                    styles={{
                        label: {
                            paddingLeft: 0,
                        },
                    }}
                />

                {!isAutoPosition && (
                    <UnitInputsGrid
                        centerLabel={t(
                            'components_visualization_configs_chart.legend.position',
                        )}
                        config={legendConfig}
                        onChange={(position, newValue) =>
                            handleChange(position, newValue)
                        }
                        defaultConfig={defaultConfig}
                    />
                )}
            </Config.Section>
        </Config>
    );
};

type Props = {
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
};

export const Legend: FC<Props> = ({ items }) => {
    const { t } = useTranslation();

    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { dirtyEchartsConfig, setLegend } = visualizationConfig.chartConfig;

    const legendConfig = dirtyEchartsConfig?.legend ?? {};

    const handleChange = (
        prop: string,
        newValue: string | boolean | undefined,
    ) => {
        const newState = { ...legendConfig, [prop]: newValue };
        setLegend(newState);
        return newState;
    };

    const showDefault = (dirtyEchartsConfig?.series || []).length > 1;
    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group spacing="xs" align="center">
                        <Config.Heading>
                            {t(
                                'components_visualization_configs_chart.legend.lengend',
                            )}
                        </Config.Heading>
                        <Switch
                            checked={legendConfig.show ?? showDefault}
                            onChange={(e) =>
                                handleChange('show', e.currentTarget.checked)
                            }
                        />
                    </Group>

                    <Collapse in={legendConfig.show ?? showDefault}>
                        <Stack spacing="xs">
                            <Group spacing="xs">
                                <Config.Label>
                                    {t(
                                        'components_visualization_configs_chart.legend.scroll_behavior',
                                    )}
                                </Config.Label>
                                <SegmentedControl
                                    value={dirtyEchartsConfig?.legend?.type}
                                    data={[
                                        {
                                            label: t(
                                                'components_visualization_configs_chart.legend.default',
                                            ),
                                            value: 'plain',
                                        },
                                        {
                                            label: t(
                                                'components_visualization_configs_chart.legend.scroll',
                                            ),
                                            value: 'scroll',
                                        },
                                    ]}
                                    onChange={(value) =>
                                        handleChange('type', value)
                                    }
                                />
                            </Group>
                            <Group spacing="xs">
                                <Config.Label>
                                    {t(
                                        'components_visualization_configs_chart.legend.orientation',
                                    )}
                                </Config.Label>
                                <SegmentedControl
                                    name="orient"
                                    value={legendConfig.orient ?? 'horizontal'}
                                    onChange={(val) =>
                                        handleChange('orient', val)
                                    }
                                    data={[
                                        {
                                            label: t(
                                                'components_visualization_configs_chart.legend.horizontal',
                                            ),
                                            value: 'horizontal',
                                        },
                                        {
                                            label: t(
                                                'components_visualization_configs_chart.legend.vertical',
                                            ),
                                            value: 'vertical',
                                        },
                                    ]}
                                />
                            </Group>
                            <PositionConfiguration
                                legendConfig={legendConfig}
                                handleChange={handleChange}
                            />
                        </Stack>
                    </Collapse>
                </Config.Section>
            </Config>
            <ReferenceLines items={items} projectUuid={projectUuid} />
        </Stack>
    );
};

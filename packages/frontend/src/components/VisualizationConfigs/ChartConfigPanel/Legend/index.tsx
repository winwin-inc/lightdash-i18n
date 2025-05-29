import {
    getFieldRef,
    isField,
    isPivotReferenceWithValues,
    type CompiledDimension,
    type CustomDimension,
    type EchartsLegend,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
} from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useToggle } from 'react-use';

import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import { ReferenceLines } from './ReferenceLines';
import { TooltipConfig } from './TooltipConfig';

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

    // Extract fields used in autocomplete for tooltip
    // for non pivot charts, we can use all items in results
    // for pivot charts, we need to extract the fields used in the chart config, including pivot values
    const autocompleteFieldsTooltip = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return [];

        const { dirtyEchartsConfig: echartsConfig } =
            visualizationConfig.chartConfig;

        const allEncodes: Series['encode'][] =
            echartsConfig?.series?.map((serie) => serie.encode) ?? [];

        const hasPivot = allEncodes.some((serie) =>
            isPivotReferenceWithValues(serie.yRef),
        );
        if (!hasPivot)
            return items.map((item) =>
                isField(item)
                    ? getFieldRef(item).replace(/\./g, '_')
                    : item.name,
            );

        const fieldSet = allEncodes.reduce<Set<string>>((acc, encode) => {
            acc.add(encode.xRef.field);
            if (encode.yRef.pivotValues !== undefined) {
                encode.yRef.pivotValues.forEach((pivotValue) => {
                    acc.add(
                        `${encode.yRef.field}.${pivotValue.field}.${pivotValue.value}`,
                    );
                });
            } else {
                acc.add(encode.yRef.field);
            }
            return acc;
        }, new Set<string>());

        return [...fieldSet];
    }, [visualizationConfig, items]);
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
            {projectUuid && (
                <ReferenceLines items={items} projectUuid={projectUuid} />
            )}
            {projectUuid && (
                <TooltipConfig fields={autocompleteFieldsTooltip} />
            )}
        </Stack>
    );
};

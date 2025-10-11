import { ComparisonFormatTypes, type CompactOrAlias } from '@lightdash/common';
import {
    Grid,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import startCase from 'lodash/startCase';
import { useTranslation } from 'react-i18next';

import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { StyleOptions } from './common';

export const Comparison = () => {
    const { t } = useTranslation();

    const { visualizationConfig } = useVisualizationContext();

    if (!isBigNumberVisualizationConfig(visualizationConfig)) return null;

    const {
        bigNumberComparisonStyle,
        setBigNumberComparisonStyle,
        showStyle,
        showComparison,
        setShowComparison,
        comparisonFormat,
        setComparisonFormat,
        flipColors,
        setFlipColors,
        comparisonLabel,
        setComparisonLabel,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group spacing="xs" align="center">
                        <Config.Heading>
                            {t(
                                'components_visualization_configs_big_number.comparison.compare_to_previous_row',
                            )}
                        </Config.Heading>
                        <Switch
                            checked={showComparison}
                            onChange={() => {
                                setShowComparison(!showComparison);
                            }}
                        />
                    </Group>

                    {showComparison ? (
                        <>
                            <Group spacing="xs">
                                <Config.Label>
                                    {t(
                                        'components_visualization_configs_big_number.comparison.compare_by',
                                    )}
                                </Config.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: ComparisonFormatTypes.RAW,
                                            label: `${startCase(
                                                ComparisonFormatTypes.RAW,
                                            )} ${t(
                                                'components_visualization_configs_big_number.comparison.value',
                                            )}`,
                                        },
                                        {
                                            value: ComparisonFormatTypes.PERCENTAGE,
                                            label: startCase(
                                                ComparisonFormatTypes.PERCENTAGE,
                                            ),
                                        },
                                    ]}
                                    value={comparisonFormat}
                                    onChange={(e) => {
                                        setComparisonFormat(
                                            e === 'raw'
                                                ? ComparisonFormatTypes.RAW
                                                : ComparisonFormatTypes.PERCENTAGE,
                                        );
                                    }}
                                />
                            </Group>

                            <Switch
                                label={t(
                                    'components_visualization_configs_big_number.comparison.flip_positive_color',
                                )}
                                checked={flipColors}
                                onChange={() => {
                                    setFlipColors(!flipColors);
                                }}
                                labelPosition="left"
                                styles={{
                                    label: {
                                        paddingLeft: 0,
                                    },
                                }}
                            />

                            <Grid gutter="xs">
                                <Grid.Col
                                    span={
                                        showStyle &&
                                        comparisonFormat ===
                                            ComparisonFormatTypes.RAW
                                            ? 7
                                            : 12 // Mantine's default Grid system is 12 columns
                                    }
                                >
                                    <TextInput
                                        label={t(
                                            'components_visualization_configs_big_number.comparison.comparison_label',
                                        )}
                                        value={comparisonLabel ?? ''}
                                        placeholder={t(
                                            'components_visualization_configs_big_number.comparison.add_on_optional_label',
                                        )}
                                        onChange={(e) =>
                                            setComparisonLabel(
                                                e.currentTarget.value,
                                            )
                                        }
                                    />
                                </Grid.Col>
                                <Grid.Col span="auto">
                                    {showStyle &&
                                        comparisonFormat ===
                                            ComparisonFormatTypes.RAW && (
                                            <Select
                                                label={t(
                                                    'components_visualization_configs_big_number.comparison.format',
                                                )}
                                                data={StyleOptions}
                                                value={
                                                    bigNumberComparisonStyle ??
                                                    ''
                                                }
                                                onChange={(newValue) => {
                                                    if (!newValue) {
                                                        setBigNumberComparisonStyle(
                                                            undefined,
                                                        );
                                                    } else {
                                                        setBigNumberComparisonStyle(
                                                            newValue as CompactOrAlias,
                                                        );
                                                    }
                                                }}
                                            />
                                        )}
                                </Grid.Col>
                            </Grid>
                        </>
                    ) : null}
                </Config.Section>
            </Config>
        </Stack>
    );
};

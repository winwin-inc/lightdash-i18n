import { getItemId, type CompactOrAlias } from '@lightdash/common';
import { ActionIcon, Grid, Select, TextInput } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { StyleOptions } from './common';

export const Layout: FC = () => {
    const { t } = useTranslation();

    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isBigNumberVisualizationConfig(visualizationConfig)) return null;

    const {
        bigNumberLabel,
        defaultLabel,
        setBigNumberLabel,
        bigNumberStyle,
        setBigNumberStyle,
        setBigNumberComparisonStyle,
        showStyle,
        selectedField: selectedFieldId,
        setSelectedField,
        getField,
        showBigNumberLabel,
        setShowBigNumberLabel,
        layoutDirection,
        setLayoutDirection,
    } = visualizationConfig.chartConfig;

    const selectedField = getField(selectedFieldId);

    return (
        <Config>
            <Config.Section>
                <Config.Heading>
                    {t(
                        'components_visualization_configs_big_number.layout.field',
                    )}
                </Config.Heading>
                <FieldSelect
                    label={t(
                        'components_visualization_configs_big_number.layout.select_field',
                    )}
                    item={selectedField}
                    items={Object.values(itemsMap ?? {})}
                    onChange={(newValue) => {
                        setSelectedField(
                            newValue ? getItemId(newValue) : undefined,
                        );
                    }}
                    hasGrouping
                />

                <Grid gutter="xs">
                    <Grid.Col
                        span={
                            showStyle ? 7 : 12 // Mantine's default Grid system is 12 columns
                        }
                    >
                        <TextInput
                            variant={showBigNumberLabel ? 'default' : 'filled'}
                            label={t(
                                'components_visualization_configs_big_number.layout.label',
                            )}
                            value={bigNumberLabel}
                            placeholder={defaultLabel}
                            onChange={(e) =>
                                setBigNumberLabel(e.currentTarget.value)
                            }
                            readOnly={!showBigNumberLabel}
                            rightSection={
                                <ActionIcon
                                    onClick={() => {
                                        setShowBigNumberLabel(
                                            !showBigNumberLabel,
                                        );
                                    }}
                                >
                                    <MantineIcon
                                        icon={
                                            showBigNumberLabel
                                                ? IconEye
                                                : IconEyeOff
                                        }
                                    />
                                </ActionIcon>
                            }
                        />
                    </Grid.Col>
                    <Grid.Col span="auto">
                        {showStyle && (
                            <Select
                                label={t(
                                    'components_visualization_configs_big_number.layout.format',
                                )}
                                data={StyleOptions}
                                value={bigNumberStyle ?? ''}
                                onChange={(newValue) => {
                                    if (!newValue) {
                                        setBigNumberStyle(undefined);
                                        setBigNumberComparisonStyle(undefined);
                                    } else {
                                        setBigNumberStyle(
                                            newValue as CompactOrAlias,
                                        );
                                        setBigNumberComparisonStyle(
                                            newValue as CompactOrAlias,
                                        );
                                    }
                                }}
                            />
                        )}
                    </Grid.Col>
                </Grid>

                <Select
                    label={t(
                        'components_visualization_configs_big_number.layout.direction',
                    )}
                    value={layoutDirection ?? 'column'}
                    data={[
                        {
                            value: 'column',
                            label: t(
                                'components_visualization_configs_big_number.layout.direction_options.column',
                            ),
                        },
                        {
                            value: 'column-reverse',
                            label: t(
                                'components_visualization_configs_big_number.layout.direction_options.column_reverse',
                            ),
                        },
                    ]}
                    onChange={(value) => {
                        if (value) {
                            setLayoutDirection(
                                value as 'column' | 'column-reverse',
                            );
                        }
                    }}
                />
            </Config.Section>
        </Config>
    );
};

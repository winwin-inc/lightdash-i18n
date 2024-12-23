import { type ChartKind } from '@lightdash/common';
import { Group, Stack, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import {
    cartesianChartSelectors,
    selectCurrentCartesianChartState,
} from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';

export const CartesianChartDisplayConfig = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const xAxisLabel = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisLabel(state, selectedChartType),
    );

    const leftYAxisFields = useVizSelector((state) =>
        cartesianChartSelectors.getLeftYAxisFields(state, selectedChartType),
    );
    const rightYAxisFields = useVizSelector((state) =>
        cartesianChartSelectors.getRightYAxisFields(state, selectedChartType),
    );

    const yAxisLabels = useVizSelector((state) =>
        cartesianChartSelectors.getYAxisLabels(state, selectedChartType),
    );

    return (
        <Stack spacing="xl" mt="sm">
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t('components_dataviz_config.x_axis')}
                    </Config.Heading>
                    <TextInput
                        value={xAxisLabel || ''}
                        radius="md"
                        onChange={(e) =>
                            dispatch(
                                actions.setXAxisLabel({
                                    label: e.target.value,
                                }),
                            )
                        }
                    />
                </Config.Section>
            </Config>
            {leftYAxisFields.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>
                            {rightYAxisFields.length > 0
                                ? t('components_dataviz_config.y_axis.part_2')
                                : t('components_dataviz_config.y_axis.part_1')}
                        </Config.Heading>
                        <Group noWrap w="100%">
                            <Config.Label>
                                {t('components_dataviz_config.label')}
                            </Config.Label>
                            <TextInput
                                w="100%"
                                value={yAxisLabels[0] || ''}
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
                        </Group>

                        <Config.Group>
                            <Config.Label>
                                {t('components_dataviz_config.format')}
                            </Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.display?.yAxis?.[0]?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                            index: 0,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    </Config.Section>
                </Config>
            )}
            {rightYAxisFields.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>
                            {t('components_dataviz_config.y_axis.part_3')}
                        </Config.Heading>
                        <Group noWrap w="100%">
                            <Config.Label>
                                {t('components_dataviz_config.label')}
                            </Config.Label>
                            <TextInput
                                w="100%"
                                value={yAxisLabels[1] || ''}
                                radius="md"
                                onChange={(e) =>
                                    dispatch(
                                        actions.setYAxisLabel({
                                            index: 1,
                                            label: e.target.value,
                                        }),
                                    )
                                }
                            />
                        </Group>

                        <Config.Group>
                            <Config.Label>
                                {t('components_dataviz_config.format')}
                            </Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.display?.yAxis?.[1]?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                            index: 1,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    </Config.Section>
                </Config>
            )}
        </Stack>
    );
};

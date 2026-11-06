import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    getItemId,
    getItemLabelWithoutTableName,
    type CartesianChartLayout,
    type CustomDimension,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Checkbox, Group, Select, Stack } from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';
import { Config } from '../../common/Config';
import { EditableText } from '../../common/EditableText';
import { GrabIcon } from '../../common/GrabIcon';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation | CustomDimension;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
} & Pick<
    ReturnType<typeof useCartesianChartConfig>,
    'updateSingleSeries' | 'getSingleSeries'
>;

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    isSingle,
    layout,
    series,
    item,
    getSingleSeries,
    updateSingleSeries,
    dragHandleProps,
}) => {
    const { colorPalette, getSeriesColor } = useVisualizationContext();
    const { t } = useTranslation();
    const { visualizationConfig } = useVisualizationContext();
    const cartesianChartConfig = isCartesianVisualizationConfig(
        visualizationConfig,
    )
        ? visualizationConfig.chartConfig
        : undefined;
    const setBaselineFieldEnabled =
        cartesianChartConfig?.setBaselineFieldEnabled;
    const updateBaselineStyle = cartesianChartConfig?.updateBaselineStyle;
    const [value, setValue] = useDebouncedState(
        getSingleSeries(series)?.name || getItemLabelWithoutTableName(item),
        500,
    );

    const fieldKey = getItemId(item);
    const isBaselineField = (layout?.baselineFieldIds ?? []).includes(fieldKey);
    const chartType =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;

    const BASELINE_WIDTH_OPTIONS = ['1', '2', '3', '4', '5'].map((width) => ({
        value: width,
        label: width,
    }));

    const BASELINE_LINE_TYPE_OPTIONS = [
        {
            value: 'solid',
            label: t(
                'components_visualization_configs_chart.series.baseline_line_type_solid',
            ),
        },
        {
            value: 'dashed',
            label: t(
                'components_visualization_configs_chart.series.baseline_line_type_dashed',
            ),
        },
    ];

    return (
        <Config>
            <Config.Section>
                <Group noWrap spacing="two">
                    <GrabIcon dragHandleProps={dragHandleProps} />

                    <ColorSelector
                        color={getSeriesColor(series)}
                        swatches={colorPalette}
                        withAlpha
                        onColorChange={(color) => {
                            updateSingleSeries({
                                ...series,
                                color,
                            });
                        }}
                    />
                    {isSingle ? (
                        <Config.Heading>
                            {getItemLabelWithoutTableName(item)}
                        </Config.Heading>
                    ) : (
                        <Box
                            style={{
                                flexGrow: 1,
                            }}
                        >
                            <EditableText
                                sx={{ flexGrow: 1 }}
                                fw={600}
                                size="sm"
                                lighter
                                defaultValue={value}
                                placeholder={getItemLabelWithoutTableName(item)}
                                onChange={(event) => {
                                    setValue(event.currentTarget.value);
                                    updateSingleSeries({
                                        ...series,
                                        name: event.currentTarget.value,
                                    });
                                }}
                            />
                        </Box>
                    )}
                </Group>
                <SingleSeriesConfiguration
                    layout={layout}
                    series={series}
                    isSingle={isSingle}
                    seriesLabel={getItemLabelWithoutTableName(item)}
                    updateSingleSeries={updateSingleSeries}
                    getSingleSeries={getSingleSeries}
                />
                {(chartType === CartesianSeriesType.LINE ||
                    chartType === CartesianSeriesType.AREA) && (
                    <Stack spacing="xs" mt="xs" ml="lg">
                        <Group spacing="xs">
                            <Checkbox
                                checked={isBaselineField}
                                label={t(
                                    'components_visualization_configs_chart.series.baseline',
                                )}
                                onChange={() => {
                                    setBaselineFieldEnabled?.(
                                        fieldKey,
                                        !isBaselineField,
                                    );
                                }}
                            />
                        </Group>
                        {isBaselineField && (
                            <Group spacing="xs" noWrap>
                                <Select
                                    label={t(
                                        'components_visualization_configs_chart.series.baseline_style_width',
                                    )}
                                    value={String(
                                        Math.min(
                                            5,
                                            Math.max(
                                                1,
                                                layout?.baselineStyle?.width ??
                                                    3,
                                            ),
                                        )
                                    )}
                                    data={BASELINE_WIDTH_OPTIONS}
                                    onChange={(widthValue) => {
                                        updateBaselineStyle?.({
                                            width: parseInt(
                                                widthValue || '3',
                                                10,
                                            ),
                                        });
                                    }}
                                />
                                <Select
                                    label={t(
                                        'components_visualization_configs_chart.series.baseline_style_line_type',
                                    )}
                                    value={
                                        layout?.baselineStyle?.lineType ??
                                        'solid'
                                    }
                                    data={BASELINE_LINE_TYPE_OPTIONS}
                                    onChange={(lineTypeValue) => {
                                        updateBaselineStyle?.({
                                            lineType:
                                                lineTypeValue === 'dashed'
                                                    ? 'dashed'
                                                    : 'solid',
                                        });
                                    }}
                                />
                            </Group>
                        )}
                    </Stack>
                )}
            </Config.Section>
        </Config>
    );
};

export default BasicSeriesConfiguration;

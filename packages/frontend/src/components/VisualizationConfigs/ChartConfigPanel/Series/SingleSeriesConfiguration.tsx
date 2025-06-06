import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    ChartType,
    type CartesianChartLayout,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Select,
    Stack,
} from '@mantine/core';
import { useDebouncedState, useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconEyeOff,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { calculateSeriesLikeIdentifier } from '../../../../hooks/useChartColorConfig/utils';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import MantineIcon from '../../../common/MantineIcon';
import ColorSelector from '../../ColorSelector';
import { EditableText } from '../../common/EditableText';
import { GrabIcon } from '../../common/GrabIcon';
import { ChartTypeSelect } from './ChartTypeSelect';

type Props = {
    isCollapsable?: boolean;
    seriesLabel: string;
    layout?: CartesianChartLayout;
    series: Series;
    isSingle?: boolean;
    isGrouped?: boolean;
    isOpen?: boolean;
    toggleIsOpen?: () => void;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
} & Pick<
    ReturnType<typeof useCartesianChartConfig>,
    'updateSingleSeries' | 'getSingleSeries'
>;

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    seriesLabel,
    series,
    getSingleSeries,
    updateSingleSeries,
    isGrouped = false,
    isSingle,
    isOpen,
    toggleIsOpen,
    dragHandleProps,
}) => {
    const { t } = useTranslation();

    const { visualizationConfig, colorPalette, getSeriesColor } =
        useVisualizationContext();
    const { hovered, ref } = useHover();

    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;
    const [seriesValue, setSeriesValue] = useDebouncedState(
        getSingleSeries(series)?.name || seriesLabel,
        200,
    );

    return (
        <Box>
            <Group position="apart">
                <Group
                    spacing="two"
                    ref={ref}
                    sx={{
                        flexGrow: 1,
                    }}
                >
                    {isGrouped && (
                        <GrabIcon
                            dragHandleProps={dragHandleProps}
                            hovered={hovered}
                        />
                    )}
                    {isGrouped && (
                        <ColorSelector
                            color={getSeriesColor(series)}
                            swatches={colorPalette}
                            withAlpha
                            onColorChange={(color) => {
                                updateSingleSeries({
                                    ...series,
                                    color,
                                });
                                const serieId =
                                    calculateSeriesLikeIdentifier(series).join(
                                        '.',
                                    );

                                if (
                                    visualizationConfig.chartType ===
                                    ChartType.CARTESIAN
                                ) {
                                    const { updateMetadata } =
                                        visualizationConfig.chartConfig;

                                    updateMetadata({
                                        ...visualizationConfig.chartConfig
                                            .dirtyMetadata,
                                        [serieId]: { color },
                                    });
                                }
                            }}
                        />
                    )}
                    {!isSingle && isGrouped && (
                        <Box
                            style={{
                                flexGrow: 1,
                            }}
                        >
                            <EditableText
                                disabled={series.hidden}
                                defaultValue={seriesValue}
                                placeholder={seriesLabel}
                                onChange={(event) => {
                                    setSeriesValue(event.currentTarget.value);
                                    updateSingleSeries({
                                        ...series,
                                        name: event.currentTarget.value,
                                    });
                                }}
                            />
                        </Box>
                    )}
                </Group>

                <Group spacing="one">
                    {isGrouped && (
                        <ActionIcon
                            onClick={() => {
                                updateSingleSeries({
                                    ...series,
                                    hidden: !series.hidden,
                                });
                            }}
                        >
                            <MantineIcon
                                icon={series.hidden ? IconEye : IconEyeOff}
                            />
                        </ActionIcon>
                    )}
                    {isCollapsable && (
                        <ActionIcon onClick={toggleIsOpen}>
                            <MantineIcon
                                color="gray.7"
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
            <Collapse in={!isCollapsable || isOpen || false}>
                <Stack ml="lg" spacing="xs">
                    <Group spacing="xs" noWrap>
                        <ChartTypeSelect
                            showLabel={!isGrouped}
                            chartValue={type}
                            showMixed={false}
                            onChange={(value) => {
                                const newType =
                                    value === CartesianSeriesType.AREA
                                        ? CartesianSeriesType.LINE
                                        : value;
                                updateSingleSeries({
                                    ...series,
                                    type: newType as CartesianSeriesType,
                                    areaStyle:
                                        value === CartesianSeriesType.AREA
                                            ? {}
                                            : undefined,
                                });
                            }}
                        />

                        <Select
                            label={!isGrouped && 'Axis'}
                            value={String(series.yAxisIndex)}
                            data={[
                                {
                                    value: '0',
                                    label: layout?.flipAxes
                                        ? t(
                                              'components_visualization_configs_chart.series.axis_options.bottom',
                                          )
                                        : t(
                                              'components_visualization_configs_chart.series.axis_options.left',
                                          ),
                                },
                                {
                                    value: '1',
                                    label: layout?.flipAxes
                                        ? t(
                                              'components_visualization_configs_chart.series.axis_options.top',
                                          )
                                        : t(
                                              'components_visualization_configs_chart.series.axis_options.right',
                                          ),
                                },
                            ]}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    yAxisIndex: parseInt(value || '0', 10),
                                });
                            }}
                        />
                        <Select
                            label={
                                !isGrouped &&
                                t(
                                    'components_visualization_configs_chart.series.value_labels',
                                )
                            }
                            value={series.label?.position || 'hidden'}
                            data={[
                                {
                                    value: 'hidden',
                                    label: t(
                                        'components_visualization_configs_chart.series.label_options.hidden',
                                    ),
                                },
                                {
                                    value: 'top',
                                    label: t(
                                        'components_visualization_configs_chart.series.label_options.top',
                                    ),
                                },
                                {
                                    value: 'bottom',
                                    label: t(
                                        'components_visualization_configs_chart.series.label_options.bottom',
                                    ),
                                },
                                {
                                    value: 'left',
                                    label: t(
                                        'components_visualization_configs_chart.series.label_options.left',
                                    ),
                                },
                                {
                                    value: 'right',
                                    label: t(
                                        'components_visualization_configs_chart.series.label_options.right',
                                    ),
                                },
                                {
                                    value: 'inside',
                                    label: t(
                                        'components_visualization_configs_chart.series.label_options.inside',
                                    ),
                                },
                            ]}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    label:
                                        value === 'hidden'
                                            ? { show: false }
                                            : {
                                                  show: true,
                                                  position: value as any,
                                              },
                                });
                            }}
                        />
                    </Group>
                    {(type === CartesianSeriesType.LINE ||
                        type === CartesianSeriesType.AREA) && (
                        <Group spacing="xs">
                            <Checkbox
                                checked={series.showSymbol ?? true}
                                label={t(
                                    'components_visualization_configs_chart.series.show_symbol',
                                )}
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        showSymbol: !(
                                            series.showSymbol ?? true
                                        ),
                                    });
                                }}
                            />
                            <Checkbox
                                checked={series.smooth}
                                label={t(
                                    'components_visualization_configs_chart.series.smooth',
                                )}
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        smooth: !series.smooth,
                                    });
                                }}
                            />
                        </Group>
                    )}
                </Stack>
            </Collapse>
        </Box>
    );
};

export default SingleSeriesConfiguration;

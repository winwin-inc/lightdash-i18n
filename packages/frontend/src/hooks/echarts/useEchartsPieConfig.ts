import {
    formatItemValue,
    PieChartLegendLabelMaxLengthDefault,
    PieChartTooltipLabelMaxLength,
    type PieChart,
    type PieChartValueOptions,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { type EChartsOption, type PieSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isPieVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import {
    formatPercentForLabel,
    formatPieSliceLabel,
} from './pieLabelFormatters';
import { useLegendDoubleClickTooltip } from './useLegendDoubleClickTooltip';

export type PieSeriesDataPoint = NonNullable<
    PieSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

type PieChartWithTemplate = PieChart & {
    useCustomFormat?: PieChartValueOptions['useCustomFormat'];
    valueLabelTemplate?: PieChartValueOptions['labelTemplate'];
    groupValueOptionOverrides?: Record<string, Partial<PieChartValueOptions>>;
};

function itemHasOutsideLabel(
    item: PieSeriesDataPoint | number | string,
): boolean {
    return (
        typeof item === 'object' &&
        item !== null &&
        'label' in item &&
        typeof item.label === 'object' &&
        item.label !== null &&
        'position' in item.label &&
        item.label.position === 'outside'
    );
}

const useEchartsPieConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
    const {
        visualizationConfig,
        itemsMap,
        getGroupColor,
        minimal,
        useHashBased,
    } = useVisualizationContext();

    const theme = useMantineTheme();
    const isMobile = useMediaQuery('(max-width: 768px)');

    const chartConfig = useMemo(() => {
        if (!isPieVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

        const {
            selectedMetric,
            data,
            sortedGroupLabels,
            groupFieldIds,
            validConfig,
        } = chartConfig;

        const validConfigWithTemplate = validConfig as PieChartWithTemplate;

        const {
            valueLabel: valueLabelDefault,
            showValue: showValueDefault,
            showPercentage: showPercentageDefault,
            useCustomFormat: useCustomFormatDefault,
            groupLabelOverrides,
            groupValueOptionOverrides,
            groupColorOverrides,
            valueLabelTemplate: valueLabelTemplateDefault,
        } = validConfigWithTemplate;

        const groupValueOptionsMap:
            | Record<string, Partial<PieChartValueOptions>>
            | undefined = groupValueOptionOverrides;

        if (!selectedMetric) return;

        return data
            .sort(
                ({ name: nameA }, { name: nameB }) =>
                    sortedGroupLabels.indexOf(nameA) -
                    sortedGroupLabels.indexOf(nameB),
            )
            .map(({ name, value, meta }) => {
                const valueLabel =
                    groupValueOptionsMap?.[name]?.valueLabel ??
                    valueLabelDefault;
                const showValue =
                    groupValueOptionsMap?.[name]?.showValue ?? showValueDefault;
                const showPercentage =
                    groupValueOptionsMap?.[name]?.showPercentage ??
                    showPercentageDefault;
                const useCustomFormat =
                    groupValueOptionsMap?.[name]?.useCustomFormat ??
                    useCustomFormatDefault ??
                    false;
                const labelTemplate =
                    groupValueOptionsMap?.[name]?.labelTemplate ??
                    valueLabelTemplateDefault;

                const groupPrefix = groupFieldIds.join('_');
                const itemColor = useHashBased
                    ? getGroupColor(groupPrefix, name)
                    : (groupColorOverrides?.[name] ??
                      getGroupColor(groupPrefix, name));

                const isOutsideLabel = valueLabel === 'outside';
                const isMobileOutsideLabel = isMobile && isOutsideLabel;

                const config: PieSeriesDataPoint = {
                    id: name,
                    groupId: name,
                    name: groupLabelOverrides?.[name] ?? name,
                    value: value,
                    itemStyle: {
                        color: itemColor,
                    },
                    label: {
                        show: valueLabel !== 'hidden',
                        position: isOutsideLabel ? 'outside' : 'inside',
                        ...(isMobileOutsideLabel
                            ? {
                                  alignTo: 'edge',
                                  align: 'left',
                                  edgeDistance: 8,
                                  distanceToLabelLine: 4,
                                  bleedMargin: 8,
                                  fontSize: 10,
                                  lineHeight: 15,
                                  overflow: 'break',
                                  padding: [2, 0],
                                  width: 80,
                              }
                            : {}),
                        formatter: (params) => {
                            const percentValue =
                                typeof params.percent === 'number'
                                    ? params.percent
                                    : Number(params.percent) || 0;

                            const rawValueFromParams =
                                typeof params.value === 'number'
                                    ? params.value
                                    : Number(params.value) || 0;

                            return formatPieSliceLabel({
                                name: params.name ?? '',
                                percentValue,
                                formattedValue: meta.value.formatted ?? '',
                                rawValue: meta.value.raw ?? rawValueFromParams,
                                valueLabel: valueLabel ?? 'outside',
                                showValue: showValue ?? false,
                                showPercentage: showPercentage ?? false,
                                useCustomFormat,
                                labelTemplate,
                                wrapLongLines: isMobileOutsideLabel,
                            });
                        },
                    },
                    meta,
                };

                return config;
            });
    }, [chartConfig, getGroupColor, isMobile, useHashBased]);

    const pieSeriesOption: PieSeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

        const {
            validConfig: {
                isDonut,
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
                showLegend,
                legendPosition,
            },
            selectedMetric,
        } = chartConfig;

        const hasOutsideLabels = seriesData?.some(itemHasOutsideLabel);
        const isMobileWithOutsideLabels = isMobile && hasOutsideLabels;
        const sliceCount = seriesData?.length ?? 0;

        const mobileOuterRadius =
            sliceCount > 8 ? '42%' : sliceCount > 5 ? '46%' : '50%';
        const mobileInnerRadius =
            sliceCount > 8 ? '21%' : sliceCount > 5 ? '23%' : '25%';

        const radius = isMobileWithOutsideLabels
            ? isDonut
                ? [mobileInnerRadius, mobileOuterRadius]
                : mobileOuterRadius
            : isDonut
              ? ['30%', '70%']
              : '70%';

        let center: [string, string];
        if (isMobileWithOutsideLabels) {
            center =
                showLegend && legendPosition === 'horizontal'
                    ? ['50%', '58%']
                    : ['50%', '52%'];
        } else if (legendPosition === 'horizontal') {
            center =
                showLegend &&
                valueLabelDefault === 'outside' &&
                (showValueDefault || showPercentageDefault)
                    ? ['50%', '55%']
                    : showLegend
                      ? ['50%', '52%']
                      : ['50%', '50%'];
        } else {
            center = ['50%', '50%'];
        }

        return {
            type: 'pie',
            data: seriesData,
            radius,
            center,
            avoidLabelOverlap: true,
            ...(isMobileWithOutsideLabels
                ? {
                      labelLine: {
                          show: true,
                          length: 10,
                          length2: 8,
                          smooth: false,
                          lineStyle: {
                              width: 1,
                              type: 'solid',
                          },
                      },
                  }
                : hasOutsideLabels
                  ? {
                        labelLine: {
                            show: true,
                        },
                    }
                  : {}),
            tooltip: {
                trigger: 'item',
                formatter: ({ marker, name, value, percent }) => {
                    const formattedValue = formatItemValue(
                        selectedMetric,
                        value,
                    );

                    const truncatedName =
                        name.length > PieChartTooltipLabelMaxLength
                            ? `${name.slice(
                                  0,
                                  PieChartTooltipLabelMaxLength,
                              )}...`
                            : name;

                    const percentFormatted = formatPercentForLabel(
                        Number(percent),
                        2,
                    );
                    return `${marker} <b>${truncatedName}</b><br />${percentFormatted}% - ${formattedValue}`;
                },
            },
        };
    }, [chartConfig, seriesData, isMobile]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !pieSeriesOption) return;

        const {
            validConfig: { showLegend, legendPosition, legendMaxItemLength },
        } = chartConfig;

        const hasOutsideLabels = seriesData?.some(itemHasOutsideLabel);
        const isMobileWithOutsideLabels = isMobile && hasOutsideLabels;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            legend: {
                show: showLegend,
                type: 'scroll',
                formatter: (name) => {
                    return name.length >
                        (legendMaxItemLength ??
                            PieChartLegendLabelMaxLengthDefault)
                        ? `${name.slice(
                              0,
                              legendMaxItemLength ??
                                  PieChartLegendLabelMaxLengthDefault,
                          )}...`
                        : name;
                },
                tooltip: legendDoubleClickTooltip,
                selected: selectedLegends,
                ...(isMobileWithOutsideLabels
                    ? {
                          left: 'center',
                          top: 0,
                          orient: 'horizontal' as const,
                          align: 'auto',
                      }
                    : legendPosition === 'vertical'
                      ? {
                            left: 'left',
                            top: 'middle',
                            orient: 'vertical' as const,
                            align: 'left',
                        }
                      : {
                            left: 'center',
                            top: 'top',
                            orient: 'horizontal' as const,
                            align: 'auto',
                        }),
            },
            tooltip: {
                trigger: 'item',
            },
            series: [pieSeriesOption],
            animation: !(isInDashboard || minimal),
        };
    }, [
        legendDoubleClickTooltip,
        selectedLegends,
        chartConfig,
        isInDashboard,
        minimal,
        pieSeriesOption,
        theme,
        isMobile,
        seriesData,
    ]);

    if (!itemsMap) return;
    if (!eChartsOption || !pieSeriesOption) return;

    return { eChartsOption, pieSeriesOption };
};

export default useEchartsPieConfig;

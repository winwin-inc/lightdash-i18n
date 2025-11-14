import {
    CustomFormatType,
    formatItemValue,
    getCustomFormat,
    PieChartLegendLabelMaxLengthDefault,
    PieChartTooltipLabelMaxLength,
    type PieChart,
    type PieChartValueOptions,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type PieSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isPieVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
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

const useEchartsPieConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
    const { visualizationConfig, itemsMap, getGroupColor, minimal } =
        useVisualizationContext();

    const theme = useMantineTheme();

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

                // Use all group field IDs as the group prefix for color assignment:
                const groupPrefix = groupFieldIds.join('_');
                const itemColor =
                    groupColorOverrides?.[name] ??
                    getGroupColor(groupPrefix, name);

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
                        position:
                            valueLabel === 'outside' ? 'outside' : 'inside',
                        formatter: (params) => {
                            // In ECharts pie chart formatter:
                            // params.value is the raw numeric value we passed in
                            // params.percent is the calculated percentage (0-100)
                            // params.data contains our custom data object with meta
                            const dataPoint = params.data as PieSeriesDataPoint;
                            const percentValue =
                                typeof params.percent === 'number'
                                    ? params.percent
                                    : Number(params.percent) || 0;

                            // Get the raw value from params (ECharts provides this)
                            const rawValueFromParams =
                                typeof params.value === 'number'
                                    ? params.value
                                    : Number(params.value) || 0;

                            // Use custom template if useCustomFormat is true and template is provided
                            if (
                                useCustomFormat &&
                                labelTemplate &&
                                labelTemplate.trim() !== ''
                            ) {
                                // Replace placeholders with actual values
                                // In custom format mode, always show values regardless of showValue/showPercentage
                                // {name} - the group name
                                // {value} - the formatted numeric value (keeps original format, e.g., "1,234.56" or "50%")
                                //   Note: For percentage format metrics, this will include the % symbol
                                // {rawValue} - the raw numeric value (e.g., 1234.56)
                                // {percent} - the percentage value (0-100, user can add % symbol in template)

                                // Use the original formatted value to preserve the format
                                // The format is determined by the metric's formatOptions/format settings
                                // For percentage format metrics (CustomFormatType.PERCENT), this will include the % symbol
                                const formattedValue =
                                    meta.value.formatted ?? '';

                                let formattedLabel = labelTemplate
                                    .replaceAll('{name}', params.name ?? '')
                                    .replaceAll('{value}', formattedValue)
                                    .replaceAll(
                                        '{rawValue}',
                                        `${
                                            meta.value.raw ?? rawValueFromParams
                                        }`,
                                    )
                                    .replaceAll('{percent}', `${percentValue}`);

                                formattedLabel = formattedLabel.trim();

                                if (formattedLabel.length > 0) {
                                    return formattedLabel;
                                }
                            }

                            // Default behavior for non-custom modes
                            return valueLabel !== 'hidden' &&
                                showValue &&
                                showPercentage
                                ? `${percentValue}% - ${meta.value.formatted}`
                                : showValue
                                ? `${meta.value.formatted}`
                                : showPercentage
                                ? `${percentValue}%`
                                : `${params.name}`;
                        },
                    },
                    meta,
                };

                return config;
            });
    }, [chartConfig, getGroupColor]);

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

        return {
            type: 'pie',
            data: seriesData,
            radius: isDonut ? ['30%', '70%'] : '70%',
            center:
                legendPosition === 'horizontal'
                    ? showLegend &&
                      valueLabelDefault === 'outside' &&
                      (showValueDefault || showPercentageDefault)
                        ? ['50%', '55%']
                        : showLegend
                        ? ['50%', '52%']
                        : ['50%', '50%']
                    : ['50%', '50%'],
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

                    return `${marker} <b>${truncatedName}</b><br />${percent}% - ${formattedValue}`;
                },
            },
        };
    }, [chartConfig, seriesData]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !pieSeriesOption) return;

        const {
            validConfig: { showLegend, legendPosition, legendMaxItemLength },
        } = chartConfig;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            legend: {
                show: showLegend,
                orient: legendPosition,
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
                ...(legendPosition === 'vertical'
                    ? {
                          left: 'left',
                          top: 'middle',
                          align: 'left',
                      }
                    : {
                          left: 'center',
                          top: 'top',
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
    ]);

    if (!itemsMap) return;
    if (!eChartsOption || !pieSeriesOption) return;

    return { eChartsOption, pieSeriesOption };
};

export default useEchartsPieConfig;

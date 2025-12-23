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

/**
 * 计算饼图的半径和中心位置
 * @param isDonut - 是否为环形图
 * @param isMobile - 是否为移动端
 * @param hasOutsideLabels - 是否有外侧标签
 * @param showLegend - 是否显示图例
 * @param legendPosition - 图例位置
 * @returns 包含 radius 和 center 的配置对象
 */
const getPieChartLayout = ({
    isDonut,
    isMobile,
    hasOutsideLabels,
    showLegend,
    legendPosition,
}: {
    isDonut: boolean;
    isMobile: boolean;
    hasOutsideLabels: boolean;
    showLegend: boolean;
    legendPosition: 'horizontal' | 'vertical';
}): {
    radius: string | [string, string];
    center: [string, string];
} => {
    // 移动端外侧标签：减小半径，为标签和图例留出空间
    const shouldOptimizeForMobile = isMobile && hasOutsideLabels;

    const radius: string | [string, string] = shouldOptimizeForMobile
        ? isDonut
            ? (['20%', '45%'] as [string, string]) // 移动端外侧标签：减小半径
            : '45%' // 移动端外侧标签：减小半径
        : isDonut
        ? (['30%', '70%'] as [string, string])
        : '70%';

    // 移动端外侧标签：中心位置上移，为底部图例留出空间
    const center: [string, string] =
        legendPosition === 'horizontal'
            ? shouldOptimizeForMobile
                ? (['50%', '45%'] as [string, string]) // 移动端外侧标签：上移，为底部图例留空间
                : showLegend
                ? (['50%', '52%'] as [string, string]) // 桌面端有图例时稍微下移
                : (['50%', '50%'] as [string, string]) // 桌面端无图例时居中
            : shouldOptimizeForMobile
            ? (['50%', '45%'] as [string, string]) // 移动端外侧标签：上移
            : (['50%', '50%'] as [string, string]); // 垂直图例时居中

    return { radius, center };
};

const useEchartsPieConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
    const { visualizationConfig, itemsMap, getGroupColor, minimal } =
        useVisualizationContext();

    const theme = useMantineTheme();
    const isMobile = useMediaQuery('(max-width: 768px)') ?? false;

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

                // 移动端优化：当标签在外侧时，调整标签配置以避免超出屏幕和文字折叠
                const isOutsideLabel = valueLabel === 'outside';
                const shouldOptimizeLabelForMobile = isMobile && isOutsideLabel;

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
                        // 移动端外侧标签优化：配置标签样式，确保数字清晰可读且不被省略
                        ...(shouldOptimizeLabelForMobile
                            ? {
                                  distance: 8, // 标签到饼图边缘的距离（像素）
                                  alignTo: 'edge', // 对齐到边缘
                                  margin: 4, // 标签之间的最小间距
                                  fontSize: 11, // 移动端字体大小，确保数字清晰可读
                                  // 容器已设置 overflow: visible，标签可以完整显示
                              }
                            : {}),
                        formatter: (params) => {
                            // In ECharts pie chart formatter:
                            // params.value is the raw numeric value we passed in
                            // params.percent is the calculated percentage (0-100)
                            // params.data contains our custom data object with meta
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
                            let labelText =
                                valueLabel !== 'hidden' &&
                                showValue &&
                                showPercentage
                                    ? `${percentValue}% - ${meta.value.formatted}`
                                    : showValue
                                    ? `${meta.value.formatted}`
                                    : showPercentage
                                    ? `${percentValue}%`
                                    : `${params.name}`;

                            return labelText;
                        },
                    },
                    meta,
                };

                return config;
            });
    }, [chartConfig, getGroupColor, isMobile]);

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

        // 检测是否有外侧标签
        const hasOutsideLabels =
            valueLabelDefault === 'outside' &&
            (showValueDefault || showPercentageDefault);
        const shouldOptimizeForMobile = isMobile && hasOutsideLabels;

        // 使用抽离的函数计算饼图的布局（半径和中心位置）
        const { radius, center } = getPieChartLayout({
            isDonut: Boolean(isDonut),
            isMobile: Boolean(isMobile),
            hasOutsideLabels: Boolean(hasOutsideLabels),
            showLegend: Boolean(showLegend),
            legendPosition: (legendPosition ?? 'horizontal') as
                | 'horizontal'
                | 'vertical',
        });

        return {
            type: 'pie',
            data: seriesData,
            radius,
            center,
            // 启用防止标签重叠
            // 注意：avoidLabelOverlap 可能会隐藏部分重叠的标签，但可以调整标签位置避免重叠
            avoidLabelOverlap: true,
            // 外侧标签：始终显示引导线
            labelLine: hasOutsideLabels
                ? {
                      show: true,
                      length: 15, // 引导线第一段长度
                      length2: 10, // 引导线第二段长度
                      smooth: 0, // 使用直线
                      lineStyle: {
                          width: 1,
                          color: '#666', // 引导线颜色
                      },
                  }
                : {
                      show: false, // 内侧标签不显示引导线
                  },
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
    }, [chartConfig, seriesData, isMobile]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !pieSeriesOption) return;

        const {
            validConfig: {
                showLegend,
                legendPosition,
                legendMaxItemLength,
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
            },
        } = chartConfig;

        // 检测是否有外侧标签（用于图例位置优化）
        const hasOutsideLabels =
            valueLabelDefault === 'outside' &&
            (showValueDefault || showPercentageDefault);
        const shouldOptimizeForMobile = isMobile && hasOutsideLabels;

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
                // 移动端外侧标签：图例放在底部，避免与标签重叠
                ...(shouldOptimizeForMobile
                    ? {
                          padding: [0, 0], // 移除图例 padding
                          itemGap: 8, // 减少图例项间距
                      }
                    : {}),
                ...(legendPosition === 'vertical'
                    ? {
                          left: 'left',
                          top: 'middle',
                          align: 'left',
                      }
                    : {
                          left: 'center',
                          // 移动端外侧标签：图例放在底部
                          top: shouldOptimizeForMobile ? undefined : 'top',
                          bottom: shouldOptimizeForMobile ? 5 : undefined,
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
    ]);

    if (!itemsMap) return;
    if (!eChartsOption || !pieSeriesOption) return;

    return { eChartsOption, pieSeriesOption };
};

export default useEchartsPieConfig;

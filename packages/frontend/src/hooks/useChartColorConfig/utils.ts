import {
    ChartType,
    type ChartConfig,
    type Series,
} from '@lightdash/common';
import { type EChartSeries } from '../echarts/useEchartsCartesianConfig';
import { type SeriesLike } from './types';

/**
 * There's some variation in what Series object we may be working with.
 */

export const isGroupedSeries = (series: SeriesLike) => {
    return (
        (series as EChartSeries)?.pivotReference?.pivotValues != null ||
        (series as Series)?.encode.yRef.pivotValues != null
    );
};

export const calculateSeriesLikeIdentifier = (series: SeriesLike) => {
    const baseField =
        (series as EChartSeries).pivotReference?.field ??
        (series as Series).encode.yRef?.field;

    const pivotValues = (
        (series as EChartSeries)?.pivotReference?.pivotValues ??
        (series as Series)?.encode.yRef.pivotValues ??
        []
    ).map(({ value }) => `${value}`);

    const pivotValuesSubPath =
        pivotValues && pivotValues.length > 0
            ? `${pivotValues.join('.')}`
            : null;

    /**
     * When dealing with flipped axis, Echarts will include the pivot value as
     * part of the field identifier - we want to remove it for the purposes of
     * color mapping if that's the case, so that we continue to have a mapping
     * that looks like:
     *
     *  basefield->pivot_value
     *
     * instead of:
     *
     *  basefield.pivot_value -> pivot_value
     *
     * (which would be a grouping of 1 per pivot value, causing all values to
     * be assigned the first color)
     */
    const baseFieldPathParts = baseField.split('.');

    const baseFieldPath =
        pivotValuesSubPath && baseFieldPathParts.at(-1) === pivotValuesSubPath
            ? baseFieldPathParts.slice(0, -1).join('.')
            : baseField;

    const completeIdentifier = pivotValuesSubPath
        ? pivotValuesSubPath
        : baseFieldPath;

    return [
        `${baseFieldPath}${
            /**
             * If we have more than one pivot value, we append the number of pivot values
             * to the group identifier, giving us a unique group per number of values.
             *
             * This is not critical, but gives us better serial color assignment when
             * switching between number of groups, since we're not tacking each group
             * configuration on top of eachother (under the same identifier).
             */
            pivotValues.length === 1 ? '' : `${`_n${pivotValues.length}`}`
        }`,
        completeIdentifier,
    ];
};

/**
 * 系列声明的指标字段（基准线判断用）：运行时 echarts 系列优先取 pivotReference，
 * 图表配置中的 Series 取 encode.yRef（与 calculateSeriesLikeIdentifier 的取法一致）。
 */
const getSeriesLikeField = (series: SeriesLike): string | undefined =>
    (series as EChartSeries).pivotReference?.field ??
    (series as Series).encode.yRef?.field;

/**
 * 基准线系列（layout.baselineFieldIds 声明的指标，仅 line/area）是用户特意配色的
 * 参考线：即使在看板「同步图表颜色」(useHashBased) 模式下，也应保留用户自定义色，
 * 不被看板色表覆盖。
 *
 * 取色优先级与非哈希分支一致：
 * 1. 系列对象上的 color（SingleSeriesConfiguration → updateSingleSeries 写入）
 * 2. chartConfig.config.metadata[seriesId].color（同一面板 → updateMetadata 写入，
 *    key 为 calculateSeriesLikeIdentifier(series).join('.')）
 *
 * 非基准线系列 / 非 CARTESIAN 图表 / 无自定义色时返回 null，调用方维持原取色路径。
 */
export const getBaselineUserColor = (
    seriesLike: SeriesLike,
    chartConfig: ChartConfig,
): string | null => {
    if (chartConfig.type !== ChartType.CARTESIAN) return null;

    const baselineFieldIds = chartConfig.config?.layout?.baselineFieldIds;
    if (!baselineFieldIds || baselineFieldIds.length === 0) return null;

    const field = getSeriesLikeField(seriesLike);
    if (!field || !baselineFieldIds.includes(field)) return null;

    if (seriesLike.color) return seriesLike.color;

    const serieId = calculateSeriesLikeIdentifier(seriesLike).join('.');
    return chartConfig.config?.metadata?.[serieId]?.color ?? null;
};

import { ChartType, type ChartConfig, type Series } from '@lightdash/common';
import { pieRowColorKeys } from '../../hooks/useChartColorConfig/colorSyncKeys';
import { calculateSeriesLikeIdentifier } from '../../hooks/useChartColorConfig/utils';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';

/* ------------------------------------------------------------------------
 * 「本图容量」口径：可见系列名收集
 *
 * 色表容量必须与「真正会渲染的系列」对齐。看板侧 computedSeries 来自
 * mergeExistingAndExpectedSeries，它会保留同一 field 分组下已不在当前结果里的
 * 历史 pivot 系列并标记 isFilteredOut（渲染时被 useCartesianChartConfig 剔除）。
 * 这类 stale 系列若计入容量，会挤占调色板（原色 + expandPalette 变体），把
 * 真正渲染的系列挤进「只要求不重复」的生成色兜底，产出肉眼近重复的颜色。
 *
 * 回归背景：卡夫亨氏看板一张按品种枢轴的折线图，__msyColorSync 实测
 * visibleKeys=147 而真正渲染只有十几条——历史品种（如「(永叔公)290g土磨坊
 * 麻油白腐乳」）与当前「类目=酱油」过滤完全矛盾，把 20 色调色板吃光后出现
 * 两条 ΔE00 < 1 的黄线。
 * --------------------------------------------------------------------- */

export type VisibleColorKeysStats = {
    /** 参与取色的可见系列名（插入顺序 = 系列顺序 → pivotDetails 顺序） */
    keys: string[];
    /** CARTESIAN：过滤 isFilteredOut 后真正参与渲染的系列数；其余图表为 null */
    renderedSeriesCount: number | null;
    /** CARTESIAN：因 isFilteredOut 被跳过的历史 pivot 系列数；其余图表为 null */
    skippedFilteredOutCount: number | null;
};

export const collectVisibleColorKeys = ({
    chartConfig,
    computedSeries,
    resultsData,
}: {
    chartConfig: ChartConfig;
    computedSeries: Series[] | undefined;
    resultsData:
        | Pick<InfiniteQueryResults, 'pivotDetails' | 'rows'>
        | undefined;
}): VisibleColorKeysStats => {
    if (chartConfig.type === ChartType.CARTESIAN) {
        const allSeries =
            computedSeries && computedSeries.length > 0
                ? computedSeries
                : chartConfig.config?.eChartsConfig.series;

        let renderedSeriesCount = 0;
        let skippedFilteredOutCount = 0;

        // 用 Set 收集，按插入顺序物化：系列标识先入（渲染顺序），pivot
        // 补齐后入。枢轴系列的 completeIdentifier 本身就是 pivot 值，与
        // pivotDetails 补齐高度重叠；下游 normalizeColorSyncKeys 本就
        // 去重，这里提前收敛只减无谓开销，不改取色顺序语义。
        const keySet = new Set<string>();

        (allSeries ?? []).forEach((series) => {
            // 容量口径只统计会渲染的系列：isFilteredOut 的历史 pivot 系列
            // 渲染时被剔除（useCartesianChartConfig filter(!isFilteredOut)），
            // 不应占色位。两个来源的元素都是 common 的 Series（带该标记），
            // 类型安全；eChartsConfig.series 兜底同样过滤（通常已被上层
            // 过滤，但不能依赖）。
            if (series.isFilteredOut) {
                skippedFilteredOutCount += 1;
                return;
            }
            const completeIdentifier = calculateSeriesLikeIdentifier(series)[1];
            if (completeIdentifier) keySet.add(completeIdentifier);
            renderedSeriesCount += 1;
        });

        // 透视系列名补齐：computedSeries 可能为空（结果为空 / layout 不全）
        // 或与真实渲染的系列形状不一致，此时色表会缺 key，取色回退到
        // getHashColor（无避让）→ 同图撞色。这里直接以透视结果的
        // pivotDetails 为准把本图会出现的系列名全部收进来。
        // pivotDetails.valuesColumns 是当前查询结果的全量透视列（会渲染的
        // 口径）；多 metric × 多列会重复携带同一 pivot 值，同一个 Set
        // 顺带去重（Set 按插入顺序迭代，不改排序语义）。
        resultsData?.pivotDetails?.valuesColumns?.forEach((column) => {
            column.pivotValues?.forEach(({ value }) => {
                if (value !== null && value !== undefined) {
                    keySet.add(String(value));
                }
            });
        });

        return {
            keys: [...keySet],
            renderedSeriesCount,
            skippedFilteredOutCount,
        };
    }

    const keys: string[] = [];

    if (chartConfig.type === ChartType.PIE) {
        const pie = chartConfig.config;
        Object.keys(pie?.groupColorOverrides ?? {}).forEach((name) =>
            keys.push(name),
        );
        Object.keys(pie?.metadata ?? {}).forEach((name) => keys.push(name));
        (pie?.groupSortOverrides ?? []).forEach((name) => keys.push(name));
        const groupFieldIds = pie?.groupFieldIds ?? [];
        keys.push(...pieRowColorKeys(resultsData?.rows, groupFieldIds));
    }

    return { keys, renderedSeriesCount: null, skippedFilteredOutCount: null };
};

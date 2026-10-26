import {
    isDashboardChartTileType,
    type ChartType,
    type Dashboard,
} from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { getSavedQuery } from '../useSavedQuery';

/**
 * 看板每个图表 tile 对应的图表类型。
 * 用于「同步颜色的图表」列表里标注图表类型（自定义图表 / 图表 / 饼图 ...）。
 *
 * 只读取已保存图表的 chartConfig.type，不参与任何配色逻辑。
 * 查询 key 与 DashboardChartTile 共用（['saved_query', uuid]），
 * 已渲染过的图表直接命中缓存，未访问 Tab 的图表按需补拉。
 */
export const useDashboardChartTypeMap = ({
    tiles,
    enabled,
}: {
    tiles: Dashboard['tiles'] | undefined;
    enabled: boolean;
}): Record<string, ChartType> => {
    const chartRefs = (tiles ?? []).flatMap((tile) => {
        if (!isDashboardChartTileType(tile)) return [];
        const savedChartUuid = tile.properties.savedChartUuid;
        if (!savedChartUuid) return [];
        return [{ tileUuid: tile.uuid, savedChartUuid }];
    });

    const queries = useQueries({
        queries: chartRefs.map((ref) => ({
            queryKey: ['saved_query', ref.savedChartUuid],
            queryFn: () => getSavedQuery(ref.savedChartUuid),
            enabled: enabled && Boolean(ref.savedChartUuid),
            retry: false,
        })),
    });

    const typeBySavedChartUuid = new Map<string, ChartType>();
    queries.forEach((query, index) => {
        const type = query.data?.chartConfig?.type;
        const savedChartUuid = chartRefs[index]?.savedChartUuid;
        if (type && savedChartUuid) {
            typeBySavedChartUuid.set(savedChartUuid, type);
        }
    });

    const typeMap: Record<string, ChartType> = {};
    chartRefs.forEach((ref) => {
        const type = typeBySavedChartUuid.get(ref.savedChartUuid);
        if (type) {
            typeMap[ref.tileUuid] = type;
        }
    });
    return typeMap;
};

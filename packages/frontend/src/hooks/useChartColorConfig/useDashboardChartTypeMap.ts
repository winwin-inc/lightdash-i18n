import {
    isDashboardChartTileType,
    type ChartType,
    type Dashboard,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getSavedQuery } from '../useSavedQuery';

/** 图表类型缓存时长：图表类型（chartConfig.type）几乎不变，缓存 5 分钟避免每次打开弹层都 refetch */
const CHART_TYPE_STALE_TIME = 5 * 60 * 1000;

/**
 * 看板每个图表 tile 对应的图表类型。
 * 用于「同步颜色的图表」列表里标注图表类型（自定义图表 / 图表 / 饼图 ...）。
 *
 * 只读取已保存图表的 chartConfig.type，不参与任何配色逻辑。
 * 查询 key 与 DashboardChartTile 共用（['saved_query', uuid]），
 * 已渲染过的图表直接命中缓存，未访问 Tab 的图表按需补拉；
 * 加上 staleTime 后，同一份数据在缓存有效期内不会重复请求。
 */
export const useDashboardChartTypeMap = ({
    tiles,
    enabled,
}: {
    tiles: Dashboard['tiles'] | undefined;
    enabled: boolean;
}): Record<string, ChartType> => {
    const chartRefs = useMemo(
        () =>
            (tiles ?? []).flatMap((tile) => {
                if (!isDashboardChartTileType(tile)) return [];
                const savedChartUuid = tile.properties.savedChartUuid;
                if (!savedChartUuid) return [];
                return [{ tileUuid: tile.uuid, savedChartUuid }];
            }),
        [tiles],
    );

    // 同一个已保存图表可能被多个 tile 复用，去重后只发一次请求
    const uniqueSavedChartUuids = useMemo(
        () => Array.from(new Set(chartRefs.map((ref) => ref.savedChartUuid))),
        [chartRefs],
    );

    const queries = useQueries({
        queries: uniqueSavedChartUuids.map((savedChartUuid) => ({
            queryKey: ['saved_query', savedChartUuid],
            queryFn: () => getSavedQuery(savedChartUuid),
            enabled: enabled && Boolean(savedChartUuid),
            staleTime: CHART_TYPE_STALE_TIME,
            retry: false,
        })),
    });

    // queries 数组每次渲染都是新引用，用「uuid + 类型」的稳定签名作为 useMemo 依赖
    const typeSignature = JSON.stringify(
        uniqueSavedChartUuids.map((savedChartUuid, index) => [
            savedChartUuid,
            queries[index]?.data?.chartConfig?.type ?? null,
        ]),
    );

    const typeMap = useMemo<Record<string, ChartType>>(() => {
        const typeBySavedChartUuid = new Map<string, ChartType>();
        (
            JSON.parse(typeSignature) as Array<[string, ChartType | null]>
        ).forEach(([savedChartUuid, type]) => {
            if (type && savedChartUuid) {
                typeBySavedChartUuid.set(savedChartUuid, type);
            }
        });

        const map: Record<string, ChartType> = {};
        chartRefs.forEach((ref) => {
            const type = typeBySavedChartUuid.get(ref.savedChartUuid);
            if (type) {
                map[ref.tileUuid] = type;
            }
        });
        return map;
    }, [chartRefs, typeSignature]);

    return typeMap;
};

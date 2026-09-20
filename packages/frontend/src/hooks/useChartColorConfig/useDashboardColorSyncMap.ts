import { type Dashboard } from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getSavedQuery } from '../useSavedQuery';
import {
    collectChartColorKeyGroups,
    extractManualColorsFromChartConfig,
    getSyncedSavedChartRefs,
    mergeColorSyncKeys,
    mergeManualColorMaps,
} from './colorSyncKeys';

export type DashboardColorSyncMapResult = {
    manualColors: Record<string, string>;
    knownColorKeys: string[];
    /** 每张图一组系列名，只在组内避让 */
    chartColorKeyGroups: string[][];
};

const EMPTY_RESULT: DashboardColorSyncMapResult = {
    manualColors: {},
    knownColorKeys: [],
    chartColorKeyGroups: [],
};

/**
 * 预取看板全部 Tab 上的已保存图表配置。
 * chartColorKeyGroups：每张图各自的系列名，用于共现避让。
 * knownColorKeys：全部系列名并集（UTF-16 排序）。
 * manualColors：仅用于发现系列名，不再作为配色来源。
 */
export const useDashboardColorSyncMap = ({
    tiles,
    enabled,
    syncChartTileUuids,
}: {
    tiles: Dashboard['tiles'] | undefined;
    enabled: boolean;
    syncChartTileUuids: string[];
}): DashboardColorSyncMapResult => {
    const chartRefs = useMemo(
        () => getSyncedSavedChartRefs(tiles, syncChartTileUuids),
        [tiles, syncChartTileUuids],
    );

    const queries = useQueries({
        queries: chartRefs.map((ref) => ({
            queryKey: ['saved_query', ref.savedChartUuid],
            queryFn: () => getSavedQuery(ref.savedChartUuid),
            enabled: enabled && Boolean(ref.savedChartUuid),
            retry: false,
        })),
    });

    const chartUpdatedAt = queries
        .map((result) => result.dataUpdatedAt)
        .join(',');

    return useMemo(() => {
        if (!enabled) return EMPTY_RESULT;

        const chartColorKeyGroups = collectChartColorKeyGroups(
            queries.map((result) => result.data?.chartConfig),
        );
        const manualColors = mergeManualColorMaps(
            queries.map((result) =>
                result.data
                    ? extractManualColorsFromChartConfig(
                          result.data.chartConfig,
                      )
                    : {},
            ),
        );
        const knownColorKeys = mergeColorSyncKeys([
            ...chartColorKeyGroups,
            Object.keys(manualColors),
        ]);

        return { manualColors, knownColorKeys, chartColorKeyGroups };
        // queries 每轮 render 都是新数组，用 dataUpdatedAt 作为稳定依赖
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, chartRefs, chartUpdatedAt]);
};

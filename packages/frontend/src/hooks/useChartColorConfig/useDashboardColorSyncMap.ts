import { type ChartConfig, type Dashboard } from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import isEqual from 'lodash/isEqual';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export type ColorSyncQuerySnapshot = {
    status: 'loading' | 'error' | 'success';
    fetchStatus: 'fetching' | 'paused' | 'idle';
    chartConfig: ChartConfig | undefined;
};

/** 本轮 saved_query 全部成功或失败后才发布颜色映射 */
export const areColorSyncQueriesSettled = (
    queries: ColorSyncQuerySnapshot[],
): boolean =>
    queries.length > 0 &&
    queries.every(
        (query) =>
            query.fetchStatus === 'idle' &&
            (query.status === 'success' || query.status === 'error'),
    );

export const buildDashboardColorSyncMap = (
    chartConfigs: Array<ChartConfig | undefined>,
): DashboardColorSyncMapResult => {
    const chartColorKeyGroups = collectChartColorKeyGroups(chartConfigs);
    const manualColors = mergeManualColorMaps(
        chartConfigs.map((chartConfig) =>
            chartConfig
                ? extractManualColorsFromChartConfig(chartConfig)
                : {},
        ),
    );

    return {
        manualColors,
        knownColorKeys: mergeColorSyncKeys([
            ...chartColorKeyGroups,
            Object.keys(manualColors),
        ]),
        chartColorKeyGroups,
    };
};

/** 内容不变时复用上一份引用，避免图表无效重绘 */
export const publishColorSyncMap = (
    previous: DashboardColorSyncMapResult,
    next: DashboardColorSyncMapResult,
): DashboardColorSyncMapResult =>
    isEqual(previous, next) ? previous : next;

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
    /** 同步图表列表指纹：区分真正的列表变化，避免 tiles 引用抖动触发重建 */
    const chartRefsKey = useMemo(
        () =>
            chartRefs
                .map((ref) => `${ref.tileUuid}:${ref.savedChartUuid}`)
                .join('|'),
        [chartRefs],
    );

    const queries = useQueries({
        queries: chartRefs.map((ref) => ({
            queryKey: ['saved_query', ref.savedChartUuid],
            queryFn: () => getSavedQuery(ref.savedChartUuid),
            enabled: enabled && Boolean(ref.savedChartUuid),
            retry: false,
        })),
    });

    const querySnapshots: ColorSyncQuerySnapshot[] = queries.map((result) => ({
        status: result.status,
        fetchStatus: result.fetchStatus,
        chartConfig: result.data?.chartConfig,
    }));
    const roundSettled = areColorSyncQueriesSettled(querySnapshots);
    /** 内容指纹：相同 config 的 refetch 不触发重新 build + isEqual */
    const contentKey = querySnapshots
        .map((query) => {
            if (query.status === 'error') return 'error';
            if (query.status !== 'success' || !query.chartConfig) {
                return `${query.status}:${query.fetchStatus}`;
            }
            return JSON.stringify(query.chartConfig);
        })
        .join('|');
    const [published, setPublished] =
        useState<DashboardColorSyncMapResult>(EMPTY_RESULT);
    const publishedRef = useRef(published);

    useEffect(() => {
        if (!enabled || chartRefs.length === 0) {
            if (publishedRef.current !== EMPTY_RESULT) {
                publishedRef.current = EMPTY_RESULT;
                setPublished(EMPTY_RESULT);
            }
            return;
        }

        if (!areColorSyncQueriesSettled(querySnapshots)) return;

        const next = publishColorSyncMap(
            publishedRef.current,
            buildDashboardColorSyncMap(
                querySnapshots.map((query) => query.chartConfig),
            ),
        );
        if (next === publishedRef.current) return;

        publishedRef.current = next;
        setPublished(next);
        // querySnapshots 每轮 render 都是新数组，用 contentKey / chartRefsKey 代表本轮状态
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, chartRefsKey, roundSettled, contentKey]);

    return published;
};

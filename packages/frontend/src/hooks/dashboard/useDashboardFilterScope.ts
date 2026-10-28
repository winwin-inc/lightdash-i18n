import {
    getItemId,
    type DashboardFilterableField,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { useMemo } from 'react';

import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

export type DashboardFilterScope = 'global' | 'tab';

/**
 * 合并多个图表的可筛选字段，按 fieldId 去重
 * （同一数据集被多个图表引用时字段会重复）
 */
export const mergeFilterableFields = (
    fieldSets: (DashboardFilterableField[] | undefined)[],
): DashboardFilterableField[] => {
    const fieldsById = new Map<string, DashboardFilterableField>();
    fieldSets.forEach((fields) => {
        (fields ?? []).forEach((field) => {
            const fieldId = getItemId(field);
            if (!fieldsById.has(fieldId)) {
                fieldsById.set(fieldId, field);
            }
        });
    });
    return Array.from(fieldsById.values());
};

/**
 * 取指定 tab 内图表的可筛选字段（tile -> fields）
 */
export const getTabFilterableFieldsByTileUuid = (
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
    dashboardTiles: DashboardTile[] | undefined,
    activeTabUuid: string | undefined,
): Record<string, DashboardFilterableField[]> => {
    if (!activeTabUuid) return {};

    const tabTileUuids = new Set(
        (dashboardTiles ?? [])
            .filter((tile) => tile.tabUuid === activeTabUuid)
            .map((tile) => tile.uuid),
    );

    return Object.keys(filterableFieldsByTileUuid ?? {}).reduce(
        (acc, tileUuid) => {
            if (tabTileUuids.has(tileUuid)) {
                acc[tileUuid] = filterableFieldsByTileUuid?.[tileUuid] || [];
            }
            return acc;
        },
        {} as Record<string, DashboardFilterableField[]>,
    );
};

/**
 * 按筛选器作用域收窄看板数据。
 *
 * - `global`：整个看板的图表 / 字段（全局筛选器需要能作用于任意 tab 的图表）
 * - `tab`：仅当前 tab 内图表的字段（按 fieldId 去重），避免列出其它 tab 的数据集
 */
export const useDashboardFilterScope = (
    filterScope: DashboardFilterScope,
    activeTabUuid: string | undefined,
) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );

    const appliedDashboardTabs = useMemo((): DashboardTab[] | undefined => {
        if (filterScope === 'global') {
            return dashboardTabs;
        }
        return dashboardTabs?.filter((tab) => tab.uuid === activeTabUuid);
    }, [dashboardTabs, activeTabUuid, filterScope]);

    const appliedDashboardTiles = useMemo((): DashboardTile[] | undefined => {
        if (filterScope === 'global') {
            return dashboardTiles;
        }
        return dashboardTiles?.filter((tile) => tile.tabUuid === activeTabUuid);
    }, [dashboardTiles, activeTabUuid, filterScope]);

    /** 当前作用域下每个图表的可筛选字段 */
    const appliedFilterableFieldsByTileUuid = useMemo(() => {
        if (filterScope === 'global') {
            return filterableFieldsByTileUuid;
        }
        return getTabFilterableFieldsByTileUuid(
            filterableFieldsByTileUuid,
            dashboardTiles,
            activeTabUuid,
        );
    }, [
        filterableFieldsByTileUuid,
        dashboardTiles,
        activeTabUuid,
        filterScope,
    ]);

    /**
     * 当前作用域下所有可筛选字段（按 fieldId 去重）。
     * tab 作用域下只包含本 tab 图表引用的数据集字段。
     */
    const appliedFilterableFields = useMemo((): DashboardFilterableField[] => {
        if (filterScope === 'global') {
            return allFilterableFields ?? [];
        }
        return mergeFilterableFields(
            Object.values(appliedFilterableFieldsByTileUuid ?? {}),
        );
    }, [allFilterableFields, appliedFilterableFieldsByTileUuid, filterScope]);

    /** 当前作用域下 SQL Runner 图表的元数据 */
    const appliedSqlChartTilesMetadata = useMemo(() => {
        if (filterScope === 'global') {
            return sqlChartTilesMetadata;
        }
        return (appliedDashboardTiles ?? []).reduce<
            Record<string, SqlChartTileMetadata>
        >((acc, tile) => {
            const metadata = sqlChartTilesMetadata[tile.uuid];
            if (metadata) {
                acc[tile.uuid] = metadata;
            }
            return acc;
        }, {});
    }, [sqlChartTilesMetadata, appliedDashboardTiles, filterScope]);

    return {
        appliedDashboardTabs,
        appliedDashboardTiles,
        appliedFilterableFieldsByTileUuid,
        appliedFilterableFields,
        appliedSqlChartTilesMetadata,
    };
};

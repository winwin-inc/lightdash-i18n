import { createContext } from 'use-context-selector';

export type DashboardChartColorSyncContextValue = {
    enabled: boolean;
    colorPalette: string[];
    syncChartTileUuids: string[];
    /** 已保存配置里的手配色，first-wins */
    manualColors: Record<string, string>;
    /** 看板已保存配置里出现过的系列名，UTF-16 排序 */
    knownColorKeys: string[];
    /** known 系列名的确定性哈希色（含手配），筛选新系列只避让这些槽 */
    hashAssignments: Record<string, string>;
};

const DashboardChartColorSyncContext =
    createContext<DashboardChartColorSyncContextValue | null>(null);

export default DashboardChartColorSyncContext;

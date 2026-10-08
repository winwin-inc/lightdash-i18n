import { createContext } from 'use-context-selector';

export type DashboardChartColorSyncContextValue = {
    enabled: boolean;
    colorPalette: string[];
    syncChartTileUuids: string[];
    /** 已保存配置里的手配色，first-wins */
    manualColors: Record<string, string>;
    /** 看板已保存配置里出现过的系列名，UTF-16 排序 */
    knownColorKeys: string[];
    /** known + 看板级追加未知名后的合并色表 */
    hashAssignments: Record<string, string>;
    /** 把当前图可见系列名追加进看板色表；切 Tab / 改筛选不清空 */
    registerVisibleColorKeys: (keys: string[]) => void;
};

const DashboardChartColorSyncContext =
    createContext<DashboardChartColorSyncContextValue | null>(null);

export default DashboardChartColorSyncContext;

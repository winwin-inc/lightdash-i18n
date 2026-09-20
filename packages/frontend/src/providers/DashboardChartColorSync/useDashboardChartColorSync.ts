import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { useContext } from 'react';
import { useOrganization } from '../../hooks/organization/useOrganization';
import useDashboardContext from '../Dashboard/useDashboardContext';
import DashboardChartColorSyncContext from './context';

const EMPTY_SYNC = {
    enabled: false,
    colorPalette: [] as string[],
    syncChartTileUuids: [] as string[],
    manualColors: {} as Record<string, string>,
    knownColorKeys: [] as string[],
    hashAssignments: {} as Record<string, string>,
};

const EMPTY_TILE_UUIDS: string[] = [];
const EMPTY_MANUAL_COLORS: Record<string, string> = {};
const EMPTY_HASH_ASSIGNMENTS: Record<string, string> = {};

export const useDashboardChartColorSync = () =>
    useContext(DashboardChartColorSyncContext) ?? EMPTY_SYNC;

export const useDashboardChartTileColorSync = ({
    tileUuid,
    isCustomChart,
    chartColorPalette,
}: {
    tileUuid: string;
    isCustomChart: boolean;
    chartColorPalette: string[];
}): {
    shouldSyncColors: boolean;
    colorPalette: string[];
    manualColors: Record<string, string>;
    hashAssignments: Record<string, string>;
} => {
    const ctx = useContext(DashboardChartColorSyncContext);
    const dashboardConfig = useDashboardContext((c) => c.dashboard?.config);
    const { data: organization } = useOrganization();

    const enabled = ctx?.enabled ?? dashboardConfig?.syncChartColors ?? false;
    const syncChartTileUuids =
        ctx?.syncChartTileUuids ??
        dashboardConfig?.syncChartTileUuids ??
        EMPTY_TILE_UUIDS;
    const manualColors = ctx?.manualColors ?? EMPTY_MANUAL_COLORS;
    const hashAssignments = ctx?.hashAssignments ?? EMPTY_HASH_ASSIGNMENTS;

    const isTileInSyncList =
        syncChartTileUuids.length > 0
            ? syncChartTileUuids.includes(tileUuid)
            : true;
    const shouldSyncColors = Boolean(
        enabled && !isCustomChart && isTileInSyncList,
    );

    const dashboardPalette =
        ctx?.colorPalette && ctx.colorPalette.length > 0
            ? ctx.colorPalette
            : dashboardConfig?.colorPalette;

    const colorPalette = shouldSyncColors
        ? dashboardPalette && dashboardPalette.length > 0
            ? dashboardPalette
            : (organization?.chartColors ?? ECHARTS_DEFAULT_COLORS)
        : chartColorPalette;

    return { shouldSyncColors, colorPalette, manualColors, hashAssignments };
};

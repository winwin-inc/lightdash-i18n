import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { useContext, useContextSelector } from 'use-context-selector';
import { useOrganization } from '../../hooks/organization/useOrganization';
import useDashboardContext from '../Dashboard/useDashboardContext';
import DashboardChartColorSyncContext, {
    type DashboardChartColorSyncContextValue,
} from './context';

const NOOP_REGISTER_VISIBLE_COLOR_KEYS = (_keys: string[]) => undefined;

const EMPTY_SYNC: DashboardChartColorSyncContextValue = {
    enabled: false,
    colorPalette: [],
    syncChartTileUuids: [],
    manualColors: {},
    knownColorKeys: [],
    hashAssignments: {},
    registerVisibleColorKeys: NOOP_REGISTER_VISIBLE_COLOR_KEYS,
};

const EMPTY_TILE_UUIDS: string[] = [];
const EMPTY_MANUAL_COLORS: Record<string, string> = {};
const EMPTY_HASH_ASSIGNMENTS: Record<string, string> = {};
const EMPTY_COLOR_PALETTE: string[] = [];

export const useDashboardChartColorSync = () =>
    useContext(DashboardChartColorSyncContext) ?? EMPTY_SYNC;

export const useRegisterDashboardVisibleColorKeys = () =>
    useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.registerVisibleColorKeys,
    ) ?? NOOP_REGISTER_VISIBLE_COLOR_KEYS;

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
    const enabled = useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.enabled,
    );
    const syncChartTileUuids = useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.syncChartTileUuids,
    );
    const manualColors = useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.manualColors,
    );
    const hashAssignments = useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.hashAssignments,
    );
    const contextPalette = useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.colorPalette,
    );

    const dashboardConfig = useDashboardContext((c) => c.dashboard?.config);
    const { data: organization } = useOrganization();

    const resolvedEnabled =
        enabled ?? dashboardConfig?.syncChartColors ?? false;
    const resolvedSyncChartTileUuids =
        syncChartTileUuids ??
        dashboardConfig?.syncChartTileUuids ??
        EMPTY_TILE_UUIDS;
    const resolvedManualColors = manualColors ?? EMPTY_MANUAL_COLORS;
    const resolvedHashAssignments = hashAssignments ?? EMPTY_HASH_ASSIGNMENTS;

    const isTileInSyncList =
        resolvedSyncChartTileUuids.length > 0
            ? resolvedSyncChartTileUuids.includes(tileUuid)
            : true;
    const shouldSyncColors = Boolean(
        resolvedEnabled && !isCustomChart && isTileInSyncList,
    );

    const dashboardPalette =
        contextPalette && contextPalette.length > 0
            ? contextPalette
            : dashboardConfig?.colorPalette;

    const colorPalette = shouldSyncColors
        ? dashboardPalette && dashboardPalette.length > 0
            ? dashboardPalette
            : (organization?.chartColors ?? ECHARTS_DEFAULT_COLORS)
        : chartColorPalette;

    return {
        shouldSyncColors,
        colorPalette: colorPalette ?? EMPTY_COLOR_PALETTE,
        manualColors: resolvedManualColors,
        hashAssignments: resolvedHashAssignments,
    };
};

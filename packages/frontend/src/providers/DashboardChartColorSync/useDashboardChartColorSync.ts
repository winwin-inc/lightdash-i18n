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
    knownHashAssignments: {},
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
    chartColorPalette,
}: {
    tileUuid: string;
    chartColorPalette: string[];
}): {
    shouldSyncColors: boolean;
    colorPalette: string[];
    manualColors: Record<string, string>;
    knownHashAssignments: Record<string, string>;
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
    const knownHashAssignments = useContextSelector(
        DashboardChartColorSyncContext,
        (ctx) => ctx?.knownHashAssignments,
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
    const resolvedKnownHashAssignments =
        knownHashAssignments ?? EMPTY_HASH_ASSIGNMENTS;

    // 严格白名单：只有被勾选的图表才参与同步。
    // 列表为空 = 没有选中任何图表 = 不发生任何颜色接管。
    const isTileInSyncList = resolvedSyncChartTileUuids.includes(tileUuid);
    // 自定义图表（Vega-Lite）同样参与同步：渲染期把看板色表注入 spec 的 color scale
    const shouldSyncColors = Boolean(resolvedEnabled && isTileInSyncList);

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
        knownHashAssignments: resolvedKnownHashAssignments,
        hashAssignments: resolvedHashAssignments,
    };
};

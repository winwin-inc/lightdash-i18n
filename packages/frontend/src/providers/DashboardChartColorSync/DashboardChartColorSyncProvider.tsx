import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { useMemo, type FC, type PropsWithChildren } from 'react';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { assignKnownHashColors } from '../../hooks/useChartColorConfig/hashColorAssignment';
import { useDashboardColorSyncMap } from '../../hooks/useChartColorConfig/useDashboardColorSyncMap';
import useDashboardContext from '../Dashboard/useDashboardContext';
import DashboardChartColorSyncContext, {
    type DashboardChartColorSyncContextValue,
} from './context';

type DashboardChartColorSyncProviderProps = {
    /** 覆盖已保存的 syncChartColors，用于编辑态即时预览 */
    enabled?: boolean;
    colorPalette?: string[];
    syncChartTileUuids?: string[];
};

const EMPTY_SYNC_TILE_UUIDS: string[] = [];

const DashboardChartColorSyncProvider: FC<
    PropsWithChildren<DashboardChartColorSyncProviderProps>
> = ({ children, enabled, colorPalette, syncChartTileUuids }) => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const tiles = useDashboardContext((c) => c.dashboardTiles);
    const { data: organization } = useOrganization();

    const resolvedEnabled =
        enabled ?? dashboard?.config?.syncChartColors ?? false;
    const resolvedTileUuids =
        syncChartTileUuids ??
        dashboard?.config?.syncChartTileUuids ??
        EMPTY_SYNC_TILE_UUIDS;
    const paletteFromPropsOrConfig =
        colorPalette ?? dashboard?.config?.colorPalette;
    const resolvedPalette =
        paletteFromPropsOrConfig && paletteFromPropsOrConfig.length > 0
            ? paletteFromPropsOrConfig
            : (organization?.chartColors ?? ECHARTS_DEFAULT_COLORS);

    const { manualColors, knownColorKeys, chartColorKeyGroups } =
        useDashboardColorSyncMap({
            tiles,
            enabled: resolvedEnabled,
            syncChartTileUuids: resolvedTileUuids,
        });

    const hashAssignments = useMemo(
        () =>
            assignKnownHashColors(
                knownColorKeys,
                resolvedPalette,
                {},
                chartColorKeyGroups,
            ),
        [knownColorKeys, resolvedPalette, chartColorKeyGroups],
    );

    const value: DashboardChartColorSyncContextValue = useMemo(
        () => ({
            enabled: resolvedEnabled,
            colorPalette: resolvedPalette,
            syncChartTileUuids: resolvedTileUuids,
            manualColors,
            knownColorKeys,
            hashAssignments,
        }),
        [
            resolvedEnabled,
            resolvedPalette,
            resolvedTileUuids,
            manualColors,
            knownColorKeys,
            hashAssignments,
        ],
    );

    return (
        <DashboardChartColorSyncContext.Provider value={value}>
            {children}
        </DashboardChartColorSyncContext.Provider>
    );
};

export default DashboardChartColorSyncProvider;

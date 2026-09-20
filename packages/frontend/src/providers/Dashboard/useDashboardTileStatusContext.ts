// STUB: tile-status context is not split in this fork; bridge from DashboardContext.
import useDashboardContext from './useDashboardContext';

type DashboardTileStatusBridge = {
    invalidateCache: boolean | undefined;
    /** Not tracked separately here — always 0 until DashboardTileStatusProvider is ported. */
    refreshCounter: number;
    /** STUB: embed screenshot settle — no-op until tile status provider is ported. */
    markEmbedTileComplete: (tileUuid: string) => void;
};

function useDashboardTileStatusContext<Selected>(
    selector: (value: DashboardTileStatusBridge) => Selected,
): Selected {
    return useDashboardContext((c) =>
        selector({
            invalidateCache: c.invalidateCache,
            refreshCounter: 0,
            markEmbedTileComplete: () => {
                // STUB
            },
        }),
    );
}

export default useDashboardTileStatusContext;

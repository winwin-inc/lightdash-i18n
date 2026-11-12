import {
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { doesFilterApplyToTile } from '../components/DashboardFilter/FilterConfiguration/utils/doesFilterApplyToTile';
import {
    isFilterEmptyForTileVisibility,
    type CandidateAvailabilityMap,
} from './filterCandidateAvailability';

export const EMPTY_TILE_VISIBILITY_SET: Set<string> = new Set();

/**
 * 返回在查看模式下因为筛选器「无值」而需要隐藏的 tile uuid。
 *
 * - 只考虑开启 `hideTilesWhenEmpty` 的筛选器；
 * - 「任何值」按候选探测结果判定（未知/有候选不隐藏）；
 * - 作用范围与该筛选器实际作用的图表一致（tileTargets + 字段匹配）；
 * - 没有任何命中筛选器时返回共享 `EMPTY_TILE_VISIBILITY_SET`，保持引用稳定。
 */
export const getTileUuidsHiddenByEmptyFilters = ({
    tiles,
    filters,
    filterableFieldsByTileUuid,
    candidateAvailability,
}: {
    tiles: DashboardTile[];
    filters: DashboardFilters;
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    candidateAvailability: CandidateAvailabilityMap | undefined;
}): Set<string> => {
    const hidingFilters = [
        ...filters.dimensions,
        ...filters.metrics,
        ...filters.tableCalculations,
    ].filter((filter) =>
        isFilterEmptyForTileVisibility(filter, candidateAvailability),
    );

    if (hidingFilters.length === 0) {
        return EMPTY_TILE_VISIBILITY_SET;
    }

    const hiddenTileUuids = new Set<string>();
    for (const tile of tiles) {
        if (
            hidingFilters.some((filter) =>
                doesFilterApplyToTile(filter, tile, filterableFieldsByTileUuid),
            )
        ) {
            hiddenTileUuids.add(tile.uuid);
        }
    }

    return hiddenTileUuids;
};

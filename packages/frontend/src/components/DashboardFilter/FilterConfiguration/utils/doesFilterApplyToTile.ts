import {
    assertUnreachable,
    getItemId,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';

/**
 * Describes the relationship between a filter and a tile based on tileTargets.
 * - 'auto': applies to tiles that have the matching field
 * - 'disabled': tile explicitly excluded
 * - 'mapped': tile explicitly included with field mapping
 */
type FilterTileRelation = 'auto' | 'disabled' | 'mapped';

const getFilterTileRelation = (
    filterRule: DashboardFilterRule,
    tileUuid: string,
): {
    relation: FilterTileRelation;
    tileConfig: DashboardFieldTarget | false | undefined;
} => {
    if (!filterRule.tileTargets) {
        return { relation: 'auto', tileConfig: undefined };
    }

    const tileConfig = filterRule.tileTargets[tileUuid];

    if (tileConfig === false) {
        return { relation: 'disabled', tileConfig };
    }

    if (tileConfig && isDashboardFieldTarget(tileConfig)) {
        return { relation: 'mapped', tileConfig };
    }

    return { relation: 'auto', tileConfig: undefined };
};

const tileHasFilterField = (
    filterRule: DashboardFilterRule,
    tile: DashboardTile,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): boolean => {
    if (!filterableFieldsByTileUuid) return false;
    const tileFields = filterableFieldsByTileUuid[tile.uuid];
    return (
        tileFields?.some(
            (field) => getItemId(field) === filterRule.target.fieldId,
        ) ?? false
    );
};

/**
 * Whether a filter applies to a tile (tileTargets + field availability).
 * Used by scheduler filter-requirement tab scoping.
 */
export const doesFilterApplyToTile = (
    filterRule: DashboardFilterRule,
    tile: DashboardTile,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): boolean => {
    const { relation } = getFilterTileRelation(filterRule, tile.uuid);

    switch (relation) {
        case 'auto':
            if (isDashboardDataAppTileType(tile)) return true;
            return tileHasFilterField(
                filterRule,
                tile,
                filterableFieldsByTileUuid,
            );
        case 'disabled':
            return false;
        case 'mapped':
            return true;
        default:
            return assertUnreachable(
                relation,
                `Unknown filter tile relation: ${relation}`,
            );
    }
};

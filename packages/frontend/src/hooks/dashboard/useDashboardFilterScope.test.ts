import { describe, expect, it } from 'vitest';

import {
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';

import {
    getTabFilterableFieldsByTileUuid,
    mergeFilterableFields,
} from './useDashboardFilterScope';

const field = (
    table: string,
    name: string,
    label = name,
): DashboardFilterableField =>
    ({
        fieldType: 'dimension',
        type: 'string',
        name,
        label,
        table,
        tableLabel: table,
        tableReference: table,
        hidden: false,
        index: 0,
    }) as unknown as DashboardFilterableField;

const tile = (uuid: string, tabUuid: string): DashboardTile =>
    ({
        uuid,
        tabUuid,
        type: 'chart',
        x: 0,
        y: 0,
        h: 1,
        w: 1,
    }) as unknown as DashboardTile;

describe('mergeFilterableFields', () => {
    it('dedupes fields with the same id', () => {
        const merged = mergeFilterableFields([
            [field('champions', 'region')],
            [field('champions', 'region'), field('champions', 'date')],
        ]);

        expect(merged.map((f) => `${f.table}_${f.name}`)).toEqual([
            'champions_region',
            'champions_date',
        ]);
    });

    it('keeps fields from different tables', () => {
        const merged = mergeFilterableFields([
            [field('champions', 'region')],
            [field('bases', 'region')],
        ]);

        expect(merged).toHaveLength(2);
    });
});

describe('getTabFilterableFieldsByTileUuid', () => {
    const tiles = [
        tile('tile-1', 'tab-1'),
        tile('tile-2', 'tab-2'),
        tile('tile-3', 'tab-1'),
    ];

    const filterableFieldsByTileUuid = {
        'tile-1': [field('champions', 'region')],
        'tile-2': [field('bases', 'region')],
        'tile-3': [field('champions', 'date')],
    };

    it('only keeps tiles belonging to the given tab', () => {
        const result = getTabFilterableFieldsByTileUuid(
            filterableFieldsByTileUuid,
            tiles,
            'tab-1',
        );

        expect(Object.keys(result)).toEqual(['tile-1', 'tile-3']);
        expect(result['tile-2']).toBeUndefined();
    });

    it('returns an empty result without an active tab', () => {
        const result = getTabFilterableFieldsByTileUuid(
            filterableFieldsByTileUuid,
            tiles,
            undefined,
        );

        expect(result).toEqual({});
    });
});

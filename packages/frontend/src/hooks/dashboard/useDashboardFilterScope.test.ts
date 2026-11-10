import { describe, expect, it } from 'vitest';

import {
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';

import {
    getTabFilterableFieldsByTileUuid,
    getTileEffectiveTabUuid,
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
    } as unknown as DashboardFilterableField);

const tile = (uuid: string, tabUuid: string | undefined): DashboardTile =>
    ({
        uuid,
        tabUuid,
        type: 'chart',
        x: 0,
        y: 0,
        h: 1,
        w: 1,
    } as unknown as DashboardTile);

const tabs = [
    { uuid: 'tab-1', name: 'Tab 1', order: 0 },
    { uuid: 'tab-2', name: 'Tab 2', order: 1 },
];

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

    it('keeps the tile tab while the tab list is not loaded yet', () => {
        // 首屏：Tab 列表还没拿到，tile 带 tabUuid 仍应归属自己的 Tab
        const result = getTabFilterableFieldsByTileUuid(
            filterableFieldsByTileUuid,
            tiles,
            'tab-2',
            [],
        );

        expect(Object.keys(result)).toEqual(['tile-2']);
    });

    it('falls back to the first tab for tiles with a stale tab reference', () => {
        // 脏数据：tile 指向已删除的 Tab —— tab 栏会把它渲染在第一个 Tab，
        // 字段也必须出现在第一个 Tab 的筛选器里
        const dirtyTiles = [tile('tile-1', 'deleted-tab')];
        const fieldsByTile = { 'tile-1': [field('champions', 'region')] };

        const firstTabResult = getTabFilterableFieldsByTileUuid(
            fieldsByTile,
            dirtyTiles,
            'tab-1',
            tabs,
        );
        const secondTabResult = getTabFilterableFieldsByTileUuid(
            fieldsByTile,
            dirtyTiles,
            'tab-2',
            tabs,
        );

        expect(Object.keys(firstTabResult)).toEqual(['tile-1']);
        expect(secondTabResult).toEqual({});
    });

    it('falls back to the first tab for tiles without a tab reference', () => {
        const dirtyTiles = [tile('tile-1', undefined)];
        const fieldsByTile = { 'tile-1': [field('champions', 'region')] };

        const result = getTabFilterableFieldsByTileUuid(
            fieldsByTile,
            dirtyTiles,
            'tab-1',
            tabs,
        );

        expect(Object.keys(result)).toEqual(['tile-1']);
    });
});

describe('getTileEffectiveTabUuid', () => {
    it('returns the tile tab when it exists', () => {
        expect(getTileEffectiveTabUuid(tile('tile-1', 'tab-2'), tabs)).toBe(
            'tab-2',
        );
    });

    it('falls back to the first tab when the tile tab is unknown', () => {
        expect(
            getTileEffectiveTabUuid(tile('tile-1', 'deleted-tab'), tabs),
        ).toBe('tab-1');
        expect(getTileEffectiveTabUuid(tile('tile-1', undefined), tabs)).toBe(
            'tab-1',
        );
    });

    it('keeps the tile tab while the tab list is not loaded yet', () => {
        expect(getTileEffectiveTabUuid(tile('tile-1', 'tab-2'), [])).toBe(
            'tab-2',
        );
    });
});

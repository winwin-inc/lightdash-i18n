import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    EMPTY_TILE_VISIBILITY_SET,
    getTileUuidsHiddenByEmptyFilters,
} from './tileVisibility';

const rule = (
    overrides: Partial<DashboardFilterRule> & Pick<DashboardFilterRule, 'id'>,
): DashboardFilterRule => ({
    target: { fieldId: 'orders_sub_series', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: false,
    label: undefined,
    tileTargets: {},
    ...overrides,
});

const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const tile = (uuid: string): DashboardTile =>
    ({
        uuid,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid: 'tab-1',
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        properties: { title: uuid, savedChartUuid: null },
    } as DashboardTile);

const field = (name: string, table = 'orders'): DashboardFilterableField =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name,
        table,
    } as unknown as DashboardFilterableField);

const tileFields = (uuids: string[]) =>
    Object.fromEntries(uuids.map((uuid) => [uuid, [field('sub_series')]]));

const hidden = ({
    rules,
    tiles,
    availability,
    filterableFieldsByTileUuid,
}: {
    rules: DashboardFilterRule[];
    tiles: DashboardTile[];
    availability?: Record<string, 'has' | 'none'>;
    filterableFieldsByTileUuid?: Record<string, DashboardFilterableField[]>;
}) =>
    getTileUuidsHiddenByEmptyFilters({
        tiles,
        filters: filters(rules),
        filterableFieldsByTileUuid:
            filterableFieldsByTileUuid ?? tileFields(tiles.map((t) => t.uuid)),
        candidateAvailability: availability,
    });

describe('getTileUuidsHiddenByEmptyFilters', () => {
    it('returns the shared empty set when no filter opts in', () => {
        expect(
            hidden({
                rules: [rule({ id: 'f1' })],
                tiles: [tile('t1')],
            }),
        ).toBe(EMPTY_TILE_VISIBILITY_SET);
    });

    it('hides linked tiles when a non-any-value filter has no values', () => {
        expect(
            hidden({
                rules: [rule({ id: 'f1', hideTilesWhenEmpty: true })],
                tiles: [tile('t1'), tile('t2')],
            }),
        ).toEqual(new Set(['t1', 't2']));
    });

    it('keeps tiles visible when the filter has values (single or multi)', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        values: ['a'],
                    }),
                ],
                tiles: [tile('t1')],
            }).size,
        ).toBe(0);
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        values: ['a', 'b'],
                    }),
                ],
                tiles: [tile('t1')],
            }).size,
        ).toBe(0);
    });

    it('hides for any-value only when candidates are known to be empty', () => {
        const rules = [
            rule({
                id: 'f1',
                hideTilesWhenEmpty: true,
                disabled: true,
            }),
        ];
        expect(
            hidden({
                rules,
                tiles: [tile('t1')],
                availability: { f1: 'none' },
            }),
        ).toEqual(new Set(['t1']));
        expect(
            hidden({
                rules,
                tiles: [tile('t1')],
                availability: { f1: 'has' },
            }).size,
        ).toBe(0);
        expect(
            hidden({
                rules,
                tiles: [tile('t1')],
                availability: undefined,
            }).size,
        ).toBe(0);
    });

    it('does not hide for any-value filters that cannot be probed', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        disabled: true,
                        target: {
                            fieldId: 'orders_sub_series',
                            tableName: 'orders',
                            isSqlColumn: true,
                        },
                    }),
                ],
                tiles: [tile('t1')],
                availability: { f1: 'none' },
            }).size,
        ).toBe(0);
    });

    it('does not hide for value-less operators', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        operator: FilterOperator.NULL,
                    }),
                ],
                tiles: [tile('t1')],
            }).size,
        ).toBe(0);
    });

    it('skips tiles where the filter is explicitly disabled', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        tileTargets: { t1: false },
                    }),
                ],
                tiles: [tile('t1'), tile('t2')],
            }),
        ).toEqual(new Set(['t2']));
    });

    it('skips tiles that do not have the filter field (auto relation)', () => {
        expect(
            hidden({
                rules: [rule({ id: 'f1', hideTilesWhenEmpty: true })],
                tiles: [tile('t1'), tile('t2')],
                filterableFieldsByTileUuid: {
                    t1: [field('sub_series')],
                    t2: [field('brand')],
                },
            }),
        ).toEqual(new Set(['t1']));
    });

    it('hides explicitly mapped tiles even when the field is renamed', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        tileTargets: {
                            t1: {
                                fieldId: 'orders_sub_series_renamed',
                                tableName: 'orders',
                            },
                        },
                    }),
                ],
                tiles: [tile('t1')],
                filterableFieldsByTileUuid: {
                    t1: [field('sub_series_renamed')],
                },
            }),
        ).toEqual(new Set(['t1']));
    });

    it('hides when any controlling filter is empty', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'has-value',
                        hideTilesWhenEmpty: true,
                        values: ['a'],
                    }),
                    rule({ id: 'empty', hideTilesWhenEmpty: true }),
                ],
                tiles: [tile('t1')],
                filterableFieldsByTileUuid: {
                    t1: [field('sub_series')],
                },
            }),
        ).toEqual(new Set(['t1']));
    });

    it('ignores availability entries for other filters', () => {
        expect(
            hidden({
                rules: [
                    rule({
                        id: 'f1',
                        hideTilesWhenEmpty: true,
                        disabled: true,
                    }),
                ],
                tiles: [tile('t1')],
                availability: { other: 'none' },
            }).size,
        ).toBe(0);
    });
});

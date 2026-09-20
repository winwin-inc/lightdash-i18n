import {
    CartesianSeriesType,
    ChartType,
    DashboardTileTypes,
    type ChartConfig,
    type Dashboard,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    collectChartColorKeyGroups,
    extractColorSyncKeysFromChartConfig,
    extractManualColorsFromChartConfig,
    getSyncedSavedChartRefs,
    lookupSyncedColor,
    mergeColorSyncKeys,
    mergeManualColorMaps,
    normalizeColorSyncKeys,
    pieRowColorKeys,
    pieSliceColorKey,
    toColorSyncKey,
} from './colorSyncKeys';

describe('toColorSyncKey', () => {
    test('keeps plain series names', () => {
        expect(toColorSyncKey('李子柒')).toBe('李子柒');
        expect(toColorSyncKey('螺蛳王')).toBe('螺蛳王');
        expect(toColorSyncKey('原味')).toBe('原味');
    });

    test('strips aggregate leftover after chinese or ascii colon', () => {
        expect(toColorSyncKey('其他品牌：包含494个')).toBe('其他品牌');
        expect(toColorSyncKey('其他品牌:包含10个')).toBe('其他品牌');
        expect(toColorSyncKey('其他品牌（10个）')).toBe('其他品牌');
    });

    test('does not split real series names on hyphen or underscore', () => {
        expect(toColorSyncKey('李子柒-原味')).toBe('李子柒-原味');
        expect(toColorSyncKey('李子柒-酸辣')).toBe('李子柒-酸辣');
        expect(toColorSyncKey('李子柒-原味')).not.toBe(
            toColorSyncKey('李子柒-酸辣'),
        );
    });
});

describe('pieSliceColorKey / pieRowColorKeys', () => {
    const row = {
        brand: { value: { raw: '其他品牌', formatted: '其他品牌：包含494个' } },
    };

    test('prefers raw over formatted for color key', () => {
        expect(pieSliceColorKey('其他品牌：包含494个', [row], ['brand'])).toBe(
            '其他品牌',
        );
        expect(pieRowColorKeys([row], ['brand'])).toEqual(['其他品牌']);
    });

    test('falls back to formatted name when raw is missing', () => {
        const formattedOnly = {
            brand: { value: { raw: '', formatted: '李子柒-原味' } },
        };
        expect(
            pieSliceColorKey('李子柒-原味', [formattedOnly], ['brand']),
        ).toBe('李子柒-原味');
    });
});

describe('lookupSyncedColor', () => {
    test('matches raw and normalized keys', () => {
        const map = { 螺蛳王: '#ff99cc', 其他品牌: '#cccccc' };
        expect(lookupSyncedColor('螺蛳王', map)).toBe('#ff99cc');
        expect(lookupSyncedColor('其他品牌：包含10个', map)).toBe('#cccccc');
        expect(lookupSyncedColor('不存在', map)).toBeUndefined();
    });
});

describe('extractManualColorsFromChartConfig', () => {
    test('reads pie groupColorOverrides', () => {
        const config: ChartConfig = {
            type: ChartType.PIE,
            config: {
                isDonut: true,
                groupColorOverrides: {
                    螺蛳王: '#ff99cc',
                    '其他品牌：包含3个': '#111111',
                },
            },
        };
        expect(extractManualColorsFromChartConfig(config)).toEqual({
            螺蛳王: '#ff99cc',
            其他品牌: '#111111',
        });
    });

    test('reads pivoted cartesian series colors and skips unpivoted series', () => {
        const config: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'brand', yField: ['sales'] },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'brand' },
                                yRef: {
                                    field: 'sales',
                                    pivotValues: [
                                        { field: 'brand', value: '李子柒' },
                                    ],
                                },
                            },
                            color: '#7b61ff',
                        },
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'brand' },
                                yRef: { field: 'sales' },
                            },
                            color: '#000000',
                        },
                    ],
                },
            },
        };
        expect(extractManualColorsFromChartConfig(config)).toEqual({
            李子柒: '#7b61ff',
        });
    });

    test('reads pivoted cartesian metadata but skips metric-only keys', () => {
        const config: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'brand', yField: ['sales'] },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'brand' },
                                yRef: {
                                    field: 'sales',
                                    pivotValues: [
                                        { field: 'brand', value: '螺蛳王' },
                                    ],
                                },
                            },
                        },
                    ],
                },
                metadata: {
                    'sales.螺蛳王': { color: '#ff99cc' },
                    sales: { color: '#000000' },
                },
            },
        };
        expect(extractManualColorsFromChartConfig(config)).toEqual({
            螺蛳王: '#ff99cc',
        });
    });
});

describe('extractColorSyncKeysFromChartConfig', () => {
    test('collects pie names even when they have no color', () => {
        const config: ChartConfig = {
            type: ChartType.PIE,
            config: {
                isDonut: true,
                groupColorOverrides: { 臭宝: '#abcdef' },
                groupSortOverrides: ['其他品牌：包含494个', '李子柒'],
            },
        };
        expect(extractColorSyncKeysFromChartConfig(config).sort()).toEqual(
            ['其他品牌', '李子柒', '臭宝'].sort(),
        );
    });

    test('collects pivoted cartesian series names without requiring series.color', () => {
        const config: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'brand', yField: ['sales'] },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'brand' },
                                yRef: {
                                    field: 'sales',
                                    pivotValues: [
                                        { field: 'brand', value: '臭宝' },
                                    ],
                                },
                            },
                        },
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'brand' },
                                yRef: { field: 'sales' },
                            },
                        },
                    ],
                },
                metadata: {
                    'sales.其他品牌': { color: '#111111' },
                    sales: { color: '#000000' },
                },
            },
        };
        expect(extractColorSyncKeysFromChartConfig(config).sort()).toEqual(
            ['其他品牌', '臭宝'].sort(),
        );
    });
});

describe('mergeColorSyncKeys', () => {
    test('dedupes and sorts with default UTF-16, not localeCompare', () => {
        expect(
            mergeColorSyncKeys([['臭宝'], ['其他品牌', '臭宝'], ['李子柒']]),
        ).toEqual(['其他品牌', '李子柒', '臭宝'].sort());
    });
});

describe('collectChartColorKeyGroups', () => {
    test('keeps per-chart groups instead of flattening all names', () => {
        const pie: ChartConfig = {
            type: ChartType.PIE,
            config: {
                isDonut: true,
                groupSortOverrides: ['牛肉味', '原味'],
            },
        };
        const bar: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'brand', yField: ['sales'] },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'brand' },
                                yRef: {
                                    field: 'sales',
                                    pivotValues: [
                                        { field: 'brand', value: '臭宝' },
                                    ],
                                },
                            },
                        },
                    ],
                },
                metadata: {
                    'sales.其他品牌': { color: '#111111' },
                },
            },
        };

        expect(collectChartColorKeyGroups([pie, undefined, bar])).toEqual([
            normalizeColorSyncKeys(['牛肉味', '原味']),
            normalizeColorSyncKeys(['臭宝', '其他品牌']),
        ]);
    });
});

describe('mergeManualColorMaps', () => {
    test('first map wins for the same series name', () => {
        expect(
            mergeManualColorMaps([
                { 螺蛳王: '#ff99cc' },
                { 螺蛳王: '#9900ff', 李子柒: '#7b61ff' },
            ]),
        ).toEqual({
            螺蛳王: '#ff99cc',
            李子柒: '#7b61ff',
        });
    });
});

describe('getSyncedSavedChartRefs', () => {
    const chartTile = (
        uuid: string,
        savedChartUuid: string | null,
        tabUuid: string,
    ): Dashboard['tiles'][number] => ({
        uuid,
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 4,
        w: 4,
        tabUuid,
        properties: {
            savedChartUuid,
        },
    });

    test('keeps tile order across tabs and skips unsaved charts', () => {
        const tiles: Dashboard['tiles'] = [
            chartTile('t1', 'c1', 'tab-a'),
            {
                uuid: 'markdown',
                type: DashboardTileTypes.MARKDOWN,
                x: 0,
                y: 0,
                h: 1,
                w: 4,
                tabUuid: 'tab-a',
                properties: { title: '', content: '' },
            },
            chartTile('t2', null, 'tab-b'),
            chartTile('t3', 'c3', 'tab-b'),
        ];

        expect(getSyncedSavedChartRefs(tiles, [])).toEqual([
            { tileUuid: 't1', savedChartUuid: 'c1' },
            { tileUuid: 't3', savedChartUuid: 'c3' },
        ]);
    });

    test('filters by syncChartTileUuids when the list is not empty', () => {
        const tiles: Dashboard['tiles'] = [
            chartTile('t1', 'c1', 'tab-a'),
            chartTile('t3', 'c3', 'tab-b'),
        ];
        expect(getSyncedSavedChartRefs(tiles, ['t3'])).toEqual([
            { tileUuid: 't3', savedChartUuid: 'c3' },
        ]);
    });
});

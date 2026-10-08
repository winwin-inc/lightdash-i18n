import { ChartType, type ChartConfig } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    areColorSyncQueriesSettled,
    buildDashboardColorSyncMap,
    publishColorSyncMap,
    type ColorSyncQuerySnapshot,
    type DashboardColorSyncMapResult,
} from './useDashboardColorSyncMap';

const pieConfig = (name: string): ChartConfig =>
    ({
        type: ChartType.PIE,
        config: {
            groupSortOverrides: [name],
        },
    }) as ChartConfig;

const snapshot = (
    status: ColorSyncQuerySnapshot['status'],
    fetchStatus: ColorSyncQuerySnapshot['fetchStatus'],
    name?: string,
): ColorSyncQuerySnapshot => ({
    status,
    fetchStatus,
    chartConfig: name ? pieConfig(name) : undefined,
});

describe('areColorSyncQueriesSettled', () => {
    it('does not publish while any saved query is still fetching', () => {
        expect(
            areColorSyncQueriesSettled([
                snapshot('success', 'idle', '伊利'),
                snapshot('loading', 'fetching'),
            ]),
        ).toBe(false);
    });

    it('publishes after every query succeeds or fails', () => {
        expect(
            areColorSyncQueriesSettled([
                snapshot('success', 'idle', '伊利'),
                snapshot('error', 'idle'),
            ]),
        ).toBe(true);
    });

    it('does not treat an empty round as settled', () => {
        expect(areColorSyncQueriesSettled([])).toBe(false);
    });
});

describe('buildDashboardColorSyncMap', () => {
    it('keeps successful charts when another query failed', () => {
        const result = buildDashboardColorSyncMap([
            pieConfig('伊利'),
            undefined,
            pieConfig('蒙牛'),
        ]);

        expect(result.knownColorKeys).toEqual(['伊利', '蒙牛']);
        expect(result.chartColorKeyGroups).toEqual([['伊利'], ['蒙牛']]);
    });
});

describe('publishColorSyncMap', () => {
    it('reuses the previous reference when the mapping did not change', () => {
        const previous: DashboardColorSyncMapResult = {
            manualColors: {},
            knownColorKeys: ['伊利'],
            chartColorKeyGroups: [['伊利']],
        };

        expect(
            publishColorSyncMap(previous, {
                manualColors: {},
                knownColorKeys: ['伊利'],
                chartColorKeyGroups: [['伊利']],
            }),
        ).toBe(previous);
    });

    it('publishes a new reference when known color keys change', () => {
        const previous: DashboardColorSyncMapResult = {
            manualColors: {},
            knownColorKeys: ['伊利'],
            chartColorKeyGroups: [['伊利']],
        };
        const next: DashboardColorSyncMapResult = {
            manualColors: {},
            knownColorKeys: ['伊利', '蒙牛'],
            chartColorKeyGroups: [['伊利'], ['蒙牛']],
        };

        expect(publishColorSyncMap(previous, next)).toBe(next);
    });
});

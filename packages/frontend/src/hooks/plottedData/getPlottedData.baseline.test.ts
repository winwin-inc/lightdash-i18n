import { describe, expect, it } from 'vitest';
import {
    BASELINE_MERGED_PIVOT_VALUE,
    getBaselineMergedColumnKey,
    getPivotedData,
    getPivotedDataFromPivotDetails,
    isBaselineMergedPivotValues,
} from './getPlottedData';
import type { PivotReference } from '@lightdash/common';
import type { InfiniteQueryResults } from '../useQueryResults';

/** Each row = one x-axis step; the baseline metric has two pivot columns. */
const PIVOT_DETAILS_RESULTS = {
    rows: [
        {
            'dim_month': { value: { raw: 'M1', formatted: 'M1' } },
            'metric_actual.pro_name.产品A': {
                value: { raw: 10, formatted: '10%' },
            },
            'metric_actual.pro_name.产品B': {
                value: { raw: 20, formatted: '20%' },
            },
            'metric_target.pro_name.产品A': {
                value: { raw: 100, formatted: '100%' },
            },
            'metric_target.pro_name.产品B': {
                value: { raw: 100, formatted: '100%' },
            },
        },
        {
            'dim_month': { value: { raw: 'M2', formatted: 'M2' } },
            'metric_actual.pro_name.产品A': {
                value: { raw: 15, formatted: '15%' },
            },
            'metric_actual.pro_name.产品B': {
                value: { raw: 25, formatted: '25%' },
            },
            // Product A has no baseline value for M2 — first non-null wins.
            'metric_target.pro_name.产品B': {
                value: { raw: 110, formatted: '110%' },
            },
        },
    ],
    pivotDetails: {
        indexColumn: { reference: 'dim_month' },
        groupByColumns: [{ reference: 'pro_name' }],
        valuesColumns: [
            {
                referenceField: 'metric_actual',
                pivotColumnName: 'metric_actual.pro_name.产品A',
                aggregation: 'any',
                pivotValues: [{ referenceField: 'pro_name', value: '产品A' }],
            },
            {
                referenceField: 'metric_actual',
                pivotColumnName: 'metric_actual.pro_name.产品B',
                aggregation: 'any',
                pivotValues: [{ referenceField: 'pro_name', value: '产品B' }],
            },
            {
                referenceField: 'metric_target',
                pivotColumnName: 'metric_target.pro_name.产品A',
                aggregation: 'any',
                pivotValues: [{ referenceField: 'pro_name', value: '产品A' }],
            },
            {
                referenceField: 'metric_target',
                pivotColumnName: 'metric_target.pro_name.产品B',
                aggregation: 'any',
                pivotValues: [{ referenceField: 'pro_name', value: '产品B' }],
            },
        ],
    },
} as unknown as InfiniteQueryResults;

describe('baseline merged columns (按 x 合并基准线)', () => {
    it('getPivotedDataFromPivotDetails: 基准线按 x 合并为一列，取第一个非空值', () => {
        const { rows, rowKeyMap } = getPivotedDataFromPivotDetails(
            PIVOT_DETAILS_RESULTS,
            undefined,
            ['metric_target'],
        );
        const mergedKey = getBaselineMergedColumnKey('metric_target');

        expect(rows).toHaveLength(2);
        expect(rows[0][mergedKey]).toEqual({
            value: { raw: 100, formatted: '100%' },
        });
        // M2: 产品A missing (undefined) → first non-null = 产品B
        expect(rows[1][mergedKey]).toEqual({
            value: { raw: 110, formatted: '110%' },
        });
        // Per-product columns stay untouched for other metrics
        expect(rows[0]['metric_actual.pro_name.产品A']).toBeDefined();
        expect(rows[0]['metric_actual.pro_name.产品B']).toBeDefined();

        // rowKeyMap: merged entry with sentinel pivot values
        const mergedRef = rowKeyMap[mergedKey] as PivotReference;
        expect(mergedRef).toMatchObject({ field: 'metric_target' });
        expect(isBaselineMergedPivotValues(mergedRef.pivotValues)).toBe(true);
        expect(
            mergedRef.pivotValues?.every(
                (pv) => pv.value === BASELINE_MERGED_PIVOT_VALUE,
            ),
        ).toBe(true);
    });

    it('getPivotedDataFromPivotDetails: 无 baselineFieldIds 时行为不变', () => {
        const { rows, rowKeyMap } = getPivotedDataFromPivotDetails(
            PIVOT_DETAILS_RESULTS,
            undefined,
        );
        const mergedKey = getBaselineMergedColumnKey('metric_target');
        expect(rows[0][mergedKey]).toBeUndefined();
        expect(rowKeyMap[mergedKey]).toBeUndefined();
        expect(Object.keys(rowKeyMap)).toHaveLength(4);
    });

    it('getPivotedData（legacy 路径）: 基准线按 x 合并为一列', () => {
        const legacyRows = [
            {
                dim_month: { value: { raw: 'M1', formatted: 'M1' } },
                pro_name: { value: { raw: '产品A', formatted: '产品A' } },
                metric_target: { value: { raw: 100, formatted: '100%' } },
            },
            {
                dim_month: { value: { raw: 'M1', formatted: 'M1' } },
                pro_name: { value: { raw: '产品B', formatted: '产品B' } },
                metric_target: { value: { raw: 100, formatted: '100%' } },
            },
            {
                dim_month: { value: { raw: 'M2', formatted: 'M2' } },
                pro_name: { value: { raw: '产品A', formatted: '产品A' } },
                metric_target: { value: { raw: 105, formatted: '105%' } },
            },
        ];
        const { rows, rowKeyMap } = getPivotedData(
            legacyRows,
            ['pro_name'],
            ['metric_target'],
            ['dim_month'],
            ['metric_target'],
        );
        const mergedKey = getBaselineMergedColumnKey('metric_target');

        // 两行（M1/M2），基准线各合并出一个值
        expect(rows).toHaveLength(2);
        expect(rows[0][mergedKey]).toEqual({
            value: { raw: 100, formatted: '100%' },
        });
        expect(rows[1][mergedKey]).toEqual({
            value: { raw: 105, formatted: '105%' },
        });

        const mergedRef = rowKeyMap[mergedKey] as PivotReference;
        expect(typeof mergedRef).toBe('object');
        expect(isBaselineMergedPivotValues(mergedRef.pivotValues)).toBe(true);
    });

    it('getPivotedData（legacy 路径）: 基准线未参与 pivot（无分组）时不生成合并列', () => {
        const legacyRows = [
            {
                dim_month: { value: { raw: 'M1', formatted: 'M1' } },
                metric_target: { value: { raw: 100, formatted: '100%' } },
            },
        ];
        const { rows, rowKeyMap } = getPivotedData(
            legacyRows,
            [],
            [],
            ['dim_month', 'metric_target'],
            ['metric_target'],
        );
        const mergedKey = getBaselineMergedColumnKey('metric_target');
        expect(rows[0][mergedKey]).toBeUndefined();
        expect(rowKeyMap.metric_target).toBe('metric_target');
    });
});

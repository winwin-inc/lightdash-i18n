import { describe, expect, it } from 'vitest';
import { computeDerivedRows } from './vegaTransformData';

describe('computeDerivedRows', () => {
    it('calculate 出来的列可以复算出来', () => {
        const result = computeDerivedRows(
            [
                { v: 3 },
                { v: -2 },
                { v: 0 },
            ],
            [
                {
                    as: '_sign',
                    calculate: "datum.v > 0 ? 'up' : (datum.v < 0 ? 'down' : 'zero')",
                },
            ],
        );
        expect(result).toEqual([
            { v: 3, _sign: 'up' },
            { v: -2, _sign: 'down' },
            { v: 0, _sign: 'zero' },
        ]);
    });

    it('fold 会把多列折成长表', () => {
        const result = computeDerivedRows(
            [{ a: 1, b: 2 }],
            [{ fold: ['a', 'b'], as: ['key', 'value'] }],
        );
        expect(result).toEqual([
            { a: 1, b: 2, key: 'a', value: 1 },
            { a: 1, b: 2, key: 'b', value: 2 },
        ]);
    });

    it('filter 会先过滤再计算', () => {
        const result = computeDerivedRows(
            [
                { v: 3 },
                { v: -2 },
            ],
            [
                { filter: 'datum.v < 0' },
                { as: '_sign', calculate: "'down'" },
            ],
        );
        expect(result).toEqual([{ v: -2, _sign: 'down' }]);
    });

    it('joinaggregate 会按分组聚合出派生列', () => {
        const result = computeDerivedRows(
            [
                { g: 'a', v: 1 },
                { g: 'a', v: 2 },
                { g: 'b', v: 5 },
            ],
            [
                {
                    joinaggregate: [
                        { op: 'sum', field: 'v', as: '_total' },
                        { op: 'max', field: 'v', as: '_max' },
                    ],
                    groupby: ['g'],
                },
            ],
        );
        expect(result).toEqual([
            { g: 'a', v: 1, _total: 3, _max: 2 },
            { g: 'a', v: 2, _total: 3, _max: 2 },
            { g: 'b', v: 5, _total: 5, _max: 5 },
        ]);
    });

    it('空 transform 直接返回原始数据', () => {
        const rows = [{ v: 1 }];
        expect(computeDerivedRows(rows, [])).toBe(rows);
    });

    it('不合法的 transform → 返回 null（不猜）', () => {
        expect(
            computeDerivedRows([{ v: 1 }], [{ calculate: 'datum.' }]),
        ).toBeNull();
    });

    it('引用了不存在的数据集的 transform → 返回 null', () => {
        expect(
            computeDerivedRows([{ v: 1 }], [
                {
                    lookup: 'other',
                    from: {
                        data: { name: 'missing' },
                        key: 'v',
                        fields: ['x'],
                    },
                    as: 'x',
                },
            ]),
        ).toBeNull();
    });

    it('数据量超过上限 → 返回 null', () => {
        const rows = new Array(100001).fill({ v: 1 });
        expect(
            computeDerivedRows(rows, [{ as: '_x', calculate: '1' }]),
        ).toBeNull();
    });
});

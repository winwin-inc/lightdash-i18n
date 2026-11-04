import {
    DEFAULT_MAX_PIVOT_CELLS,
    getPivotExportLimits,
    getPivotExportWidth,
} from './exportLimits';

describe('getPivotExportWidth', () => {
    it('keeps the input width when there is no pivot', () => {
        expect(
            getPivotExportWidth({
                fieldCount: 17,
                pivotTotalColumnCount: null,
                maxColumnLimit: 150,
            }),
        ).toBe(17);
    });
});

describe('getPivotExportLimits', () => {
    it('keeps the configured cell limit when it fits the memory budget', () => {
        const limits = getPivotExportLimits(17, 1_000_000, 2_000_000);

        expect(limits.effectiveCells).toBe(1_000_000);
        expect(limits.maxRows).toBe(58_823); // floor(1_000_000 / 17)
        expect(limits.clamped).toBe(false);
    });

    it('clamps a 1M-row pivot export down to the memory budget instead of OOM', () => {
        // Pre-prod used csvCellsLimit = 10,000,000 → ~588k rows × 17 fields, several GB.
        const limits = getPivotExportLimits(
            17,
            10_000_000,
            DEFAULT_MAX_PIVOT_CELLS,
        );

        expect(limits.effectiveCells).toBe(DEFAULT_MAX_PIVOT_CELLS);
        expect(limits.maxRows).toBe(117_647); // floor(2_000_000 / 17)
        expect(limits.clamped).toBe(true);
    });

    it('never divides by zero when the field list is empty', () => {
        const limits = getPivotExportLimits(0, 1_000_000, 2_000_000);

        expect(limits.maxRows).toBe(1_000_000);
    });

    it('sizes the budget by the pivot output width, not the input row width', () => {
        expect(
            getPivotExportWidth({
                fieldCount: 17,
                pivotTotalColumnCount: 120,
                maxColumnLimit: 150,
            }),
        ).toBe(120);

        // No pivot information (or a narrow pivot) falls back to the input width.
        expect(
            getPivotExportWidth({
                fieldCount: 17,
                pivotTotalColumnCount: null,
                maxColumnLimit: 150,
            }),
        ).toBe(17);

        // The output matrix never exceeds the configured column limit.
        expect(
            getPivotExportWidth({
                fieldCount: 17,
                pivotTotalColumnCount: 900,
                maxColumnLimit: 150,
            }),
        ).toBe(150);
    });
});

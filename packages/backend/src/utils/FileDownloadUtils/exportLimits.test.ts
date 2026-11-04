import { DEFAULT_MAX_PIVOT_CELLS, getPivotExportLimits } from './exportLimits';

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
});

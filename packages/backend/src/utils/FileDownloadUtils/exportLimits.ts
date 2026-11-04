/**
 * Row budgets for exports that materialise the whole result in memory.
 *
 * Non-pivot CSV/XLSX exports stream from the results file, so their only limit is
 * `EXPORT_MAX_ROWS` / `EXCEL_ROW_LIMIT`. Pivot exports are different: the pivot
 * matrix has to be built in memory (`rows` array + `string[][]` of formatted cells),
 * which costs a few KB per row. With `LIGHTDASH_CSV_CELLS_LIMIT=10000000` that was
 * ~590k rows for a 17-column table and several GB of heap — enough to get the pod
 * OOMKilled mid-export.
 *
 * `EXPORT_MAX_PIVOT_CELLS` caps that materialised set at a size the pod can survive.
 * It only ever *tightens* `LIGHTDASH_CSV_CELLS_LIMIT`; the existing "truncated"
 * behaviour is unchanged, the export just stops earlier and is flagged as truncated.
 */
export const DEFAULT_MAX_PIVOT_CELLS = 2_000_000;

/**
 * Width used to size the pivot budget.
 *
 * `fieldCount` is the *input* row width; a pivoted export is as wide as its output
 * matrix (`pivotTotalColumnCount`, capped by `pivotTable.maxColumnLimit`). Using the
 * input width for a wide pivot underestimates the materialised matrix by that factor.
 */
export const getPivotExportWidth = ({
    fieldCount,
    pivotTotalColumnCount,
    maxColumnLimit,
}: {
    fieldCount: number;
    pivotTotalColumnCount: number | null | undefined;
    maxColumnLimit: number;
}): number => {
    const inputWidth = Math.max(fieldCount, 1);
    if (!pivotTotalColumnCount || pivotTotalColumnCount <= 0) {
        return inputWidth;
    }
    return Math.max(
        inputWidth,
        Math.min(pivotTotalColumnCount, Math.max(maxColumnLimit, inputWidth)),
    );
};

export type PivotExportLimits = {
    /** cells actually allowed to be materialised */
    effectiveCells: number;
    /** rows that may be collected before truncating */
    maxRows: number;
    /** the configured cap was tightened by the memory budget */
    clamped: boolean;
};

export const getPivotExportLimits = (
    fieldCount: number,
    cellsLimit: number,
    maxPivotCells: number = DEFAULT_MAX_PIVOT_CELLS,
): PivotExportLimits => {
    // A pivot export with zero columns would divide by zero; the callers fall back to
    // 100k cells when the config is missing, so keep the same defensive shape here.
    const columns = Math.max(fieldCount, 1);
    const effectiveCells = Math.min(cellsLimit, maxPivotCells);

    return {
        effectiveCells,
        maxRows: Math.floor(effectiveCells / columns),
        clamped: effectiveCells < cellsLimit,
    };
};

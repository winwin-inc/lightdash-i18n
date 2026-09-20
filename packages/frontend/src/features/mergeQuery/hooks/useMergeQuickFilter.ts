/**
 * Upstream quick-filter helpers for merge cells. Not wired in this fork —
 * QuickFilterOperator / targetFieldId APIs are absent. Kept as a stub so the
 * warehouse merge configure→run→save loop compiles without compose/quick-filter.
 */
export const applyMergeQuickFilter = (): never => {
    throw new Error('Merge quick filters are not available in this fork');
};

export const useMergeQuickFilter = () => ({
    applyQuickFilter: applyMergeQuickFilter,
});

/**
 * ECharts `getOption()` normalizes `dataset: {id, source}` (single object)
 * into `dataset: [{id, source}]` (array). However, the series are not
 * rewritten to point at the named dataset, so when the option is replayed
 * elsewhere, every series looks for a default dataset (id = "") that no
 * longer exists and renders no data.
 *
 * Patch the option so it is self-contained:
 * - when there is exactly one named dataset and the series don't reference
 *   it, add `datasetId` to each series that is missing it.
 */
export const prepareEchartsOptionForClipboard = (
    option: Record<string, unknown>,
): Record<string, unknown> => {
    const dataset = option.dataset;
    if (!Array.isArray(dataset) || dataset.length !== 1) {
        return option;
    }
    const only = dataset[0] as { id?: unknown };
    const targetId = typeof only.id === 'string' ? only.id : undefined;
    if (!targetId) {
        return option;
    }
    const series = option.series;
    if (!Array.isArray(series) || series.length === 0) {
        return option;
    }
    const patchedSeries = series.map((s) => {
        if (!s || typeof s !== 'object') return s;
        const item = s as Record<string, unknown>;
        if ('datasetId' in item && item.datasetId !== undefined) {
            return s;
        }
        return { ...item, datasetId: targetId };
    });
    return { ...option, series: patchedSeries };
};

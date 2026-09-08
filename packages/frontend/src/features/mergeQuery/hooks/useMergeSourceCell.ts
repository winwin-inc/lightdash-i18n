import {
    type MergeFieldOrigins,
    type ResultValue,
} from '@lightdash/common';

/**
 * Maps merged field values back to a source's field ids. Upstream also
 * exposes a cell-drill hook that depends on MetricQueryDataSource APIs not
 * present in this fork; only the pure mapper is kept for potential reuse.
 */
export const getMergeSourceFieldValues = (
    fieldOrigins: MergeFieldOrigins,
    fieldValues: Record<string, ResultValue>,
    sourceId: string,
): Record<string, ResultValue> =>
    Object.entries(fieldValues).reduce<Record<string, ResultValue>>(
        (sourceValues, [mergedFieldId, value]) => {
            const origin = fieldOrigins[mergedFieldId];
            if (origin?.kind === 'source' && origin.sourceId === sourceId) {
                sourceValues[origin.sourceFieldId] = value;
            } else if (origin?.kind === 'joinKey') {
                const sourceFieldId = origin.fieldIdBySourceId[sourceId];
                if (sourceFieldId) sourceValues[sourceFieldId] = value;
            }
            return sourceValues;
        },
        {},
    );

/** Cell drill into a merge source is not ported for this warehouse-only merge cut. */
export const useMergeSourceCell = () => ({
    resolveMergeSourceCell: async () => null,
});

import {
    formatItemValue,
    hashFieldReference,
    type ApiQueryResults,
    type FieldId,
    type ItemsMap,
    type PivotReference,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import type { InfiniteQueryResults } from '../useQueryResults';

export type PivotValueMap = {
    [pivotKey: string]: Record<string, ResultValue>;
};
export type RowKeyMap = Record<string, FieldId | PivotReference>;

/**
 * Sentinel pivot value for the synthetic merged column of a baseline metric.
 * When a baseline metric is pivoted (e.g. by product), all its pivot columns
 * carry the same value per x-axis step, so they collapse into one column.
 */
export const BASELINE_MERGED_PIVOT_VALUE = '__lightdash_baseline_merged__';

/** Synthetic dataset column key for a merged baseline metric. */
export const getBaselineMergedColumnKey = (fieldId: string): string =>
    `__baseline_merged__:${fieldId}`;

export const isBaselineMergedPivotValues = (
    pivotValues: { value: unknown }[] | undefined,
): boolean =>
    !!pivotValues?.length &&
    pivotValues.every((pv) => pv.value === BASELINE_MERGED_PIVOT_VALUE);

/**
 * Builds the synthetic merged column + rowKeyMap entry for baseline metric
 * fields. For each baseline field, every x-axis row takes the first non-null
 * value across that field's pivot columns (baseline values only depend on the
 * x axis, not on the pivot dimension).
 */
const applyBaselineMergedColumns = ({
    rows,
    rowKeyMap,
    baselineFieldIds,
}: {
    rows: ApiQueryResults['rows'];
    rowKeyMap: RowKeyMap;
    baselineFieldIds?: string[];
}): { rows: ApiQueryResults['rows']; rowKeyMap: RowKeyMap } => {
    if (!baselineFieldIds?.length) return { rows, rowKeyMap };

    const mergedKeysByField = baselineFieldIds.reduce<
        { field: string; mergedKey: string; memberKeys: string[] }[]
    >((acc, field) => {
        if (!baselineFieldIds.includes(field)) return acc;
        const memberKeys = Object.entries(rowKeyMap)
            .filter(
                ([key, ref]) =>
                    key !== getBaselineMergedColumnKey(field) &&
                    typeof ref === 'object' &&
                    ref !== null &&
                    'pivotValues' in ref &&
                    (ref as PivotReference).field === field &&
                    !isBaselineMergedPivotValues(
                        (ref as PivotReference).pivotValues,
                    ),
            )
            .map(([key]) => key);
        if (memberKeys.length === 0) return acc;
        acc.push({
            field,
            mergedKey: getBaselineMergedColumnKey(field),
            memberKeys,
        });
        return acc;
    }, []);

    if (mergedKeysByField.length === 0) return { rows, rowKeyMap };

    const nextRowKeyMap = { ...rowKeyMap };
    mergedKeysByField.forEach(({ field, mergedKey, memberKeys }) => {
        const firstMember = rowKeyMap[memberKeys[0]];
        const pivotKeys =
            firstMember && typeof firstMember === 'object'
                ? ((firstMember as PivotReference).pivotValues ?? []).map(
                      (pv) => pv.field,
                  )
                : [];
        nextRowKeyMap[mergedKey] = {
            field,
            pivotValues: pivotKeys.map((pk) => ({
                field: pk,
                value: BASELINE_MERGED_PIVOT_VALUE,
            })),
        };
    });

    const nextRows = rows.map((row) => {
        const nextRow = { ...row };
        mergedKeysByField.forEach(({ mergedKey, memberKeys }) => {
            const firstValue = memberKeys
                .map((key) => nextRow[key])
                .find(
                    (cell) =>
                        cell !== undefined &&
                        cell !== null &&
                        cell?.value?.raw !== null &&
                        cell?.value?.raw !== undefined,
                );
            if (firstValue !== undefined) {
                nextRow[mergedKey] = firstValue;
            }
        });
        return nextRow;
    });

    return { rows: nextRows, rowKeyMap: nextRowKeyMap };
};

export const getPivotedData = (
    rows: ApiQueryResults['rows'],
    pivotKeys: string[],
    keysToPivot: string[],
    keysToNotPivot: string[],
    baselineFieldIds?: string[],
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: Record<string, FieldId | PivotReference>;
    rows: ApiQueryResults['rows'];
} => {
    const pivotValuesMap: PivotValueMap = {};
    const rowKeyMap: Record<string, FieldId | PivotReference> = {};
    const pivotedRowMap = rows.reduce<Record<string, ResultRow>>((acc, row) => {
        const unpivotedKeysAndValues: string[] = [];

        const pivotedRow: ResultRow = {};
        Object.entries(row).forEach(([key, value]) => {
            if (keysToPivot.includes(key)) {
                const pivotReference: PivotReference = {
                    field: key,
                    pivotValues: pivotKeys.map((pivotKey) => ({
                        field: pivotKey,
                        value: row[pivotKey]?.value.raw,
                    })),
                };
                const pivotedKeyHash: string =
                    hashFieldReference(pivotReference);
                pivotKeys.forEach((pivotKey) => {
                    if (!pivotValuesMap[pivotKey]) {
                        pivotValuesMap[pivotKey] = {};
                    }

                    pivotValuesMap[pivotKey][`${row[pivotKey]?.value.raw}`] =
                        row[pivotKey]?.value;
                });
                pivotedRow[pivotedKeyHash] = value;
                rowKeyMap[pivotedKeyHash] = pivotReference;
            }
            if (keysToNotPivot.includes(key)) {
                unpivotedKeysAndValues.push(key, `${value.value.raw}`);
                pivotedRow[key] = value;
                rowKeyMap[key] = key;
            }
        });

        const unpivotedHash = unpivotedKeysAndValues.join('.');
        return {
            ...acc,
            [unpivotedHash]: { ...(acc[unpivotedHash] || {}), ...pivotedRow },
        };
    }, {});

    const merged = applyBaselineMergedColumns({
        rows: Object.values(pivotedRowMap),
        rowKeyMap,
        baselineFieldIds,
    });

    return {
        pivotValuesMap,
        rowKeyMap: merged.rowKeyMap,
        rows: merged.rows,
    };
};

export const getPlottedData = (
    rows: ApiQueryResults['rows'] | undefined,
    pivotDimensions: string[] | undefined,
    pivotedKeys: string[] | undefined,
    nonPivotedKeys: string[] | undefined,
    baselineFieldIds?: string[],
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: Record<string, FieldId | PivotReference>;
    rows: ApiQueryResults['rows'];
} => {
    if (!rows) {
        return { pivotValuesMap: {}, rowKeyMap: {}, rows: [] };
    }
    if (
        pivotDimensions &&
        pivotDimensions.length > 0 &&
        pivotedKeys &&
        nonPivotedKeys
    ) {
        return getPivotedData(
            rows,
            pivotDimensions,
            pivotedKeys,
            nonPivotedKeys,
            baselineFieldIds,
        );
    }
    return { pivotValuesMap: {}, rowKeyMap: {}, rows };
};

export const getPivotedDataFromPivotDetails = (
    resultsData: InfiniteQueryResults | undefined,
    itemsMap: ItemsMap | undefined,
    baselineFieldIds?: string[],
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: RowKeyMap;
    rows: ApiQueryResults['rows'];
} => {
    if (!resultsData) {
        return {
            pivotValuesMap: {},
            rowKeyMap: {},
            rows: [],
        };
    }

    const { pivotDetails, rows } = resultsData;

    if (!pivotDetails) {
        return {
            pivotValuesMap: {},
            rowKeyMap: {},
            rows,
        };
    }

    const pivotValuesMap: PivotValueMap = pivotDetails.valuesColumns.reduce(
        (acc, column) => {
            column.pivotValues.forEach((value) => {
                const field = itemsMap?.[value.referenceField];
                acc[value.referenceField] = {
                    ...acc[value.referenceField],
                    [String(value.value)]: {
                        raw: value.value,
                        formatted: formatItemValue(field, value.value),
                    },
                };
            });
            return acc;
        },
        {} as PivotValueMap,
    );

    const rowKeyMap: RowKeyMap = pivotDetails.valuesColumns.reduce(
        (acc, column) => {
            acc[column.pivotColumnName] = {
                field: column.referenceField,
                pivotValues: column.pivotValues.map((value) => ({
                    field: value.referenceField,
                    value: value.value,
                })),
            };
            return acc;
        },
        {} as RowKeyMap,
    );

    const merged = applyBaselineMergedColumns({
        rows,
        rowKeyMap,
        baselineFieldIds,
    });

    return {
        rows: merged.rows,
        pivotValuesMap,
        rowKeyMap: merged.rowKeyMap,
    };
};

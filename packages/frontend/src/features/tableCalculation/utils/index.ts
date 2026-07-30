import { snakeCaseName, type TableCalculation } from '@lightdash/common';

const TABLE_CALCULATION_NAME_FALLBACK = 'table_calculation';

/**
 * Derive a stable internal id from a table calculation display name.
 * Purely non-Latin names (e.g. Chinese) become "_" via snakeCaseName; fall
 * back so we never persist ids like "_" / "_2".
 */
export const getTableCalculationBaseName = (name: string): string => {
    const raw = snakeCaseName(name);
    return /[a-zA-Z]/.test(raw) ? raw : TABLE_CALCULATION_NAME_FALLBACK;
};

export const getUniqueTableCalculationName = (
    name: string,
    tableCalculations: TableCalculation[],
    excludeTableCalc?: TableCalculation,
): string => {
    const snakeName = getTableCalculationBaseName(name);
    const suffixes = Array.from(Array(100).keys());
    const getCalcName = (suffix: number) =>
        suffix === 0 ? snakeName : `${snakeName}_${suffix}`;

    // Filter out the table calculation we're currently editing
    const otherTableCalculations = excludeTableCalc
        ? tableCalculations.filter((tc) => tc.name !== excludeTableCalc.name)
        : tableCalculations;

    const validSuffix = suffixes.find(
        (suffix) =>
            otherTableCalculations.findIndex(
                ({ name: tableCalcName }) =>
                    tableCalcName === getCalcName(suffix),
            ) === -1,
    );
    if (validSuffix === undefined) {
        throw new Error(`Table calculation ID "${name}" already exists.`);
    }
    return getCalcName(validSuffix);
};

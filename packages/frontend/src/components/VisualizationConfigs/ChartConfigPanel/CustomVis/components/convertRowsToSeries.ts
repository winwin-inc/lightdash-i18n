import { type ResultRow } from '@lightdash/common';

export const convertRowsToSeries = (rows: ResultRow[]) => {
    if (rows.length === 0) return [];

    const result = new Array(rows.length);

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const convertedRow: { [k: string]: unknown } = {};

        for (const key in row) {
            if (row.hasOwnProperty(key)) {
                convertedRow[key] = row[key].value.raw;
            }
        }

        result[i] = convertedRow;
    }

    return result;
};

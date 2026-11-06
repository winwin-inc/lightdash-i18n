/** Column width constraints shared by the HTML table and the VTable pivot table. */
export const MIN_COLUMN_WIDTH = 50;
export const MAX_COLUMN_WIDTH = 1200;

/** Keeps a width inside the supported range and rounds it to whole pixels. */
export const clampColumnWidth = (width: number): number =>
    Math.round(Math.min(Math.max(width, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH));

/** `null`/`undefined`/`NaN` friendly variant used when reading persisted data. */
export const isValidColumnWidth = (width: unknown): width is number =>
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width >= MIN_COLUMN_WIDTH &&
    width <= MAX_COLUMN_WIDTH;

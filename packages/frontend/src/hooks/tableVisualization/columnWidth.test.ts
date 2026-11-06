import { describe, expect, it } from 'vitest';
import {
    clampColumnWidth,
    isValidColumnWidth,
    MAX_COLUMN_WIDTH,
    MIN_COLUMN_WIDTH,
} from './columnWidth';

describe('clampColumnWidth', () => {
    it('rounds to whole pixels', () => {
        expect(clampColumnWidth(120.4)).toBe(120);
        expect(clampColumnWidth(120.6)).toBe(121);
    });

    it('clamps below the minimum', () => {
        expect(clampColumnWidth(0)).toBe(MIN_COLUMN_WIDTH);
        expect(clampColumnWidth(-40)).toBe(MIN_COLUMN_WIDTH);
    });

    it('clamps above the maximum', () => {
        expect(clampColumnWidth(99999)).toBe(MAX_COLUMN_WIDTH);
    });

    it('keeps values inside the range untouched', () => {
        expect(clampColumnWidth(180)).toBe(180);
    });
});

describe('isValidColumnWidth', () => {
    it('accepts numbers inside the range', () => {
        expect(isValidColumnWidth(MIN_COLUMN_WIDTH)).toBe(true);
        expect(isValidColumnWidth(320)).toBe(true);
        expect(isValidColumnWidth(MAX_COLUMN_WIDTH)).toBe(true);
    });

    it('rejects non numbers and out of range values', () => {
        expect(isValidColumnWidth('180')).toBe(false);
        expect(isValidColumnWidth(null)).toBe(false);
        expect(isValidColumnWidth(undefined)).toBe(false);
        expect(isValidColumnWidth(Number.NaN)).toBe(false);
        expect(isValidColumnWidth(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isValidColumnWidth(MIN_COLUMN_WIDTH - 1)).toBe(false);
        expect(isValidColumnWidth(MAX_COLUMN_WIDTH + 1)).toBe(false);
    });
});

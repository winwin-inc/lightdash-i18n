import {
    rowsToScalarFlat,
    unwrapScalarCell,
} from './flatRows';

describe('rowsToScalarFlat', () => {
    const nestedRows = [
        {
            orders_status: { value: { raw: 'completed', formatted: 'completed' } },
            orders_total_revenue: { value: { raw: 100, formatted: '100.00' } },
        },
    ];

    it('flattens nested cells and returns raw by default', () => {
        expect(rowsToScalarFlat(nestedRows)).toEqual([
            { orders_status: 'completed', orders_total_revenue: 100 },
        ]);
    });

    it('returns formatted when valueFormat is formatted', () => {
        expect(rowsToScalarFlat(nestedRows, 'formatted')).toEqual([
            { orders_status: 'completed', orders_total_revenue: '100.00' },
        ]);
    });

    it('falls back to raw when formatted is missing', () => {
        expect(
            rowsToScalarFlat(
                [{ revenue: { value: { raw: 42 } } }],
                'formatted',
            ),
        ).toEqual([{ revenue: 42 }]);
    });

    it('accepts bare { raw, formatted } cells without throwing', () => {
        expect(
            rowsToScalarFlat([{ status: { raw: 'pending', formatted: 'Pending' } }]),
        ).toEqual([{ status: 'pending' }]);
    });

    it('passes plain scalar cells through', () => {
        expect(rowsToScalarFlat([{ status: 'pending' }])).toEqual([
            { status: 'pending' },
        ]);
    });

    it('returns an empty array for non-array input', () => {
        expect(rowsToScalarFlat(undefined)).toEqual([]);
        expect(rowsToScalarFlat(null)).toEqual([]);
        expect(rowsToScalarFlat({})).toEqual([]);
    });
});

describe('unwrapScalarCell', () => {
    it('extracts the nested value object', () => {
        expect(
            unwrapScalarCell({ value: { raw: 1, formatted: '1.00' } }),
        ).toEqual({ raw: 1, formatted: '1.00' });
    });

    it('formats scalar formatted values as strings', () => {
        expect(unwrapScalarCell({ value: { raw: 1, formatted: 1 } })).toEqual({
            raw: 1,
            formatted: '1',
        });
    });

    it('keeps plain scalars as raw with a string formatted pair', () => {
        expect(unwrapScalarCell('done')).toEqual({
            raw: 'done',
            formatted: 'done',
        });
        expect(unwrapScalarCell(null)).toEqual({
            raw: null,
            formatted: null,
        });
    });
});

import { mergeDashboardSorts } from './sorts';

describe('mergeDashboardSorts', () => {
    it('returns the chart sorts when the dashboard has none', () => {
        const chartSorts = [{ fieldId: 'orders_format', descending: false }];
        expect(mergeDashboardSorts(chartSorts, [])).toBe(chartSorts);
    });

    it('keeps the custom value order of the chart when the dashboard overrides the direction', () => {
        expect(
            mergeDashboardSorts(
                [
                    {
                        fieldId: 'orders_format',
                        descending: false,
                        valueOrder: ['大卖场', '小超市'],
                    },
                ],
                [{ fieldId: 'orders_format', descending: true }],
            ),
        ).toEqual([
            {
                fieldId: 'orders_format',
                descending: true,
                valueOrder: ['大卖场', '小超市'],
            },
        ]);
    });

    it('keeps the nulls position of the chart', () => {
        expect(
            mergeDashboardSorts(
                [{ fieldId: 'orders_id', descending: false, nullsFirst: false }],
                [{ fieldId: 'orders_id', descending: true }],
            ),
        ).toEqual([
            { fieldId: 'orders_id', descending: true, nullsFirst: false },
        ]);
    });

    it('lets the dashboard sort win when it already defines the properties', () => {
        expect(
            mergeDashboardSorts(
                [{ fieldId: 'a', descending: false, valueOrder: ['x'] }],
                [{ fieldId: 'a', descending: true, valueOrder: ['y'] }],
            ),
        ).toEqual([{ fieldId: 'a', descending: true, valueOrder: ['y'] }]);
    });

    it('keeps dashboard sorts for fields that are not sorted in the chart', () => {
        expect(
            mergeDashboardSorts(
                [{ fieldId: 'a', descending: false }],
                [{ fieldId: 'b', descending: true }],
            ),
        ).toEqual([{ fieldId: 'b', descending: true }]);
    });
});

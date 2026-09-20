import { compareFieldValues } from './useFieldValues';

describe('compareFieldValues', () => {
    it('sorts numeric suffixes in Chinese labels naturally', () => {
        const sorted = ['品牌10', '品牌2', '伊利', '蒙牛'].sort(
            compareFieldValues,
        );

        expect(sorted.indexOf('品牌2')).toBeLessThan(sorted.indexOf('品牌10'));
    });

    it('sorts YYYYMM values in descending order', () => {
        const sorted = [
            '202509',
            '202511',
            '202602',
            '202510',
            '202512',
            '202601',
        ].sort(compareFieldValues);

        expect(sorted).toEqual([
            '202602',
            '202601',
            '202512',
            '202511',
            '202510',
            '202509',
        ]);
    });
});

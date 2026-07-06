import { compareFieldValues } from './useFieldValues';

describe('compareFieldValues', () => {
    it('sorts numeric suffixes in Chinese labels naturally', () => {
        const sorted = ['品牌10', '品牌2', '伊利', '蒙牛'].sort(
            compareFieldValues,
        );

        expect(sorted.indexOf('品牌2')).toBeLessThan(sorted.indexOf('品牌10'));
    });
});

import { getCsvZipEntryNames } from './csvEntryNames';

describe('getCsvZipEntryNames', () => {
    it('keeps plain chart names when the export covers one tab', () => {
        expect(
            getCsvZipEntryNames([
                { filename: '销售额', tabName: '集团分析' },
                { filename: '品类规模', tabName: '集团分析' },
            ]),
        ).toEqual(['销售额', '品类规模']);
    });

    it('prefixes the tab name when the export spans several tabs', () => {
        expect(
            getCsvZipEntryNames([
                { filename: '销售额', tabName: '集团分析' },
                { filename: '销售额', tabName: '品牌分析' },
            ]),
        ).toEqual(['集团分析__销售额', '品牌分析__销售额']);
    });

    it('does not prefix when there are no tabs at all', () => {
        expect(
            getCsvZipEntryNames([
                { filename: '销售额' },
                { filename: '品类规模' },
            ]),
        ).toEqual(['销售额', '品类规模']);
    });

    it('keeps unprefixed entries for orphan tiles in a multi-tab export', () => {
        expect(
            getCsvZipEntryNames([
                { filename: '销售额', tabName: '集团分析' },
                { filename: '品类规模', tabName: '品牌分析' },
                { filename: '孤儿图' },
            ]),
        ).toEqual(['集团分析__销售额', '品牌分析__品类规模', '孤儿图']);
    });
});

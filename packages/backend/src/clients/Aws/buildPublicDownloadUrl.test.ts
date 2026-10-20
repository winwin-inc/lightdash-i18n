import { buildPublicDownloadUrl } from './buildPublicDownloadUrl';

describe('buildPublicDownloadUrl', () => {
    test('joins public endpoint and key', () => {
        expect(
            buildPublicDownloadUrl(
                'https://img-dev.banmahui.cn',
                'prefix/uploads/file.csv',
            ),
        ).toBe('https://img-dev.banmahui.cn/prefix/uploads/file.csv');
    });

    test('trims trailing slash on endpoint and leading slash on key', () => {
        expect(
            buildPublicDownloadUrl(
                'https://img-dev.banmahui.cn/',
                '/prefix/file.csv',
            ),
        ).toBe('https://img-dev.banmahui.cn/prefix/file.csv');
    });

    test('trims whitespace around public endpoint', () => {
        expect(
            buildPublicDownloadUrl(
                '  https://img-dev.banmahui.cn  ',
                'file.csv',
            ),
        ).toBe('https://img-dev.banmahui.cn/file.csv');
    });

    test('percent-encodes unicode and spaces in key', () => {
        expect(
            buildPublicDownloadUrl(
                'https://report-assets.example.com',
                'csv-品牌铺市率同环比_2026.csv',
            ),
        ).toBe(
            'https://report-assets.example.com/csv-%E5%93%81%E7%89%8C%E9%93%BA%E5%B8%82%E7%8E%87%E5%90%8C%E7%8E%AF%E6%AF%94_2026.csv',
        );
        expect(
            buildPublicDownloadUrl(
                'https://report-assets.example.com',
                'csv-my table_2026.csv',
            ),
        ).toBe('https://report-assets.example.com/csv-my%20table_2026.csv');
    });

    test('escapes stray percent signs so the URL stays valid (400 Bad Request regression)', () => {
        // Chart names may contain a literal %, e.g. "品牌铺市率同环比（%）".
        // Without escaping, the URL contains an invalid %-sequence and
        // nginx/Tengine replies 400 Bad Request.
        expect(
            buildPublicDownloadUrl(
                'https://report-assets.example.com',
                'csv-品牌铺市率同环比（%）_2026.csv',
            ),
        ).toBe(
            'https://report-assets.example.com/csv-%E5%93%81%E7%89%8C%E9%93%BA%E5%B8%82%E7%8E%87%E5%90%8C%E7%8E%AF%E6%AF%94%EF%BC%88%25%EF%BC%89_2026.csv',
        );
    });

    test('does not encode path separators', () => {
        expect(
            buildPublicDownloadUrl(
                'https://img-dev.banmahui.cn',
                'prefix/uploads/file name.csv',
            ),
        ).toBe(
            'https://img-dev.banmahui.cn/prefix/uploads/file%20name.csv',
        );
    });
});

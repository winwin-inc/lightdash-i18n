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
});

import { resolveDownloadSigningBucket } from './createS3DownloadSigningClient';

describe('resolveDownloadSigningBucket', () => {
    test('returns real bucket when not using download signing client', () => {
        expect(
            resolveDownloadSigningBucket(
                'qmgy-private-hz-dev',
                'https://img-dev.banmahui.cn',
                false,
            ),
        ).toBe('qmgy-private-hz-dev');
    });

    test('returns public endpoint when using download signing client', () => {
        expect(
            resolveDownloadSigningBucket(
                'qmgy-private-hz-dev',
                'https://img-dev.banmahui.cn',
                true,
            ),
        ).toBe('https://img-dev.banmahui.cn');
    });

    test('trims public endpoint whitespace', () => {
        expect(
            resolveDownloadSigningBucket(
                'qmgy-private-hz-dev',
                '  https://img-dev.banmahui.cn  ',
                true,
            ),
        ).toBe('https://img-dev.banmahui.cn');
    });

    test('falls back to real bucket when public endpoint is empty', () => {
        expect(
            resolveDownloadSigningBucket('qmgy-private-hz-dev', '  ', true),
        ).toBe('qmgy-private-hz-dev');
        expect(
            resolveDownloadSigningBucket(
                'qmgy-private-hz-dev',
                undefined,
                true,
            ),
        ).toBe('qmgy-private-hz-dev');
    });
});

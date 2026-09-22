import { splitDataAppUploadFiles } from './code';

const file = (path: string) => ({
    path,
    contentBase64: Buffer.from('ok').toString('base64'),
});

describe('splitDataAppUploadFiles', () => {
    it('accepts src/ plus dist/index.html', () => {
        const result = splitDataAppUploadFiles([
            file('src/App.jsx'),
            file('dist/index.html'),
            file('dist/assets/app.js'),
        ]);
        expect(result.sourceFiles).toHaveLength(1);
        expect(result.distFiles).toHaveLength(2);
    });

    it('rejects missing dist/index.html', () => {
        expect(() =>
            splitDataAppUploadFiles([file('src/App.jsx')]),
        ).toThrow(/dist\/index\.html/);
    });

    it('rejects files outside src/ and dist/', () => {
        expect(() =>
            splitDataAppUploadFiles([
                file('src/App.jsx'),
                file('dist/index.html'),
                file('node_modules/evil.js'),
            ]),
        ).toThrow(/src\/ or dist\//);
    });
});

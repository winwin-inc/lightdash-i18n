module.exports = {
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    rules: {
        // 同上：airbnb-base 会重新打开 no-void，而 e2e 里 `void cy.xxx()` 是惯用写法。
        'no-void': 'off',
    },
};

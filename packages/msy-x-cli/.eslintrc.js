module.exports = {
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    rules: {
        'no-console': 'off',
        'import/prefer-default-export': 'off',
        'no-restricted-syntax': 'off',
        'no-throw-literal': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        '@typescript-eslint/no-explicit-any': 'error',
    },
    overrides: [
        {
            files: ['**/*.test.ts'],
            rules: {
                '@typescript-eslint/no-floating-promises': 'off',
                'no-await-in-loop': 'off',
                'no-template-curly-in-string': 'off',
            },
        },
        {
            files: ['src/auth/**/*.ts', 'src/mcp/**/*.ts'],
            rules: {
                'import/extensions': 'off',
                'no-await-in-loop': 'off',
                'no-promise-executor-return': 'off',
                'no-continue': 'off',
                'prefer-destructuring': 'off',
            },
        },
    ],
};

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
            },
        },
        {
            files: [
                'src/http.ts',
                'src/mcp/**/*.ts',
                'src/rest/asyncQueryPoll.ts',
                'src/mcp/tools/registerContentTools.ts',
                'src/mcp/tools/registerExploreCatalogTools.ts',
            ],
            rules: {
                'import/extensions': 'off',
                'no-await-in-loop': 'off',
                'no-promise-executor-return': 'off',
            },
        },
        {
            files: ['src/mcp/tools/metricQueryToolArgs.ts'],
            rules: {
                'no-nested-ternary': 'off',
            },
        },
        {
            files: ['src/mcp/tools/registerSessionProjectTools.ts'],
            rules: {
                'no-nested-ternary': 'off',
            },
        },
        {
            files: ['src/lib/catalogSearchHeuristics.ts'],
            rules: {
                'no-continue': 'off',
            },
        },
        {
            files: ['src/lib/normalizeMetricQuery.ts', 'src/lib/contentWebUrls.ts'],
            rules: {
                'no-nested-ternary': 'off',
                'prefer-destructuring': 'off',
            },
        },
    ],
};

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
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx']
            }
        }
    },
    rules: {
        // airbnb-base 在 extends 里位于根配置之后，会把根配置的 'no-void': 'off' 覆盖掉；
        // `void` 是本仓库标记「显式忽略 promise」的惯用写法，这里显式关闭。
        'no-void': 'off',
        'import/prefer-default-export': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-console': 'off',
        'no-underscore-dangle': 'off',
        'max-classes-per-file': 'off',
        'no-case-declarations': 'off',
        'no-template-curly-in-string': 'off',
        'no-restricted-syntax': 'off',
        eqeqeq: 'error',
        '@typescript-eslint/no-floating-promises': 'error'
    },
    overrides: [
        
        {
            files: ['*.ts'], 
            rules: {
                "@typescript-eslint/no-unsafe-member-access": "error",
                "@typescript-eslint/no-unsafe-assignment": "error",
                "@typescript-eslint/no-unsafe-call": "error"
            }
        },

        {
            // Do not check this rule for existing files, new files should be error
            files: [
                'src/*.ts',
                'src/analytics/**/*.ts', // TODO fix these folders
                'src/clients/**/*.ts',
                'src/controllers/**/*.ts',
                'src/database/**/*.ts',
                'src/dbt/**/*.ts',
                'src/ee/**/*.ts',
                'src/models/**/*.ts',
                'src/services/**/*.ts',
                'src/utils/**/*.ts',
                'src/logging/**/*.ts',
                'src/scheduler/**/*.ts',
                'src/config/**/*.ts',
                'src/projectAdapters/**/*.ts',
            ], 
            rules: {
                "@typescript-eslint/no-unsafe-member-access": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-call": "off"
            }
        },
        {
            files: ['src/database/migrations/*.ts',
                'src/routers/*.ts',
                '*.mock.ts',
                '*.test.ts',
                '*.spec.ts',
            ], 
            rules: {
                "@typescript-eslint/no-unsafe-member-access": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-call": "off"
            }
        },
        {
            // Legacy files: keep the strict rule set for new code, but do not
            // block CI on historical violations in these files. New files are
            // still checked with the full rule set above.
            files: [
                'src/auth/account/index.ts',
                'src/clients/Aws/S3Client.ts',
                'src/clients/Google/GoogleDriveClient.ts',
                'src/ee/models/ExternalConnectionModel.ts',
                'src/ee/scheduler/SchedulerWorker.ts',
                'src/ee/services/ai/OrgAiCopilotConfigResolver.ts',
                'src/instrumentation/index.ts',
                'src/instrumentation/jaeger-filter-span-processor.ts',
                'src/logging/caslAuditWrapper.ts',
                'src/models/ContentModel/ContentConfigurations/DataAppContentConfiguration.ts',
                'src/models/ContentModel/ContentConfigurations/contentUnionColumns.test.ts',
                'src/models/FeatureFlagModel/FeatureFlagModel.ts',
                'src/models/OrganizationDesignModel.ts',
                'src/scheduler/SchedulerTask.ts',
                'src/services/BaseService.ts',
                'src/services/OrganizationDesignService/OrganizationDesignService.ts',
                'src/services/SchedulerService/SchedulerService.ts',
                'src/services/SpaceService/SpacePermissionService.ts',
                'src/tracing/tracing.ts',
                'src/utils/QueryBuilder/MergeQueryBuilder.test.ts',
                'src/utils/QueryBuilder/MetricQueryBuilder.test.ts',
                'src/utils/QueryBuilder/MetricQueryBuilder.ts',
                'src/utils/secureFetch/secureFetch.ts',
            ],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-unsafe-member-access': 'off',
                '@typescript-eslint/no-unsafe-assignment': 'off',
                '@typescript-eslint/no-unsafe-call': 'off',
                '@typescript-eslint/no-floating-promises': 'off',
                '@typescript-eslint/no-empty-function': 'off',
                '@typescript-eslint/no-useless-constructor': 'off',
                '@typescript-eslint/return-await': 'off',
                '@typescript-eslint/naming-convention': 'off',
                '@typescript-eslint/lines-between-class-members': 'off',
                'class-methods-use-this': 'off',
                'prefer-destructuring': 'off',
                'import/first': 'off',
                'import/order': 'off',
                'import/no-duplicates': 'off',
                'no-continue': 'off',
                'no-nested-ternary': 'off',
            },
        },
       
    ]

};

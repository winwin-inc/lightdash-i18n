import {
    chartAsCodeSchema,
    ContentAsCodeType,
    dashboardAsCodeSchema,
    getErrorMessage,
} from '@lightdash/common';
import type { ErrorObject } from 'ajv';
import chalk from 'chalk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { ajv } from '../ajv';

type LintOptions = {
    path?: string;
    verbose?: boolean;
};

type ContentFileType = 'chart' | 'dashboard';

type FileValidationResult = {
    filePath: string;
    valid: boolean;
    errors?: ErrorObject[];
    type?: ContentFileType;
};

const validateChartSchema = ajv.compile(chartAsCodeSchema);
const validateDashboardSchema = ajv.compile(dashboardAsCodeSchema);

const isYamlFile = (filePath: string): boolean =>
    filePath.endsWith('.yml') || filePath.endsWith('.yaml');

const findCodeFiles = (inputPath: string): string[] => {
    const files: string[] = [];
    const stats = fs.statSync(inputPath);

    if (stats.isFile()) {
        if (isYamlFile(inputPath) || inputPath.endsWith('.json')) {
            files.push(inputPath);
        }
        return files;
    }

    const walk = (currentPath: string) => {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        entries.forEach((entry) => {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                if (
                    !entry.name.startsWith('.') &&
                    entry.name !== 'node_modules' &&
                    entry.name !== 'target'
                ) {
                    walk(fullPath);
                }
                return;
            }
            if (
                entry.isFile() &&
                (isYamlFile(entry.name) || entry.name.endsWith('.json'))
            ) {
                files.push(fullPath);
            }
        });
    };

    walk(inputPath);
    return files;
};

const classifyFile = (
    filePath: string,
    data: Record<string, unknown> | undefined,
): ContentFileType | undefined => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('/dashboards/')) {
        return 'dashboard';
    }
    if (normalized.includes('/charts/')) {
        return 'chart';
    }
    if (data?.contentType === ContentAsCodeType.DASHBOARD) {
        return 'dashboard';
    }
    if (
        data?.contentType === ContentAsCodeType.CHART ||
        data?.contentType === ContentAsCodeType.SQL_CHART
    ) {
        return 'chart';
    }
    return undefined;
};

const isSqlChart = (data: Record<string, unknown> | undefined): boolean =>
    data?.contentType === ContentAsCodeType.SQL_CHART ||
    typeof data?.sql === 'string';

const validateFile = (filePath: string): FileValidationResult => {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = filePath.endsWith('.json')
        ? JSON.parse(fileContent)
        : yaml.load(fileContent);
    const data =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : undefined;
    const type = classifyFile(filePath, data);

    if (!type) {
        return { filePath, valid: true };
    }
    if (!data) {
        return {
            filePath,
            valid: false,
            type,
            errors: [
                {
                    keyword: 'type',
                    instancePath: '',
                    schemaPath: '#/type',
                    params: { type: 'object' },
                    message: 'must be object',
                },
            ],
        };
    }
    if (type === 'chart' && isSqlChart(data)) {
        return { filePath, valid: true, type };
    }

    const validate =
        type === 'dashboard' ? validateDashboardSchema : validateChartSchema;
    const valid = validate(data);
    if (!valid && validate.errors) {
        return {
            filePath,
            valid: false,
            type,
            errors: validate.errors,
        };
    }
    return { filePath, valid: true, type };
};

export async function lintHandler(options: LintOptions): Promise<void> {
    const searchPath = path.resolve(options.path || process.cwd());
    if (!fs.existsSync(searchPath)) {
        throw new Error(`Path does not exist: ${searchPath}`);
    }

    console.log(
        chalk.dim(`Searching for Lightdash Code files in: ${searchPath}\n`),
    );

    const codeFiles = findCodeFiles(searchPath);
    const results = codeFiles
        .map((file) => {
            try {
                return validateFile(file);
            } catch (error) {
                return {
                    filePath: file,
                    valid: false,
                    type: classifyFile(file, undefined),
                    errors: [
                        {
                            keyword: 'parse',
                            instancePath: '',
                            schemaPath: '',
                            params: {},
                            message: getErrorMessage(error),
                        },
                    ],
                } satisfies FileValidationResult;
            }
        })
        .filter((result) => result.type);

    if (results.length === 0) {
        console.log(chalk.yellow('No Lightdash Code files found.'));
        console.log(
            chalk.dim(
                'Charts and dashboards must be in charts/ or dashboards/, or declare contentType.',
            ),
        );
        return;
    }

    const invalid = results.filter((result) => !result.valid);
    const validCount = results.length - invalid.length;

    if (invalid.length === 0) {
        console.log(chalk.green('\nAll Lightdash Code files are valid.\n'));
        return;
    }

    console.log(chalk.bold(`\nValidated ${results.length} Lightdash Code files:`));
    console.log(chalk.green(`  ${validCount} valid`));
    console.log(
        chalk.red(
            `  ${invalid.length} invalid (${invalid.reduce(
                (count, result) => count + (result.errors?.length ?? 0),
                0,
            )} errors)`,
        ),
    );

    invalid.forEach((result) => {
        console.log(chalk.red(`\n${path.relative(searchPath, result.filePath)}`));
        result.errors?.forEach((error) => {
            const location = error.instancePath || '/';
            console.log(
                chalk.red(
                    `  ${location} ${error.message ?? 'is invalid'}${
                        error.params && 'missingProperty' in error.params
                            ? `: ${String(error.params.missingProperty)}`
                            : ''
                    }`,
                ),
            );
        });
    });

    process.exit(2);
}

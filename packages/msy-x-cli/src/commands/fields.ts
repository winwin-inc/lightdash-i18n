import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x fields find <query>`：在指定表内按字段标签搜索字段。
 *
 * v2 入参：`{ table（必填）, fieldSearchQueries: [{ label }], catalogTags?, page?, projectUuid? }`。
 * 无 `pageSize`（服务端固定 15）；缺 `--explore` 直接报 USAGE。
 */
const withProject = (
    args: Record<string, unknown>,
    projectUuid: string | null,
): Record<string, unknown> => {
    if (projectUuid === null) {
        return args;
    }
    return { ...args, projectUuid };
};

const requireQuery = (query: string | undefined): string => {
    if (query === undefined || query === '') {
        throw new CliError({
            code: 'USAGE',
            message: '缺少搜索关键词 <query>',
        });
    }
    return query;
};

const parsePositiveInt = (
    raw: string | boolean | undefined,
    flag: string,
): number | null => {
    if (raw === undefined || raw === false) {
        return null;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new CliError({
            code: 'USAGE',
            message: `选项 ${flag} 需要不小于 1 的整数，收到：${String(raw)}`,
        });
    }
    return value;
};

export const fieldsCommands: CommandSpec[] = [
    {
        name: 'fields find <query>',
        description: '在指定表内按字段标签搜索字段',
        options: [
            {
                flags: '--explore <name>',
                description: '目标表（exploreName），必填',
            },
            {
                flags: '--tags <a,b>',
                description: '按 catalog 标签过滤字段（逗号分隔）',
            },
            {
                flags: '--page <n>',
                description: '页码，从 1 开始',
            },
        ],
        example: 'msy-x fields find 销售额 --explore pinleibaohsm_cls_top',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const { explore } = input.options;
            if (typeof explore !== 'string' || explore === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少必填选项 --explore <name>',
                    hint: '先运行 msy-x explores list 查看可用表名（exploreName）',
                });
            }
            const args: Record<string, unknown> = {
                table: explore,
                fieldSearchQueries: [{ label: requireQuery(input.args.query) }],
            };
            const { tags } = input.options;
            if (typeof tags === 'string' && tags !== '') {
                const catalogTags = tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter((tag) => tag !== '');
                if (catalogTags.length > 0) {
                    args.catalogTags = catalogTags;
                }
            }
            const page = parsePositiveInt(input.options.page, '--page');
            if (page !== null) {
                args.page = page;
            }
            return [
                { tool: 'find_fields', args: withProject(args, input.projectUuid) },
            ];
        },
    },
];

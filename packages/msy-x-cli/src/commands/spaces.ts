import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x spaces`：space 列表与关键词搜索。
 *
 * - `list_spaces` v2 无层级/`parent` 参数；
 * - `spaces find` 只透出 `--page-size`（服务端默认 50）。
 */
const MAX_PAGE_SIZE = 100;

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

/** pageSize 合法域 1..100：低于 1 报 USAGE，超过 100 本地截断到 100 */
const parsePageSize = (raw: string | boolean | undefined): number | null => {
    const value = parsePositiveInt(raw, '--page-size');
    if (value === null) {
        return null;
    }
    return Math.min(value, MAX_PAGE_SIZE);
};

export const spacesCommands: CommandSpec[] = [
    {
        name: 'spaces list',
        description: '列出项目下的 space',
        options: [
            {
                flags: '--page <n>',
                description: '页码，从 1 开始',
            },
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
            {
                flags: '--full',
                description: '返回完整内容摘要而非紧凑格式',
            },
        ],
        example: 'msy-x spaces list',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {};
            const page = parsePositiveInt(input.options.page, '--page');
            if (page !== null) {
                args.page = page;
            }
            const pageSize = parsePageSize(input.options.pageSize);
            if (pageSize !== null) {
                args.pageSize = pageSize;
            }
            if (input.options.full === true) {
                args.full = true;
            }
            return [
                { tool: 'list_spaces', args: withProject(args, input.projectUuid) },
            ];
        },
    },
    {
        name: 'spaces find <query>',
        description: '按关键词搜索 space',
        options: [
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
        ],
        example: 'msy-x spaces find 调味品',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {
                searchQueries: [{ label: requireQuery(input.args.query) }],
            };
            const pageSize = parsePageSize(input.options.pageSize);
            if (pageSize !== null) {
                args.pageSize = pageSize;
            }
            return [
                { tool: 'find_spaces', args: withProject(args, input.projectUuid) },
            ];
        },
    },
];

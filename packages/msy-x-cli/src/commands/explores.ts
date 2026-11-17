import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x explores`：表（explore）列表与详情。
 *
 * - `list_explores` 的过滤键是 `exploreName`（CLI 侧 `--search`），v2 无 `full`；
 * - `explores show` 在 v2 语义是「看指定表详情」：`find_explores` 必填
 *   `exploreName`，不是关键词搜表（无分页参数）。
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

export const exploresCommands: CommandSpec[] = [
    {
        name: 'explores list',
        description: '列出项目下的可用表（--search 按表名过滤）',
        options: [
            {
                flags: '--search <q>',
                description: '按表名（exploreName）过滤',
            },
            {
                flags: '--page <n>',
                description: '页码，从 1 开始',
            },
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
        ],
        example: 'msy-x explores list --search pinleibaohsm_cls_top',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {};
            const { search } = input.options;
            if (typeof search === 'string' && search !== '') {
                args.exploreName = search;
            }
            const page = parsePositiveInt(input.options.page, '--page');
            if (page !== null) {
                args.page = page;
            }
            const pageSize = parsePageSize(input.options.pageSize);
            if (pageSize !== null) {
                args.pageSize = pageSize;
            }
            return [
                { tool: 'list_explores', args: withProject(args, input.projectUuid) },
            ];
        },
    },
    {
        name: 'explores show <exploreName>',
        description: '查看指定表的详情（v2 语义：必填表名，非关键词搜表）',
        options: [],
        example: 'msy-x explores show pinleibaohsm_cls_top',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const { exploreName } = input.args;
            if (exploreName === undefined || exploreName === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少位置参数 <exploreName>',
                    hint: '先运行 msy-x explores list 查看可用表名',
                });
            }
            return [
                {
                    tool: 'find_explores',
                    args: withProject({ exploreName }, input.projectUuid),
                },
            ];
        },
    },
];

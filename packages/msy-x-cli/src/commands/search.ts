import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x search <query>`：关键词搜索。无 `--type` 走 `find_content` 混合搜索，
 * 指定 chart / dashboard / space 时走对应 find_* 工具。
 *
 * v2 入参形状（find_* 四个工具共用）：`{ searchQueries: [{ label }], page?, pageSize?, full?, projectUuid? }`。
 * 服务端 pageSize 上限 100：超过 100 直接在 build 里截断，低于 1 或非整数报 USAGE。
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

/** pageSize 合法域 1..100：低于 1 报 USAGE，超过 100 本地截断到 100（不发请求前消化） */
const parsePageSize = (raw: string | boolean | undefined): number | null => {
    const value = parsePositiveInt(raw, '--page-size');
    if (value === null) {
        return null;
    }
    return Math.min(value, MAX_PAGE_SIZE);
};

const searchToolOfType = (type: string | boolean | undefined): string => {
    if (type === undefined || type === false || type === '') {
        return 'find_content';
    }
    if (type === 'chart') {
        return 'find_charts';
    }
    if (type === 'dashboard') {
        return 'find_dashboards';
    }
    if (type === 'space') {
        return 'find_spaces';
    }
    throw new CliError({
        code: 'USAGE',
        message: `未知 --type 值：${String(type)}（可选 chart|dashboard|space）`,
    });
};

export const searchCommands: CommandSpec[] = [
    {
        name: 'search <query>',
        description: '按关键词搜索图表/看板/space（缺省混合搜索全部内容）',
        options: [
            {
                flags: '--type <chart|dashboard|space>',
                description: '限定内容类型；缺省走 find_content 混合搜索',
            },
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
        example: 'msy-x search cls_insight_list --type chart',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {
                searchQueries: [{ label: requireQuery(input.args.query) }],
            };
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
                { tool: searchToolOfType(input.options.type), args: withProject(args, input.projectUuid) },
            ];
        },
    },
];

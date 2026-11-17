import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x project`：项目列表 / 切换默认项目 / 查看当前项目。
 *
 * - v2 `list_projects` 无 `full` 参数；
 * - `set_project` 写的是服务端用户默认项目（PG），非本地缓存；
 * - `project use` 的位置参数就是入参 `projectUuid` 本身，优先于全局 `--project-uuid`。
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

export const projectCommands: CommandSpec[] = [
    {
        name: 'project list',
        description: '列出当前账号有权限访问的项目',
        options: [],
        example: 'msy-x project list',
        dataCommand: false,
        build: ({ projectUuid }: CommandBuildInput): ToolCall[] => [
            { tool: 'list_projects', args: withProject({}, projectUuid) },
        ],
    },
    {
        name: 'project use <projectUuid>',
        description: '把指定项目设为服务端用户默认项目',
        options: [],
        example: 'msy-x project use <projectUuid>',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const positional = input.args.projectUuid;
            if (positional === undefined || positional === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少位置参数 <projectUuid>',
                });
            }
            // 位置参数与全局 --project-uuid 是同一入参键，命令目标必须以位置参数为准
            return [{ tool: 'set_project', args: { projectUuid: positional } }];
        },
    },
    {
        name: 'project show',
        description: '查看当前生效的默认项目及其来源',
        options: [],
        example: 'msy-x project show',
        dataCommand: false,
        build: ({ projectUuid }: CommandBuildInput): ToolCall[] => [
            { tool: 'get_current_project', args: withProject({}, projectUuid) },
        ],
    },
];

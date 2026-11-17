import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x info`：站点信息 + 版本 + 当前项目，一次产出 3 条 ToolCall。
 *
 * 约定（本目录所有命令文件一致）：
 * - `CommandBuildInput.options` 的键为 commander 归一化后的 camelCase 长选项名；
 * - `build` 是纯函数：不读 env、不发请求、不写盘、不 console；
 * - `input.projectUuid` 非 null 时合并进每条 ToolCall 的 args。
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

export const infoCommands: CommandSpec[] = [
    {
        name: 'info',
        description: '查看站点信息、Lightdash 版本与当前默认项目',
        options: [],
        example: 'msy-x info',
        dataCommand: false,
        build: ({ projectUuid }: CommandBuildInput): ToolCall[] => [
            { tool: 'get_site_info', args: withProject({}, projectUuid) },
            {
                tool: 'get_lightdash_version',
                args: withProject({}, projectUuid),
            },
            { tool: 'get_current_project', args: withProject({}, projectUuid) },
        ],
    },
];

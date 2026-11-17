import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x access`：组织角色与各项目权限；`--explores` 时服务端会按
 * queryable / metadataOnly / attributeDenied 分组列出每个项目的可用表。
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

export const accessCommands: CommandSpec[] = [
    {
        name: 'access',
        description: '查看我的组织角色与各项目权限（默认不带 explores）',
        options: [
            {
                flags: '--explores',
                description:
                    '同时列出每个项目的可用表（queryable/metadataOnly/attributeDenied）',
            },
        ],
        example: 'msy-x access --explores',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => [
            {
                tool: 'get_my_access',
                args: withProject(
                    { includeExplores: input.options.explores === true },
                    input.projectUuid,
                ),
            },
        ],
    },
];

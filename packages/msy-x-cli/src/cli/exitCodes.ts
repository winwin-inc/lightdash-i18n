/**
 * 退出码契约，见 docs/cli/msy-x-cli-design.md §8.2。
 * 豆包 CLI 连接器只看退出码与 stdout，改动这里等于改对外契约。
 */
export const ExitCode = {
    OK: 0,
    USAGE: 2,
    AUTH_REQUIRED: 3,
    FORBIDDEN: 4,
    SERVER_ERROR: 5,
    NETWORK: 6,
    PARSE_ERROR: 7,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

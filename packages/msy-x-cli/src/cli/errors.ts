import { ExitCode, ExitCodeValue } from './exitCodes';

/**
 * 稳定的错误码（英文，供 agent 分支判断）；message/hint 用中文。
 * 新增 code 时同步 docs/cli/msy-x-cli-design.md §8。
 */
export type CliErrorCode =
    | 'USAGE'
    | 'CONFIG'
    | 'AUTH_REQUIRED'
    | 'FORBIDDEN'
    | 'DASHBOARD_STRICT'
    | 'SERVER_ERROR'
    | 'NETWORK'
    | 'PARSE_ERROR'
    | 'NOT_IMPLEMENTED';

export type CliErrorArgs = {
    code: CliErrorCode;
    message: string;
    hint?: string | null;
    exitCode?: ExitCodeValue;
    cause?: unknown;
};

const DEFAULT_EXIT_CODE: Record<CliErrorCode, ExitCodeValue> = {
    USAGE: ExitCode.USAGE,
    CONFIG: ExitCode.USAGE,
    AUTH_REQUIRED: ExitCode.AUTH_REQUIRED,
    FORBIDDEN: ExitCode.FORBIDDEN,
    DASHBOARD_STRICT: ExitCode.FORBIDDEN,
    SERVER_ERROR: ExitCode.SERVER_ERROR,
    NETWORK: ExitCode.NETWORK,
    PARSE_ERROR: ExitCode.PARSE_ERROR,
    NOT_IMPLEMENTED: ExitCode.USAGE,
};

export class CliError extends Error {
    readonly code: CliErrorCode;

    readonly exitCode: ExitCodeValue;

    readonly hint: string | null;

    readonly cause: unknown;

    constructor({ code, message, hint = null, exitCode, cause }: CliErrorArgs) {
        super(message);
        this.name = 'CliError';
        this.code = code;
        this.hint = hint;
        this.cause = cause;
        this.exitCode = exitCode ?? DEFAULT_EXIT_CODE[code];
    }

    /** stderr 单行 JSON，见设计稿 §8.1 */
    toJSON(): { error: { code: CliErrorCode; message: string; hint: string | null } } {
        return {
            error: {
                code: this.code,
                message: this.message,
                hint: this.hint,
            },
        };
    }
}

/** 服务端五类看板门控 status → 统一按 FORBIDDEN 处理，文案原样透出 */
const DASHBOARD_STRICT_STATUSES = [
    'dashboard_permission_required',
    'dashboard_configuration_required',
    'dashboard_selection_required',
    'dashboard_not_found',
    'dashboard_context_unavailable',
];

export const getDashboardStrictStatuses = (): string[] => [
    ...DASHBOARD_STRICT_STATUSES,
];

/** 把任意异常归一为 CliError；未知异常一律 SERVER_ERROR，绝不吞掉原始信息 */
export const toCliError = (error: unknown): CliError => {
    if (error instanceof CliError) {
        return error;
    }
    if (error instanceof Error) {
        return new CliError({
            code: 'SERVER_ERROR',
            message: error.message,
            cause: error,
        });
    }
    return new CliError({
        code: 'SERVER_ERROR',
        message: String(error),
        cause: error,
    });
};

export const exitCodeOf = (error: unknown): ExitCodeValue =>
    toCliError(error).exitCode;

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

type CliErrorShape = {
    message: string;
    hint?: string | null;
    /**
     * 供 agent 分支的附加载荷（如看板门控的 candidates / contact /
     * dashboardUrl / action / detail）。null 或缺省表示没有附加载荷，
     * toJSON 时整个键省略。
     */
    detail?: unknown;
    cause?: unknown;
};

/**
 * code 允许任意 string（如门控直接透传服务端 `dashboard_*` status）；
 * 非内置 code 必须显式给 exitCode（类型层强制，见联合第二支）。
 */
export type CliErrorArgs =
    | (CliErrorShape & { code: CliErrorCode; exitCode?: ExitCodeValue })
    | (CliErrorShape & { code: string; exitCode: ExitCodeValue });

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
    /** 内置码（见 CliErrorCode）或服务端原样 code（如 `dashboard_*` 五类） */
    readonly code: string;

    readonly exitCode: ExitCodeValue;

    readonly hint: string | null;

    /** 附加载荷；null 表示无（toJSON 省略该键） */
    readonly detail: unknown;

    readonly cause: unknown;

    constructor({
        code,
        message,
        hint = null,
        exitCode,
        detail = null,
        cause,
    }: CliErrorArgs) {
        super(message);
        this.name = 'CliError';
        this.code = code;
        this.hint = hint;
        this.detail = detail;
        this.cause = cause;
        // 未知 code 未显式给 exitCode 时兜底 5（类型层已强制要求显式给）
        this.exitCode =
            exitCode ?? DEFAULT_EXIT_CODE[code as CliErrorCode] ?? ExitCode.SERVER_ERROR;
    }

    /** stderr 单行 JSON，见设计稿 §8.1；detail 为 null 时省略 */
    toJSON(): {
        error: {
            code: string;
            message: string;
            hint: string | null;
            detail?: unknown;
        };
    } {
        if (this.detail === null) {
            return {
                error: {
                    code: this.code,
                    message: this.message,
                    hint: this.hint,
                },
            };
        }
        return {
            error: {
                code: this.code,
                message: this.message,
                hint: this.hint,
                detail: this.detail,
            },
        };
    }
}

/** 服务端五类看板门控 status：code 原样透传，统一退 FORBIDDEN(4) */
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

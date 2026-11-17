import { CliError } from '../cli/errors';
import { ExitCode, ExitCodeValue } from '../cli/exitCodes';
import { readConfig, writeConfig } from '../config/store';
import { loginWithOAuth } from '../auth/oauth';
import { savePat } from '../auth/pat';
import { logout as revokeAndClear } from '../auth/revoke';
import type { AuthCredentials, CommandSpec, CommandContext } from '../types';

/**
 * `auth login|status|logout`（设计稿 §5.3 三条契约命令）。
 *
 * - login 是阻塞流程（等浏览器回调），**不走纯 ToolCall 通道**：
 *   `CommandSpec.build` 一律抛 NOT_IMPLEMENTED，集成层必须改调
 *   `runAuthCommand(name, opts, ctx)`；
 * - status 纯本地、离线判定：凭证存在且（access 未过期或有 refresh token）
 *   即 logged_in=true；已登录 / 未登录都退 0，靠 `logged_in` 区分；
 * - 所有 stdout 都是单行 JSON，且 `logged_in` / `logged_out` 必须是第一个键
 *   （豆包侧正则 `"logged_in"\s*:\s*true`）；
 * - CliError（CONFIG 本地读失败 / AUTH_REQUIRED 授权失败等）向外抛，
 *   由集成层统一打印 stderr 单行 JSON 并按 error.exitCode 退出。
 */

export type AuthCommandName = 'login' | 'status' | 'logout';

export type RunAuthOptions = {
    /** `--token <pat>`：走 PAT 登录；缺省时看 env MSY_X_PAT，再缺省走 OAuth */
    token?: string;
    /** `--timeout <ms>`：OAuth 等待回调超时；默认 300000 */
    timeoutMs?: number;
    /** `--no-browser`：只打印授权 URL（env MSY_X_NO_BROWSER=1 等效） */
    noBrowser?: boolean;
};

export type AuthCommandResult = {
    /** 要写到 stdout 的单行 JSON（含结尾换行） */
    stdout: string;
    exitCode: ExitCodeValue;
};

const jsonLine = (value: Record<string, unknown>): string =>
    `${JSON.stringify(value)}\n`;

/** 这些命令为本地流程，禁止走通用 ToolCall 管道 */
const localOnlyBuild =
    (name: string) =>
    (): never => {
        throw new CliError({
            code: 'NOT_IMPLEMENTED',
            message: `${name} 是本地命令，不走 ToolCall 通道`,
            hint: '集成层应调用 runAuthCommand（src/commands/auth.ts）',
        });
    };

export const authCommands: CommandSpec[] = [
    {
        name: 'auth login',
        description: '登录当前站点（默认 OAuth；--token <pat> 用 PAT）',
        options: [
            {
                flags: '--token <pat>',
                description: '用 Personal Access Token 登录（落盘 mode: pat）',
            },
            {
                flags: '--timeout <ms>',
                description: '等待浏览器授权回调的超时毫秒数（默认 300000）',
                defaultValue: '300000',
            },
            {
                flags: '--no-browser',
                description: '不拉起浏览器，把授权 URL 打到 stderr',
            },
        ],
        example: 'msy-x auth login',
        dataCommand: false,
        build: localOnlyBuild('auth login'),
    },
    {
        name: 'auth status',
        description: '查看登录状态（纯本地判定，离线可用）',
        options: [],
        example: 'msy-x auth status',
        dataCommand: false,
        build: localOnlyBuild('auth status'),
    },
    {
        name: 'auth logout',
        description: '登出并删除本机凭证（尽力 revoke，幂等）',
        options: [],
        example: 'msy-x auth logout',
        dataCommand: false,
        build: localOnlyBuild('auth logout'),
    },
];

/** PAT 来源：--token 优先，其次 env MSY_X_PAT（设计稿 §4.3 / §5.2） */
const resolvePatToken = (opts: RunAuthOptions): string | null => {
    const fromOptions =
        opts.token !== undefined ? opts.token.trim() : undefined;
    if (fromOptions === undefined) {
        const fromEnv = process.env.MSY_X_PAT?.trim();
        return fromEnv === undefined || fromEnv === '' ? null : fromEnv;
    }
    if (fromOptions === '') {
        throw new CliError({
            code: 'USAGE',
            message: '--token 不能为空',
            hint: '传入 Personal Access Token（ldpat_ 开头），或去掉 --token 走 OAuth 登录',
        });
    }
    return fromOptions;
};

const validateTimeout = (timeoutMs: number | undefined): void => {
    if (
        timeoutMs !== undefined &&
        (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    ) {
        throw new CliError({
            code: 'USAGE',
            message: `--timeout 非法：${String(timeoutMs)}`,
            hint: '传入正整数毫秒数，例如 --timeout 300000',
        });
    }
};

/** 离线判定凭证是否算已登录（与 auth status 同口径，不发请求） */
export const isLoggedInOffline = (credentials: AuthCredentials | null): boolean => {
    if (credentials === null) return false;
    if (credentials.mode === 'pat') return true;
    return (
        Date.parse(credentials.accessExpiresAt) > Date.now() ||
        credentials.refreshToken !== null
    );
};

const runLogin = async (
    opts: RunAuthOptions,
    ctx: CommandContext,
): Promise<AuthCommandResult> => {
    validateTimeout(opts.timeoutMs);
    const pat = resolvePatToken(opts);

    if (pat !== null) {
        const config = await readConfig();
        const next = savePat({ siteName: ctx.site.name, pat, config });
        await writeConfig(next);
        return {
            stdout: jsonLine({
                logged_in: true,
                site: ctx.site.name,
                authMode: 'pat',
                mode: 'login',
            }),
            exitCode: ExitCode.OK,
        };
    }

    // OAuth：失败（含超时 / 拒绝 / 网络）由 CliError 冒泡给集成层，
    // 任何失败路径都不落盘
    const credentials = await loginWithOAuth({
        site: ctx.site,
        timeoutMs: opts.timeoutMs,
        noBrowser: opts.noBrowser === true,
    });
    const config = await readConfig();
    config.auth[ctx.site.name] = credentials;
    await writeConfig(config);
    return {
        stdout: jsonLine({
            logged_in: true,
            site: ctx.site.name,
            authMode: 'oauth',
            mode: 'login',
        }),
        exitCode: ExitCode.OK,
    };
};

const runStatus = async (ctx: CommandContext): Promise<AuthCommandResult> => {
    // 纯本地：直接读配置文件；读失败 → CliError CONFIG（退 2）
    const config = await readConfig();
    const credentials = config.auth[ctx.site.name] ?? null;

    const loggedIn = isLoggedInOffline(credentials);

    return {
        stdout: jsonLine({
            logged_in: loggedIn, // 必须是第一个键（豆包正则依赖）
            site: ctx.site.name,
            authMode: credentials?.mode ?? ctx.site.authMode,
            expiresAt:
                credentials !== null && credentials.mode === 'oauth'
                    ? credentials.accessExpiresAt
                    : null,
            scope:
                credentials !== null && credentials.mode === 'oauth'
                    ? credentials.scope
                    : null,
        }),
        // 已登录 / 未登录都退 0（设计稿 §5.3）
        exitCode: ExitCode.OK,
    };
};

const runLogout = async (ctx: CommandContext): Promise<AuthCommandResult> => {
    const config = await readConfig();
    const credentials = config.auth[ctx.site.name] ?? null;
    if (credentials !== null) {
        await revokeAndClear({ site: ctx.site, credentials, config });
    }
    return {
        stdout: jsonLine({ logged_out: true, site: ctx.site.name }),
        exitCode: ExitCode.OK, // 幂等：没有凭证同样成功
    };
};

export const runAuthCommand = async (
    name: AuthCommandName,
    opts: RunAuthOptions,
    ctx: CommandContext,
): Promise<AuthCommandResult> => {
    switch (name) {
        case 'login':
            return runLogin(opts, ctx);
        case 'status':
            return runStatus(ctx);
        case 'logout':
            return runLogout(ctx);
        default: {
            const exhaustive: never = name;
            throw new CliError({
                code: 'USAGE',
                message: `未知 auth 子命令：${String(exhaustive)}`,
            });
        }
    }
};

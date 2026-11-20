import { accessSync, constants as fsConstants } from 'node:fs';
import { delimiter as pathDelimiter, join as pathJoin } from 'node:path';

/**
 * 浏览器环境探测（纯判定，不做任何拉起动作）。
 *
 * 与 `openBrowser.ts`（负责 spawn 与结果判定）分离：这里的判定被
 * `auth login` 的扫码降级决策和拉起命令选择共用，抽离后可独立单测。
 */

/** 环境变量快照（process.env 或测试注入） */
export type BrowserEnv = Record<string, string | undefined>;

/** linux 下 PATH 中的通用浏览器拉起命令，按优先级排列（wslview 由 wslu 提供） */
const LINUX_BROWSER_OPENERS = ['xdg-open', 'wslview'] as const;

const isExecutableFile = (filePath: string): boolean => {
    try {
        accessSync(filePath, fsConstants.X_OK);
        return true;
    } catch {
        return false;
    }
};

/** 命令是否在 $PATH 中且可执行（仅 linux 语义；win/darwin 不适用） */
const isExecutableInPath = (command: string, env: BrowserEnv): boolean => {
    const pathValue = env.PATH ?? '';
    return pathValue
        .split(pathDelimiter)
        .filter((dir) => dir !== '')
        .some((dir) => isExecutableFile(pathJoin(dir, command)));
};

/** WSL 环境判定（可注入便于单测） */
export const isWsl = (env: BrowserEnv = process.env): boolean =>
    env.WSL_DISTRO_NAME !== undefined ||
    (env.WSL_INTEROP !== undefined && env.WSLENV !== undefined);

/** 是否显式配置过浏览器（$BROWSER 非空） */
export const hasConfiguredBrowser = (
    env: BrowserEnv = process.env,
): boolean => env.BROWSER?.trim() !== undefined && env.BROWSER?.trim() !== '';

/**
 * PATH 里是否有可用的浏览器拉起命令（$BROWSER 之外的兜底探测；
 * win/darwin 恒 true——cmd / open 系统自带）。
 */
export const hasBrowserOpenerInPath = (
    env: BrowserEnv = process.env,
): boolean => {
    if (process.platform === 'win32' || process.platform === 'darwin') {
        return true;
    }
    return LINUX_BROWSER_OPENERS.some((name) => isExecutableInPath(name, env));
};

/**
 * WSL 且既无 `$BROWSER`、PATH 里也无任何拉起命令（xdg-open/wslview）时，
 * 浏览器 OAuth 基本注定超时——应自动降级扫码登录。只按「是 WSL」预判
 * 会误伤自带可用垫片（如 `~/.local/bin/xdg-open` 转发 powershell）或
 * 装了 wslu 的机器，故降级前必须做能力探测。
 */
export const wslNeedsQrFallback = (
    env: BrowserEnv = process.env,
): boolean =>
    isWsl(env) && !hasConfiguredBrowser(env) && !hasBrowserOpenerInPath(env);

/**
 * linux 下无 `$BROWSER` 时的拉起命令选择：按 PATH 实测挑第一个可用的
 * 通用命令（xdg-open → wslview）。都不存在时返回 'xdg-open'——spawn
 * 失败 / 非 0 退出由 openBrowser 按「打不开」处理，行为与旧版一致。
 */
export const pickLinuxOpenerCommand = (env: BrowserEnv): string =>
    LINUX_BROWSER_OPENERS.find((name) => isExecutableInPath(name, env)) ??
    'xdg-open';

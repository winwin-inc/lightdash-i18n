import { spawn } from 'node:child_process';

/**
 * 用系统默认浏览器打开授权 URL（设计稿 §5.1 / §4.3）。
 *
 * - `MSY_X_NO_BROWSER=1` 时不拉浏览器，直接返回 false（headless / CI）；
 * - win32：`cmd /c start "" <url>`（空标题占位，防 URL 被当窗口标题）；
 * - darwin：`open <url>`；其余（linux 等）：`xdg-open <url>`；
 * - 拉起失败（找不到命令等）返回 false，绝不抛错——调用方会退化为
 *   把授权 URL 打到 stderr 继续等待同一事务。
 */

export type OpenBrowserEnv = Record<string, string | undefined>;

export const NO_BROWSER_ENV_VAR = 'MSY_X_NO_BROWSER';

const browserCommand = (): { command: string; args: (url: string) => string[] } => {
    if (process.platform === 'win32') {
        return { command: 'cmd', args: (url) => ['/c', 'start', '', url] };
    }
    if (process.platform === 'darwin') {
        return { command: 'open', args: (url) => [url] };
    }
    return { command: 'xdg-open', args: (url) => [url] };
};

export const openBrowser = (
    url: string,
    env: OpenBrowserEnv = process.env,
): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
        if (env[NO_BROWSER_ENV_VAR] === '1') {
            resolve(false);
            return;
        }
        const { command, args } = browserCommand();
        try {
            const child = spawn(command, args(url), {
                stdio: 'ignore',
                detached: true,
            });
            let settled = false;
            const finish = (value: boolean): void => {
                if (settled) return;
                settled = true;
                if (value) child.unref();
                resolve(value);
            };
            child.on('error', () => finish(false));
            child.on('spawn', () => finish(true));
            // 兜底：spawn/error 事件都异常缺失时，5s 后按失败处理，绝不挂起
            setTimeout(() => finish(false), 5000).unref?.();
        } catch {
            resolve(false);
        }
    });

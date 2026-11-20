import { spawn } from 'node:child_process';
import { pickLinuxOpenerCommand, type BrowserEnv } from './browserEnv';

/**
 * 用系统默认浏览器打开授权 URL（设计稿 §5.1 / §4.3）。环境探测与
 * 拉起命令选择见 `browserEnv.ts`，这里只负责 spawn 与结果判定。
 *
 * - `MSY_X_NO_BROWSER=1` 时不拉浏览器，直接返回 false（headless / CI）；
 * - linux 上优先用 `$BROWSER`（如 WSL 配 `BROWSER=wslview` 弹 Windows
 *   浏览器）；缺省时按 PATH 实测选 xdg-open / wslview；
 * - win32：`cmd /c start "" <url>`（空标题占位，防 URL 被当窗口标题）；
 *   darwin：`open <url>`；
 * - 结果按子进程退出码判定：非 0 退出（如无桌面环境下的 stock
 *   xdg-open）视为失败；5s 仍在运行（前台长驻浏览器命令）视为成功；
 * - 拉起失败（找不到命令等）返回 false，绝不抛错——调用方会退化为
 *   把授权 URL 打到 stderr 继续等待同一事务。
 */

export const NO_BROWSER_ENV_VAR = 'MSY_X_NO_BROWSER';

const browserCommand = (
    env: BrowserEnv = process.env,
): { command: string; args: (url: string) => string[] } => {
    if (process.platform === 'win32') {
        return { command: 'cmd', args: (url) => ['/c', 'start', '', url] };
    }
    if (process.platform === 'darwin') {
        return { command: 'open', args: (url) => [url] };
    }
    const envBrowser = env.BROWSER?.trim();
    if (envBrowser) {
        // $BROWSER 支持带参数（如 BROWSER="wslview" 或 BROWSER="firefox -new-tab"）
        const [command, ...prefix] = envBrowser.split(/\s+/);
        return { command, args: (url) => [...prefix, url] };
    }
    const opener = pickLinuxOpenerCommand(env);
    return { command: opener, args: (url) => [url] };
};

export const openBrowser = (
    url: string,
    env: BrowserEnv = process.env,
): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
        if (env[NO_BROWSER_ENV_VAR] === '1') {
            resolve(false);
            return;
        }
        const { command, args } = browserCommand(env);
        try {
            const child = spawn(command, args(url), {
                stdio: 'ignore',
                detached: true,
            });
            let settled = false;
            let timer: NodeJS.Timeout | undefined;
            const finish = (value: boolean): void => {
                if (settled) return;
                settled = true;
                if (timer !== undefined) clearTimeout(timer);
                if (value) child.unref();
                resolve(value);
            };
            // 5s 仍在运行视为成功（前台浏览器命令不能等它退出）；兜底防挂起
            timer = setTimeout(() => finish(true), 5000);
            timer.unref?.();
            child.on('error', () => finish(false));
            child.on('exit', (code) => finish(code === 0));
        } catch {
            resolve(false);
        }
    });

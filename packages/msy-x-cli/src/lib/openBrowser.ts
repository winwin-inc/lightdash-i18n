import { spawn, spawnSync } from 'node:child_process';
import { pickLinuxOpenerCommand, type BrowserEnv } from './browserEnv';

/**
 * 用系统默认浏览器打开授权 URL（设计稿 §5.1 / §4.3）。环境探测与
 * 拉起命令选择见 `browserEnv.ts`，这里只负责 spawn 与结果判定。
 *
 * - `MSY_X_NO_BROWSER=1` 时不拉浏览器，直接返回 false（headless / CI）；
 * - linux 上优先用 `$BROWSER`（如 WSL 配 `BROWSER=wslview` 弹 Windows
 *   浏览器）；缺省时按 PATH 实测选 xdg-open / wslview；
 * - win32：优先**直接拉起默认浏览器的 exe**（从注册表解析 URL 关联，`spawn(exe, [url])`，
 *   URL 走 CreateProcess 参数列表，`&` 不会丢）；解析失败才回退 PowerShell
 *   `Start-Process <url>`（URL 经 `-EncodedCommand`）。**不能用 `cmd /c start "" <url>`**：
 *   授权 URL 必带 `&`，Node 在 Windows 上只给含空格/Tab 的参数加引号，`cmd` 会把 `&`
 *   当命令分隔符，浏览器只拿到 `response_type=code`；
 *   之所以不只靠 `Start-Process`/`start`：它们走 ShellExecute + URL 关联，关联坏掉的
 *   机器上会 **静默什么都不开且退码 0**（用户只看到“等待授权超时”），直接拉 exe 可验证；
 *   darwin：`open <url>`；
 * - 结果按子进程退出码判定：非 0 退出（如无桌面环境下的 stock
 *   xdg-open）视为失败；5s 仍在运行（前台长驻浏览器命令）视为成功；
 * - 拉起失败（找不到命令等）返回 false，绝不抛错——调用方会退化为
 *   把授权 URL 打到 stderr 继续等待同一事务。
 */

export const NO_BROWSER_ENV_VAR = 'MSY_X_NO_BROWSER';

const WIN32_POWERSHELL_FLAGS = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
] as const;

/**
 * win32 拉起命令（纯构造，便于在任意平台单测）。
 *
 * 走 PowerShell `-EncodedCommand`：URL 只作为脚本里的字符串字面量出现，
 * 完全不过 `cmd` 的元字符解析（`&`、`^`、`|`、`%name%`）。
 */
export const win32BrowserInvocation = (
    url: string,
): { command: string; args: string[] } => {
    const script = `Start-Process '${url.replace(/'/g, "''")}'`;
    return {
        command: 'powershell',
        args: [
            ...WIN32_POWERSHELL_FLAGS,
            Buffer.from(script, 'utf16le').toString('base64'),
        ],
    };
};

/** URL 关联键（决定 http(s) 用哪个浏览器） */
export const WIN32_URL_ASSOC_KEY =
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice';

/** `reg query` 输出里取某个值（形如 `    ProgId    REG_SZ    ChromeHTML`） */
export const parseRegQueryValue = (
    stdout: string,
    valueName?: string,
): string | null => {
    const pattern =
        valueName === undefined
            ? /^\s*(?:\S+|（默认）|\(Default\))\s+REG_SZ\s+(.+)$/m
            : new RegExp(`^\\s*${valueName}\\s+REG_SZ\\s+(.+)$`, 'm');
    const matched = stdout.match(pattern);

    return matched === null ? null : matched[1].trim();
};

/**
 * 从 `shell\open\command` 取值里取 exe 路径：
 * `"C:\...\chrome.exe" --single-argument %1` → `C:\...\chrome.exe`。
 */
export const parseBrowserExe = (command: string): string | null => {
    const quoted = command.match(/^"([^"]+\.exe)"/i);
    if (quoted !== null) {
        return quoted[1];
    }
    const bare = command.match(/^(\S+\.exe)/i);

    return bare === null ? null : bare[1];
};

/** 读一个注册表字符串值（失败/不存在返回 null，不抛错） */
const regQuery = (key: string, valueName?: string): string | null => {
    try {
        const args =
            valueName === undefined
                ? ['query', key, '/ve']
                : ['query', key, '/v', valueName];
        const result = spawnSync('reg', args, {
            encoding: 'utf8',
            windowsHide: true,
        });
        if (result.status !== 0 || typeof result.stdout !== 'string') {
            return null;
        }

        return parseRegQueryValue(result.stdout, valueName);
    } catch {
        return null;
    }
};

/**
 * 解析默认浏览器的 exe（`UserChoice.ProgId` → `<ProgId>\shell\open\command`）。
 *
 * 与 `Start-Process <url>` 的区别：这里拿到的是可执行文件，`spawn(exe, [url])`
 * 不经过 ShellExecute 与 URL 关联，关联坏了也能开，且参数不会被截断。
 */
export const resolveWindowsBrowserExe = (): string | null => {
    const progId = regQuery(WIN32_URL_ASSOC_KEY, 'ProgId');
    if (progId === null || progId === '') {
        return null;
    }
    for (const root of [
        'HKCR',
        'HKCU\\Software\\Classes',
        'HKLM\\Software\\Classes',
    ]) {
        const command = regQuery(`${root}\\${progId}\\shell\\open\\command`);
        const exe = command === null ? null : parseBrowserExe(command);
        if (exe !== null && exe !== '') {
            return exe;
        }
    }

    return null;
};

const browserCommand = (
    env: BrowserEnv = process.env,
): { command: string; args: (url: string) => string[] } => {
    if (process.platform === 'win32') {
        // 先直接拉浏览器 exe（可验证、不经 ShellExecute），解析不到再回退 PowerShell
        const exe = resolveWindowsBrowserExe();
        if (exe !== null && exe !== '') {
            return { command: exe, args: (url) => [url] };
        }

        return {
            command: 'powershell',
            args: (url) => win32BrowserInvocation(url).args,
        };
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

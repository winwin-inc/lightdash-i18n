import { redact } from './redact';

/**
 * stderr 专用日志（设计稿 §7.1：stdout 只有数据）。
 *
 * - 所有输出（message 与 data）都先过 redact()，凭证绝不进日志；
 * - `setQuiet(true)` 对应 `--quiet`：关闭 info，保留 warn / error；
 * - `debugLog` 仅在环境变量 `MSY_X_DEBUG=1` 时输出。
 */

let quiet = false;

export const setQuiet = (value: boolean): void => {
    quiet = value;
};

const isDebugEnabled = (): boolean => process.env.MSY_X_DEBUG === '1';

const serializeData = (data: unknown): string =>
    typeof data === 'string' ? data : JSON.stringify(data);

const writeLine = (
    prefix: string,
    message: string,
    data: unknown,
): void => {
    const safeMessage = redact(message);
    const messageText =
        typeof safeMessage === 'string' ? safeMessage : String(safeMessage);
    const line =
        data === undefined
            ? `${prefix} ${messageText}`
            : `${prefix} ${messageText} ${serializeData(redact(data))}`;
    process.stderr.write(`${line}\n`);
};

export const logInfo = (message: string, data?: unknown): void => {
    if (quiet) return;
    writeLine('[info]', message, data);
};

export const logWarn = (message: string, data?: unknown): void => {
    writeLine('[warn]', message, data);
};

export const logError = (message: string, data?: unknown): void => {
    writeLine('[error]', message, data);
};

export const debugLog = (message: string, data?: unknown): void => {
    if (!isDebugEnabled()) return;
    writeLine('[debug]', message, data);
};

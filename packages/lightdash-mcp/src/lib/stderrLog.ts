/**
 * MCP HTTP 进程 stderr 行日志：统一行首本地时间戳。
 * 格式：[YYYY-MM-DD HH:mm:ss.SSS] （进程本地时区）
 */

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
    if (n < 10) {
        return `00${n}`;
    }
    if (n < 100) {
        return `0${n}`;
    }
    return String(n);
}

/** 返回带方括号的本地时间戳，例如 `[2026-03-14 20:12:34.789]` */
export function formatLocalTimestamp(date: Date): string {
    const y = date.getFullYear();
    const mo = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const h = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());
    const ms = pad3(date.getMilliseconds());
    return `[${y}-${mo}-${d} ${h}:${mi}:${s}.${ms}]`;
}

/** 写一行 stderr，自动补行首时间戳与末尾换行。 */
export function writeStderrLog(line: string): void {
    const ts = formatLocalTimestamp(new Date());
    const body = line.endsWith('\n') ? line : `${line}\n`;
    process.stderr.write(`${ts} ${body}`);
}
